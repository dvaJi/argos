import type { ProviderExecutionPort, IEventPublisher } from "@argos/backend-core";
import type {
  SendMessageInput,
  MessageStartResult,
  ToolInteractionResponse,
  ToolInteractionResult,
} from "@argos/shared/types/agent-interface";
import type * as schema from "@agentclientprotocol/sdk";
import { randomUUID } from "node:crypto";
import {
  getAcpConfigOption,
  getLegacyModeState,
  hasAcpConfigStateData,
  AcpContentMapper,
  normalizeAcpConfigState,
  updateAcpConfigStateValue,
} from "@argos/acp-runtime";
import { createAcpRuntime, type AcpRuntime } from "@argos/acp-runtime";
import { runAcpDebugAction, computeAcpDiagnostics } from "@argos/acp-runtime";
import { AcpSessionPersistence } from "@argos/acp-runtime/session/acpSessionPersistence";
import type { AcpSessionRecord } from "@argos/acp-runtime/session/acpSessionManager";
import type { AcpProcessHandle } from "@argos/acp-runtime/process/acpProcessManager";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import type { BunSessionRepository } from "./bun-session-repository";
import { usageDateKey } from "./bun-session-repository";
import { createDaemonAcpPorts } from "./acpPorts";
import { createDaemonAcpSqlitePresenter } from "./daemonAcpSqlite";
import { methods as acpMethods, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { AcpConfigState, AcpAgentDiagnostics, AcpDebugRequest, AcpDebugRunResult } from "@argos/shared/presenter";

const ACP_PROVIDER_ID = "acp";

const normalizePlanStatus = (status: unknown): "pending" | "in_progress" | "completed" => {
  if (status === "completed" || status === "done") return "completed";
  if (status === "in_progress") return "in_progress";
  return "pending";
};

type PendingAcpPermission = {
  sessionId: string;
  toolCallId: string;
  options: schema.PermissionOption[];
  resolve: (response: schema.RequestPermissionResponse) => void;
};

/**
 * Daemon ACP execution adapter. Spawns and drives ACP agents via the shared
 * `createAcpRuntime`, streaming `session/update` notifications to attached
 * clients through the daemon `BunEventPublisher`.
 *
 * Sessions persist to the daemon's SQLite `acp_sessions` table (resume across
 * daemon restarts). The daemon resolves agent runtimes from `$PATH` (no bundled
 * runtime).
 */
export class AcpProviderExecutionPort implements ProviderExecutionPort {
  private runtimePromise: Promise<AcpRuntime> | null = null;
  private activeTurns = new Map<
    string,
    {
      controller: AbortController;
      eventId: string;
      runId: string;
      donePromise: Promise<void>;
      doneResolve: () => void;
    }
  >();
  private pendingPermissions = new Map<string, PendingAcpPermission>();
  private readonly contentMapper = new AcpContentMapper();

  constructor(
    private readonly configPresenter: DaemonConfigPresenter,
    private readonly sessionRepository: BunSessionRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly deps: {
      dataDir: string;
      appVersion: string;
      db: {
        prepare(sql: string): {
          get(...p: unknown[]): unknown;
          all(...p: unknown[]): unknown[];
          run(...p: unknown[]): { changes: number };
        };
      };
    },
  ) {}

  private async getRuntime(): Promise<AcpRuntime> {
    if (!this.runtimePromise) {
      this.runtimePromise = (async () => {
        const ports = createDaemonAcpPorts({
          dataDir: this.deps.dataDir,
          appVersion: this.deps.appVersion,
          eventPublisher: this.eventPublisher,
        });
        const sessionPersistence = new AcpSessionPersistence(createDaemonAcpSqlitePresenter(this.deps.db), () =>
          ports.paths.homeDir(),
        );
        const acpProvider = (
          this.configPresenter as unknown as { getProviderById(id: string): unknown }
        ).getProviderById(ACP_PROVIDER_ID) as { id: string; name: string } | undefined;
        return createAcpRuntime({
          provider: (acpProvider ?? { id: ACP_PROVIDER_ID, name: "ACP" }) as never,
          configPresenter: this.configPresenter as never,
          sessionPersistence,
          ports,
        });
      })();
    }
    return this.runtimePromise;
  }

  private async getSessionRecord(conversationId: string): Promise<AcpSessionRecord | null> {
    const runtime = await this.getRuntime();
    return runtime.sessionManager.getSession(conversationId);
  }

  async sendMessage(sessionId: string, content: string | SendMessageInput): Promise<MessageStartResult> {
    const session = await this.sessionRepository.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const agentId = session.modelId || "";
    const agents = (await this.configPresenter.getAcpAgents()) as Array<{ id: string; name: string }>;
    const agent = agents.find((entry) => entry.id === agentId);
    if (!agent) throw new Error(`ACP agent not found for model ${agentId}`);

    const text = typeof content === "string" ? content : content.text || "";
    const files = typeof content === "string" ? [] : (content.files ?? []);
    const prompt: SendMessageInput = { text, files };

    const requestId = randomUUID();

    await this.sessionRepository.addMessage(
      sessionId,
      "user",
      JSON.stringify({
        text,
        files: files.map((file) => ({
          name: file.name,
          path: file.path,
          type: file.type,
          mimeType: file.mimeType,
          size: file.size,
        })),
      }),
    );

    const assistantMessageId = await this.sessionRepository.addMessage(sessionId, "assistant", JSON.stringify([]));

    if (session.isDraft) {
      const title = text.slice(0, 80) || "New Chat";
      await this.sessionRepository.activateDraftSession(sessionId, title);
    }

    const runtime = await this.getRuntime();
    const record = await this.getSessionRecord(sessionId);
    const controller = new AbortController();
    let doneResolve!: () => void;
    const donePromise = new Promise<void>((resolve) => {
      doneResolve = resolve;
    });
    this.activeTurns.set(sessionId, {
      controller,
      eventId: assistantMessageId,
      runId: requestId,
      donePromise,
      doneResolve,
    });

    void this.runTurn(
      runtime,
      sessionId,
      agent,
      prompt,
      controller,
      requestId,
      assistantMessageId,
      record?.workdir,
    ).finally(() => {
      const current = this.activeTurns.get(sessionId);
      if (current && current.runId === requestId) {
        this.activeTurns.delete(sessionId);
      }
      doneResolve();
    });

    return { requestId, messageId: assistantMessageId };
  }

  getActiveGeneration(sessionId: string): { eventId: string; runId: string } | null {
    const active = this.activeTurns.get(sessionId);
    return active ? { eventId: active.eventId, runId: active.runId } : null;
  }

  async warmupAcpProcess(agentId: string, workdir?: string): Promise<void> {
    const runtime = await this.getRuntime();
    const agents = (await this.configPresenter.getAcpAgents()) as Array<{ id: string; name: string }>;
    const agent = agents.find((entry) => entry.id === agentId);
    if (!agent) {
      throw new Error(`ACP agent not found for model ${agentId}`);
    }

    await runtime.processManager.warmupProcess(agent as never, workdir);
  }

  async getAcpProcessConfigOptions(agentId: string, workdir?: string): Promise<AcpConfigState | null> {
    const runtime = await this.getRuntime();
    return runtime.processManager.getProcessConfigState(agentId, workdir) ?? null;
  }

  private toConnectionRef(handle: AcpProcessHandle) {
    return {
      id: `${handle.agentId}:${handle.workdir}`,
      agentId: handle.agentId,
      workdir: handle.workdir,
      protocolVersion: String(PROTOCOL_VERSION),
      capabilities: handle.agentCapabilities,
      authMethods: handle.authMethods,
      status: handle.status === "ready" ? "ready" : "error",
    };
  }

  async runAcpDebugAction(request: AcpDebugRequest): Promise<AcpDebugRunResult> {
    const runtime = await this.getRuntime();
    const acpProvider = (this.configPresenter as unknown as { getProviderById(id: string): unknown }).getProviderById(
      ACP_PROVIDER_ID,
    ) as { id: string } | undefined;
    return runAcpDebugAction({
      request,
      provider: { id: acpProvider?.id ?? ACP_PROVIDER_ID },
      getAcpAgents: () => this.configPresenter.getAcpAgents() as Promise<Array<{ id: string; name: string }>>,
      processManager: runtime.processManager,
      sessionManager: runtime.sessionManager,
      sessionPersistence: runtime.sessionPersistence,
      toConnectionRef: (handle) => this.toConnectionRef(handle),
    });
  }

  async getAcpAgentDiagnostics(agentId: string, workdir?: string | null): Promise<AcpAgentDiagnostics> {
    const runtime = await this.getRuntime();
    return computeAcpDiagnostics(runtime.processManager, agentId, workdir);
  }

  private async getAgentById(agentId: string): Promise<{ id: string; name: string } | null> {
    const agents = (await this.configPresenter.getAcpAgents()) as Array<{ id: string; name: string }>;
    return agents.find((a) => a.id === agentId) ?? null;
  }

  async prepareAcpSession(conversationId: string, agentId: string, workdir: string): Promise<void> {
    const runtime = await this.getRuntime();
    const agent = await this.getAgentById(agentId);
    if (!agent) throw new Error(`ACP agent not found: ${agentId}`);

    const requestedWorkdir = workdir?.trim();
    const persistedWorkdir =
      requestedWorkdir && runtime.sessionPersistence.isWorkdirUsable(requestedWorkdir) ? requestedWorkdir : null;
    const normalizedWorkdir = runtime.sessionPersistence.resolveWorkdir(persistedWorkdir);

    await runtime.sessionPersistence.updateWorkdir(conversationId, agent.id, persistedWorkdir);

    await runtime.sessionManager.getOrCreateSession(
      conversationId,
      agent as never,
      {
        onSessionUpdate: () => {},
        onPermission: async () => ({ outcome: { outcome: "cancelled" } }),
      },
      normalizedWorkdir,
    );

    try {
      const configState = await this.getAcpSessionConfigOptions(conversationId);
      if (configState) {
        this.eventPublisher.publish("sessions.acp.configOptions.ready", {
          conversationId,
          agentId,
          workdir: normalizedWorkdir,
          configState,
          version: 1,
        });
      }
    } catch (error) {
      console.warn(`[ACP] Failed to publish config options after prepareSession:`, error);
    }
  }

  async setAcpWorkdir(conversationId: string, agentId: string, workdir: string | null): Promise<void> {
    const runtime = await this.getRuntime();
    const requestedWorkdir = workdir?.trim() ? workdir.trim() : null;
    const trimmed =
      requestedWorkdir && runtime.sessionPersistence.isWorkdirUsable(requestedWorkdir) ? requestedWorkdir : null;

    const existing = await runtime.sessionPersistence.getSessionData(conversationId, agentId);
    const previous = existing?.workdir ?? null;
    await runtime.sessionPersistence.updateWorkdir(conversationId, agentId, trimmed);
    const previousResolved = runtime.sessionPersistence.resolveWorkdir(previous);
    const nextResolved = runtime.sessionPersistence.resolveWorkdir(trimmed);
    if (previousResolved !== nextResolved) {
      try {
        await runtime.sessionManager.clearSession(conversationId);
      } catch {
        // best-effort cleanup
      }
    }
  }

  async getAcpWorkdir(conversationId: string, agentId: string): Promise<string> {
    const runtime = await this.getRuntime();
    return runtime.sessionPersistence.getWorkdir(conversationId, agentId);
  }

  async clearAcpSession(sessionId: string): Promise<void> {
    const runtime = await this.getRuntime();
    try {
      await runtime.sessionManager.clearSession(sessionId);
    } catch {
      // best-effort cleanup
    }
  }

  async getAcpSessionModes(conversationId: string): Promise<{
    current: string;
    available: Array<{ id: string; name: string; description: string }>;
  } | null> {
    const runtime = await this.getRuntime();
    const session = runtime.sessionManager.getSession(conversationId);
    if (!session) return null;

    const { getLegacyModeState } = await import("@argos/acp-runtime");
    const legacyModeState = getLegacyModeState(session.configState);
    if (legacyModeState) {
      return {
        current: legacyModeState.currentModeId ?? session.currentModeId ?? "default",
        available: legacyModeState.availableModes,
      };
    }

    return {
      current: session.currentModeId ?? "default",
      available: session.availableModes ?? [],
    };
  }

  async setAcpSessionMode(conversationId: string, modeId: string): Promise<void> {
    const runtime = await this.getRuntime();
    const session = runtime.sessionManager.getSession(conversationId);
    if (!session) throw new Error(`ACP session not found: ${conversationId}`);

    await session.connection.agent.request(acpMethods.agent.session.setMode, {
      sessionId: session.sessionId,
      modeId,
    });
    session.currentModeId = modeId;
    session.configState =
      (await import("@argos/acp-runtime")).updateAcpConfigStateValue(
        session.configState,
        "__acp_legacy_mode__",
        modeId,
      ) ?? session.configState;
    runtime.processManager.updateBoundProcessMode(conversationId, modeId);
  }

  async getAcpProcessModes(
    agentId: string,
    workdir?: string,
  ): Promise<{
    availableModes?: Array<{ id: string; name: string; description: string }>;
    currentModeId?: string;
  } | null> {
    const runtime = await this.getRuntime();
    return runtime.processManager.getProcessModes(agentId, workdir) ?? null;
  }

  async setAcpPreferredProcessMode(agentId: string, modeId: string): Promise<void> {
    const runtime = await this.getRuntime();
    const agent = await this.getAgentById(agentId);
    if (!agent) return;
    try {
      await runtime.processManager.setPreferredMode(agent as never, "", modeId);
    } catch (error) {
      console.warn(`[ACP] Failed to set preferred mode "${modeId}" for agent ${agentId}:`, error);
    }
  }

  async resolveAgentPermission(requestId: string, granted: boolean): Promise<void> {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return;

    this.pendingPermissions.delete(requestId);
    pending.resolve(this.pickPermissionResponse(pending.options, granted));
  }

  private async runTurn(
    runtime: AcpRuntime,
    sessionId: string,
    agent: { id: string; name: string },
    prompt: SendMessageInput,
    controller: AbortController,
    requestId: string,
    assistantMessageId: string,
    workdir?: string,
  ): Promise<void> {
    const blocks: Array<Record<string, unknown>> = [];
    let planRevision = 0;
    let lastUsage: {
      used: number;
      size: number;
      cost?: schema.Cost | null;
      meta?: Record<string, unknown> | null;
    } | null = null;
    try {
      for await (const notification of runtime.runPromptTurn({
        conversationId: sessionId,
        agent: agent as never,
        prompt,
        workdir,
        onPermission: (params) => this.handlePermissionRequest(sessionId, assistantMessageId, requestId, params),
      })) {
        if (controller.signal.aborted) break;

        const mapped = this.contentMapper.map(notification);
        if (mapped.usage) {
          lastUsage = mapped.usage;
        }

        if (mapped.planEntries && mapped.planEntries.length > 0) {
          planRevision += 1;
          const plan = mapped.planEntries
            .map((entry) => ({ step: (entry.content ?? "").trim(), status: normalizePlanStatus(entry.status) }))
            .filter((item) => item.step.length > 0);
          if (plan.length > 0) {
            this.eventPublisher.publish("chat.plan.updated", {
              sessionId,
              messageId: assistantMessageId,
              plan,
              revision: planRevision,
              updatedAt: new Date().toISOString(),
            });
          }
        }

        const now = Date.now();
        for (const block of mapped.blocks) {
          if (block.type === "plan") continue;
          const last = blocks.at(-1);
          if (block.type === "content" && last?.type === "content") {
            last.content = `${last.content ?? ""}${block.content ?? ""}`;
          } else if (block.type === "reasoning_content" && last?.type === "reasoning_content") {
            last.content = `${last.content ?? ""}${block.content ?? ""}`;
          } else if (block.type === "content") {
            blocks.push({ type: "content", content: block.content ?? "", status: "loading", timestamp: now });
          } else {
            blocks.push(block);
          }
        }

        this.eventPublisher.publish("chat.stream.updated", {
          kind: "snapshot",
          requestId,
          sessionId,
          messageId: assistantMessageId,
          updatedAt: now,
          blocks,
        });
      }

      const replyBlocks = blocks.map((b) => (b.type === "content" ? { ...b, status: "success" } : b));
      const usageMetadata = lastUsage ? { usage: lastUsage } : {};
      await this.sessionRepository.finalizeAssistantMessage(
        assistantMessageId,
        replyBlocks,
        JSON.stringify({ model: agent.id, provider: "acp", ...usageMetadata }),
      );

      if (lastUsage) {
        const costAmount =
          typeof lastUsage.cost?.amount === "number" && Number.isFinite(lastUsage.cost.amount)
            ? lastUsage.cost.amount
            : null;
        this.sessionRepository.upsertUsageStat({
          messageId: assistantMessageId,
          sessionId,
          providerId: "acp",
          modelId: agent.id,
          usageDate: usageDateKey(Date.now()),
          // ACP `usage_update` carries cumulative context `used`/`size`, not
          // per-turn token splits. Token fields stay 0 (the aggregator excludes
          // ACP rows from services/breakdown anyway); the reported cost is the
          // only value that is meaningful to persist.
          inputTokens: 0,
          cachedInputTokens: 0,
          cacheWriteInputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
          costUsd: costAmount,
          costSource: costAmount !== null ? "reported" : "none",
          createdAt: Date.now(),
        });
      }

      this.eventPublisher.publish("chat.stream.updated", {
        kind: "snapshot",
        requestId,
        sessionId,
        messageId: assistantMessageId,
        updatedAt: Date.now(),
        blocks: replyBlocks,
      });
      this.eventPublisher.publish("chat.stream.completed", {
        requestId,
        sessionId,
        messageId: assistantMessageId,
        completedAt: Date.now(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.sessionRepository.setMessageError(
        assistantMessageId,
        blocks.length > 0 ? blocks : [{ type: "error", content: errorMsg, status: "error", timestamp: Date.now() }],
        JSON.stringify({ model: agent.id, provider: "acp" }),
      );
      this.eventPublisher.publish("chat.stream.failed", {
        requestId,
        sessionId,
        messageId: assistantMessageId,
        failedAt: Date.now(),
        error: errorMsg,
      });
    }
  }

  private pickPermissionResponse(
    options: schema.PermissionOption[],
    granted: boolean,
  ): schema.RequestPermissionResponse {
    const preferredKinds = granted
      ? (["allow_once", "allow_always"] as const)
      : (["reject_once", "reject_always"] as const);
    const option = preferredKinds.map((kind) => options.find((candidate) => candidate.kind === kind)).find(Boolean);
    return option
      ? { outcome: { outcome: "selected", optionId: option.optionId } }
      : { outcome: { outcome: "cancelled" } };
  }

  private async handlePermissionRequest(
    sessionId: string,
    messageId: string,
    requestId: string,
    params: schema.RequestPermissionRequest,
  ): Promise<schema.RequestPermissionResponse> {
    if ((await this.sessionRepository.getPermissionMode(sessionId)) === "full_access") {
      return this.pickPermissionResponse(params.options, true);
    }

    const toolCallId = params.toolCall.toolCallId;
    const toolName = params.toolCall.title?.trim() || toolCallId;
    const toolArgs = params.toolCall.rawInput ? JSON.stringify(params.toolCall.rawInput) : "";
    const now = Date.now();
    this.eventPublisher.publish("chat.stream.updated", {
      kind: "snapshot",
      requestId,
      sessionId,
      messageId,
      updatedAt: now,
      blocks: [
        {
          type: "action",
          action_type: "tool_call_permission",
          content: `OpenCode requests permission to run ${toolName}.`,
          status: "pending",
          timestamp: now,
          tool_call: { id: toolCallId, name: toolName, params: toolArgs },
          extra: { needsUserAction: true, permissionRequestId: toolCallId, providerId: ACP_PROVIDER_ID },
        },
      ],
    });

    return await new Promise<schema.RequestPermissionResponse>((resolve) => {
      this.pendingPermissions.set(toolCallId, { sessionId, toolCallId, options: params.options, resolve });
    });
  }

  async steerActiveTurn(sessionId: string, content: string | SendMessageInput): Promise<void> {
    await this.interruptActiveTurn(sessionId);
    await this.sendMessage(sessionId, content);
  }

  /**
   * Non-destructively interrupts the in-flight ACP prompt for a session so a new
   * turn can follow (used by steer). Unlike {@link cancelGeneration}, this does
   * NOT tear down the session or unbind the agent process: it asks the agent to
   * cancel the active `session/prompt` request, aborts local streaming, and
   * waits for the turn to settle before returning.
   */
  private async interruptActiveTurn(sessionId: string): Promise<void> {
    const active = this.activeTurns.get(sessionId);
    if (!active) return;

    active.controller.abort();

    for (const [toolCallId, pending] of this.pendingPermissions) {
      if (pending.sessionId !== sessionId) continue;
      this.pendingPermissions.delete(toolCallId);
      pending.resolve({ outcome: { outcome: "cancelled" } });
    }

    try {
      const runtime = await this.getRuntime();
      const session = runtime.sessionManager.getSession(sessionId);
      if (session) {
        await session.connection.agent.notify(acpMethods.agent.session.cancel, {
          sessionId: session.sessionId,
        } as schema.CancelNotification);
      }
    } catch (error) {
      console.warn("[ACP] Failed to send session/cancel for steer:", error);
    }

    await Promise.race([active.donePromise, new Promise<void>((resolve) => setTimeout(resolve, 4000))]).catch(() => {});
  }

  async getAcpSessionCommands(conversationId: string): Promise<
    Array<{
      name: string;
      description: string;
      input?: { hint: string } | null;
    }>
  > {
    const session = await this.getSessionRecord(conversationId);
    if (!session) {
      return [];
    }
    return session.availableCommands ?? [];
  }

  async getAcpSessionConfigOptions(conversationId: string): Promise<AcpConfigState | null> {
    const session = await this.getSessionRecord(conversationId);
    if (session?.configState) {
      console.log(`[acp] getAcpSessionConfigOptions: in-memory session hit for ${conversationId}`);
      return session.configState;
    }

    // Fallback: the ACP session may not exist in memory (e.g. after daemon
    // restart). Derive the agent + workdir from the session record and read the
    // process-level config state from the warmed-up process instead.
    const sessionRow = await this.sessionRepository.get(conversationId);
    if (!sessionRow) {
      console.log(`[acp] getAcpSessionConfigOptions: no sessionRow for ${conversationId}`);
      return null;
    }
    const agentId = sessionRow.modelId || "";
    const workdir = sessionRow.projectDir || undefined;
    console.log(`[acp] getAcpSessionConfigOptions: fallback agent=${agentId} workdir=${workdir}`);
    if (!agentId) return null;
    try {
      // Ensure the process is warmed up first.
      await this.warmupAcpProcess(agentId, workdir);
      const runtime = await this.getRuntime();

      // Config options (including model selection) come from `session/new`, not
      // `initialize`. Create (or reuse) an ACP session to populate the config
      // state, then read it from the process handle.
      const agents = (await this.configPresenter.getAcpAgents()) as Array<{ id: string; name: string }>;
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        await runtime.sessionManager.getOrCreateSession(
          conversationId,
          agent as never,
          {
            onSessionUpdate: () => {},
            onPermission: async () => ({ outcome: { outcome: "cancelled" } }),
          },
          workdir ?? null,
        );
      }

      const state = runtime.processManager.getProcessConfigState(agentId, workdir) ?? null;
      console.log(
        `[acp] getAcpSessionConfigOptions: processConfigState=${state ? `${state.options?.length ?? 0} options` : "null"}`,
      );
      return state;
    } catch (e) {
      console.warn(`[acp] getAcpSessionConfigOptions: fallback failed:`, e);
      return null;
    }
  }

  async setAcpSessionConfigOption(
    conversationId: string,
    configId: string,
    value: string | boolean,
  ): Promise<AcpConfigState | null> {
    const runtime = await this.getRuntime();
    const session = runtime.sessionManager.getSession(conversationId);
    if (!session) {
      throw new Error(`ACP session not found: ${conversationId}`);
    }

    const option = getAcpConfigOption(session.configState, configId);
    if (!option) {
      throw new Error(`ACP config option "${configId}" is unavailable for conversation ${conversationId}`);
    }

    let nextConfigState: AcpConfigState | null = null;
    if (configId === "__acp_legacy_mode__") {
      if (typeof value !== "string") {
        throw new Error("ACP legacy mode config option expects a string value");
      }
      await session.connection.agent.request(acpMethods.agent.session.setMode, {
        sessionId: session.sessionId,
        modeId: value,
      });
      session.currentModeId = value;
      nextConfigState = updateAcpConfigStateValue(session.configState, configId, value) ?? session.configState ?? null;
    } else if (configId === "__acp_legacy_model__") {
      if (typeof value !== "string") {
        throw new Error("ACP legacy model config option expects a string value");
      }
      const response = await session.connection.agent.request(acpMethods.agent.session.setConfigOption, {
        sessionId: session.sessionId,
        configId,
        value,
      });
      const normalizedResponse = normalizeAcpConfigState({
        configOptions: response.configOptions,
      });
      nextConfigState = hasAcpConfigStateData(normalizedResponse)
        ? (updateAcpConfigStateValue(session.configState, configId, value) ?? normalizedResponse)
        : (updateAcpConfigStateValue(session.configState, configId, value) ?? session.configState ?? null);
    } else {
      const response =
        typeof value === "boolean"
          ? await session.connection.agent.request(acpMethods.agent.session.setConfigOption, {
              sessionId: session.sessionId,
              configId,
              type: "boolean",
              value,
            })
          : await session.connection.agent.request(acpMethods.agent.session.setConfigOption, {
              sessionId: session.sessionId,
              configId,
              value,
            });

      const normalizedResponse = normalizeAcpConfigState({
        configOptions: response.configOptions,
      });
      nextConfigState = hasAcpConfigStateData(normalizedResponse)
        ? normalizedResponse
        : (updateAcpConfigStateValue(session.configState, configId, value) ?? session.configState ?? null);
    }

    if (!nextConfigState) {
      return null;
    }

    session.configState = nextConfigState;

    const legacyModeState = getLegacyModeState(nextConfigState);
    if (legacyModeState) {
      session.availableModes = legacyModeState.availableModes;
      session.currentModeId = legacyModeState.currentModeId ?? session.currentModeId;
    }

    const updated = runtime.processManager.updateBoundProcessConfigState(conversationId, nextConfigState);
    if (!updated) {
      console.warn(
        `[ACP] Bound process not found for conversation ${conversationId} while setting config option "${configId}".`,
      );
    }

    return nextConfigState;
  }

  async cancelGeneration(sessionId: string): Promise<void> {
    const active = this.activeTurns.get(sessionId);
    if (active) active.controller.abort();
    for (const [toolCallId, pending] of this.pendingPermissions) {
      if (pending.sessionId !== sessionId) continue;
      this.pendingPermissions.delete(toolCallId);
      pending.resolve({ outcome: { outcome: "cancelled" } });
    }
    try {
      const runtime = await this.getRuntime();
      await runtime.sessionManager.clearSession(sessionId);
    } catch {
      // best-effort cleanup
    }
  }

  async respondToolInteraction(
    sessionId: string,
    _messageId: string,
    toolCallId: string,
    response: ToolInteractionResponse,
  ): Promise<ToolInteractionResult> {
    const pending = this.pendingPermissions.get(toolCallId);
    if (!pending || pending.sessionId !== sessionId) {
      // Stale overlay: the session was interrupted/closed before the user
      // responded. Clear it gracefully instead of throwing so the renderer can
      // drop the overlay without surfacing an error.
      console.warn(`[acp] respondToolInteraction: no pending permission for ${toolCallId} (session ${sessionId})`);
      this.pendingPermissions.delete(toolCallId);
      return { handledInline: true };
    }
    if (response.kind !== "permission") {
      throw new Error("ACP permission requests only accept permission responses.");
    }

    this.pendingPermissions.delete(toolCallId);
    pending.resolve(this.pickPermissionResponse(pending.options, response.granted));
    return { handledInline: true };
  }

  async testConnection(providerId: string, modelId?: string): Promise<{ isOk: boolean; errorMsg: string | null }> {
    if (providerId !== ACP_PROVIDER_ID) {
      return { isOk: false, errorMsg: "Not an ACP provider" };
    }
    try {
      const agents = (await this.configPresenter.getAcpAgents()) as Array<{ id: string }>;
      if (modelId && !agents.some((agent) => agent.id === modelId)) {
        return { isOk: false, errorMsg: `ACP agent not found: ${modelId}` };
      }
      return { isOk: true, errorMsg: null };
    } catch (error) {
      return { isOk: false, errorMsg: error instanceof Error ? error.message : String(error) };
    }
  }
}
