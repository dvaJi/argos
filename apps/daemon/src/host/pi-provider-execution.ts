import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { IEventPublisher, ProviderExecutionPort } from "@argos/backend-core";
import { sessionsStatusChangedEvent } from "@argos/shared-contracts";
import type {
  AssistantMessageBlock,
  MessageStartResult,
  SendMessageInput,
  ToolInteractionResponse,
  ToolInteractionResult,
} from "@argos/shared/types/agent-interface";
import type { MCPToolCall, MCPToolDefinition, MCPToolResponse } from "@argos/shared/types/core/mcp";
import type { LLM_PROVIDER, MODEL_META } from "@argos/shared/presenter";
import type { BunSessionRepository } from "./bun-session-repository";
import { usageDateKey } from "./bun-session-repository";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import { LlmUtilityExecution } from "./llmUtilityExecution";
import { resolveModelCost as sharedResolveModelCost } from "./modelCost";
import { PiAgentProfileManager } from "./piAgentProfileManager";
import type { PiWorkerCommand, PiWorkerEvent, PiWorkerInit, PiWorkerProvider } from "./piWorkerProtocol";

interface PendingInteraction {
  worker: ChildProcessWithoutNullStreams;
  workerRequestId: string;
  blockId: string;
  kind: "permission" | "ui";
}

interface ActiveTurn {
  commandId: string;
  requestId: string;
  messageId: string;
  blocks: AssistantMessageBlock[];
  resolve: () => void;
  reject: (error: Error) => void;
  /** Timestamp (ms) when thinking/reasoning started, if any. */
  thinkingStart?: number;
}

interface PiWorkerHandle {
  process: ChildProcessWithoutNullStreams;
  signature: string;
  ready: Promise<void>;
  turn?: ActiveTurn;
  sessionFile?: string;
  /** Resolved at build time; avoids a per-usage-event DB read. */
  modelId?: string;
  lastUsage?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: number };
}

function resolveWorkerCommand(): { command: string; args: string[] } {
  const embeddedWorker = process.env.ARGOS_PI_WORKER_PATH;
  if (embeddedWorker) {
    return { command: embeddedWorker, args: [] };
  }
  const sourceWorker = path.join(import.meta.dir, "piWorker.ts");
  if (fs.existsSync(sourceWorker) && !process.execPath.toLowerCase().includes("argos-daemon")) {
    return { command: process.execPath, args: [sourceWorker] };
  }
  const executable = process.platform === "win32" ? "argos-pi-worker.exe" : "argos-pi-worker";
  return { command: path.join(path.dirname(process.execPath), executable), args: [] };
}

function textFromInput(content: string | SendMessageInput): string {
  return typeof content === "string" ? content : content.text || "";
}

function modelFor(provider: LLM_PROVIDER, modelId: string): MODEL_META {
  const model = [...(provider.models ?? []), ...(provider.customModels ?? [])].find((item) => item.id === modelId);
  return model ?? { id: modelId, name: modelId, group: provider.name, providerId: provider.id };
}

function resolveModelCost(configPresenter: DaemonConfigPresenter, providerId: string, modelId: string) {
  return sharedResolveModelCost(configPresenter, providerId, modelId);
}

function workerProvider(
  configPresenter: DaemonConfigPresenter,
  provider: LLM_PROVIDER,
  modelId: string,
): PiWorkerProvider {
  const model = modelFor(provider, modelId);
  const cost = resolveModelCost(configPresenter, provider.id, modelId);
  const samplingParams = configPresenter.getModelConfig(modelId, provider.id).samplingParams ?? model.samplingParams;
  return {
    id: provider.id,
    name: provider.name,
    api: provider.apiType,
    apiKey: provider.apiKey || provider.oauthToken || "",
    baseUrl: provider.baseUrl || undefined,
    model: {
      id: model.id,
      name: model.name || model.id,
      reasoning: Boolean(model.reasoning),
      input: model.vision ? ["text", "image"] : ["text"],
      contextWindow: model.contextLength || 128_000,
      maxTokens: model.maxTokens || 8_192,
      ...(samplingParams ? { samplingParams } : {}),
      ...(cost ? { cost } : {}),
    },
  };
}

function stringifyResult(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value) return "";
  const record = value as { content?: unknown };
  if (Array.isArray(record.content)) {
    return record.content
      .map((item: any) => (item?.type === "text" ? item.text : (item?.text ?? JSON.stringify(item))))
      .join("\n");
  }
  return JSON.stringify(value);
}

export class PiProviderExecutionPort implements ProviderExecutionPort {
  private readonly workers = new Map<string, PiWorkerHandle>();
  private readonly interactions = new Map<string, PendingInteraction>();
  private readonly controlWaiters = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  private readonly utilityPort: LlmUtilityExecution;

  constructor(
    private readonly configPresenter: DaemonConfigPresenter,
    private readonly sessionRepository: BunSessionRepository,
    private readonly profiles: PiAgentProfileManager,
    private readonly eventPublisher: IEventPublisher,
    private readonly mcp: {
      listTools(sessionId: string): Promise<MCPToolDefinition[]>;
      callTool(request: MCPToolCall): Promise<MCPToolResponse>;
    },
  ) {
    this.utilityPort = new LlmUtilityExecution(configPresenter);
  }

  async sendMessage(sessionId: string, content: string | SendMessageInput): Promise<MessageStartResult> {
    const session = await this.sessionRepository.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const text = textFromInput(content).trim();
    if (!text) throw new Error("Message text is required.");

    const requestId = randomUUID();
    await this.sessionRepository.addMessage(sessionId, "user", JSON.stringify({ text, files: [] }));
    const messageId = await this.sessionRepository.addMessage(sessionId, "assistant", JSON.stringify([]));
    const worker = await this.getWorker(sessionId);
    if (worker.turn) throw new Error(`Session ${sessionId} already has an active Pi turn.`);

    let activeTurn!: ActiveTurn;
    const completed = new Promise<void>((resolve, reject) => {
      activeTurn = { commandId: requestId, requestId, messageId, blocks: [], resolve, reject };
      worker.turn = activeTurn;
    });
    await this.markGenerating(sessionId);
    this.send(worker.process, { type: "prompt", id: requestId, text });

    // Mirror ACP: the route acks immediately; the turn runs in the worker and
    // streams via chat.stream.* events. Errors are published as chat.stream.failed.
    void (async () => {
      try {
        await completed;
        await this.markIdle(sessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try {
          await this.sessionRepository.setMessageError(messageId, activeTurn.blocks, JSON.stringify({ runtime: "pi" }));
        } catch {
          // Best-effort; the failed event below is the source of truth for the UI.
        }
        this.eventPublisher.publish("chat.stream.failed", {
          requestId,
          sessionId,
          messageId,
          failedAt: Date.now(),
          error: message,
        });
        await this.markIdle(sessionId).catch(() => {});
      }
    })();

    return { requestId, messageId };
  }

  private async markGenerating(sessionId: string): Promise<void> {
    await this.sessionRepository.setSessionStatus(sessionId, "generating");
    this.eventPublisher.publish(sessionsStatusChangedEvent.name, {
      sessionId,
      status: "generating",
      reason: "generation-started",
      version: 1,
    });
  }

  private async markIdle(sessionId: string): Promise<void> {
    await this.sessionRepository.setSessionStatus(sessionId, "idle");
    this.eventPublisher.publish(sessionsStatusChangedEvent.name, {
      sessionId,
      status: "idle",
      reason: "generation-completed",
      version: 1,
    });
  }

  getActiveGeneration(sessionId: string): { eventId: string; runId: string } | null {
    const turn = this.workers.get(sessionId)?.turn;
    return turn ? { eventId: turn.requestId, runId: turn.commandId } : null;
  }

  async steerActiveTurn(sessionId: string, content: string | SendMessageInput): Promise<void> {
    const worker = await this.getWorker(sessionId);
    const text = textFromInput(content).trim();
    if (!text) return;
    await this.sessionRepository.addMessage(sessionId, "user", JSON.stringify({ text, files: [] }));
    this.send(worker.process, { type: "steer", id: randomUUID(), text });
  }

  async followUp(sessionId: string, content: string | SendMessageInput): Promise<void> {
    const worker = await this.getWorker(sessionId);
    const text = textFromInput(content).trim();
    if (!text) return;
    this.send(worker.process, { type: "followUp", id: randomUUID(), text });
  }

  async cancelGeneration(sessionId: string): Promise<void> {
    const worker = this.workers.get(sessionId);
    if (!worker?.turn) return;
    this.send(worker.process, { type: "abort", id: worker.turn.commandId });
  }

  async compactSession(sessionId: string, instructions?: string): Promise<void> {
    const worker = await this.getWorker(sessionId);
    if (worker.turn) throw new Error("Cannot compact while a Pi turn is active.");
    const id = randomUUID();
    const completed = new Promise<void>((resolve, reject) => this.controlWaiters.set(id, { resolve, reject }));
    this.send(worker.process, { type: "compact", id, instructions });
    await completed;
  }

  async respondToolInteraction(
    sessionId: string,
    _messageId: string,
    toolCallId: string,
    response: ToolInteractionResponse,
  ): Promise<ToolInteractionResult> {
    const pending = this.interactions.get(toolCallId);
    if (!pending) return { handledInline: false };
    this.interactions.delete(toolCallId);
    const turn = this.workers.get(sessionId)?.turn;
    const block = turn?.blocks.find((item) => item.id === pending.blockId);
    if (pending.kind === "permission") {
      const granted = response.kind === "permission" && response.granted;
      if (block) block.status = granted ? "granted" : "denied";
      this.send(pending.worker, { type: "permissionResponse", id: pending.workerRequestId, granted });
    } else {
      const value =
        response.kind === "question_option"
          ? response.optionLabel
          : response.kind === "question_custom"
            ? response.answerText
            : response.kind === "permission"
              ? response.granted
              : undefined;
      this.send(pending.worker, { type: "uiResponse", id: pending.workerRequestId, value });
      if (block) block.status = value === undefined ? "denied" : "success";
    }
    if (turn) this.publishSnapshot(sessionId, turn);
    return { resumed: true, handledInline: true };
  }

  testConnection(providerId: string, modelId?: string) {
    return this.utilityPort.testConnection(providerId, modelId);
  }

  generateCompletion(input: Parameters<LlmUtilityExecution["generateCompletion"]>[0]) {
    return this.utilityPort.generateCompletion(input);
  }

  transcribeAudio(providerId: string, modelId: string, audio: string, mimeType: string, filename?: string) {
    return this.utilityPort.transcribeAudio(providerId, modelId, audio, mimeType, filename);
  }

  async dispose(): Promise<void> {
    for (const worker of this.workers.values()) {
      this.send(worker.process, { type: "dispose" });
    }
    this.workers.clear();
  }

  private async getWorker(sessionId: string): Promise<PiWorkerHandle> {
    const config = await this.buildInit(sessionId);
    const signature = JSON.stringify({
      cwd: config.cwd,
      agentDir: config.agentDir,
      provider: config.provider,
      disabledTools: config.disabledTools,
      projectTrusted: config.projectTrusted,
      permissionMode: config.permissionMode,
      profileFingerprint: config.profileFingerprint,
      tools: config.tools.map((tool) => tool.function.name),
      orchestrationTools: config.orchestrationTools.map((tool) => tool.function.name),
    });
    const existing = this.workers.get(sessionId);
    if (existing?.signature === signature) {
      await existing.ready;
      return existing;
    }
    if (existing) {
      this.send(existing.process, { type: "dispose" });
      this.workers.delete(sessionId);
    }

    const executable = resolveWorkerCommand();
    const child = spawn(executable.command, executable.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, PI_AGENT_DIR: config.agentDir },
    });
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const handle: PiWorkerHandle = { process: child, signature, ready, modelId: config.provider.model.id };
    this.workers.set(sessionId, handle);
    readline.createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => {
      try {
        void this.onEvent(sessionId, handle, JSON.parse(line) as PiWorkerEvent, resolveReady, rejectReady);
      } catch (error) {
        rejectReady(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stderr.on("data", (chunk) => console.error(`[pi:${sessionId}] ${String(chunk).trimEnd()}`));
    child.once("exit", (code, signal) => {
      const error = new Error(`Pi worker exited (${code ?? signal ?? "unknown"}).`);
      rejectReady(error);
      handle.turn?.reject(error);
      this.workers.delete(sessionId);
    });
    child.once("error", (error) => {
      rejectReady(error);
      handle.turn?.reject(error);
    });
    this.send(child, config);
    await ready;
    return handle;
  }

  private async buildInit(sessionId: string): Promise<PiWorkerInit> {
    const session = await this.sessionRepository.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const provider = (this.configPresenter.getProviders() as LLM_PROVIDER[]).find(
      (item) => item.id === session.providerId,
    );
    if (!provider) throw new Error(`Provider not found: ${session.providerId}`);
    const agent = await this.configPresenter.resolveArgosAgentConfig(session.agentId);
    const profileDir = this.profiles.ensureProfile(session.agentId);
    const settings = this.profiles.readSettings(session.agentId);
    const availableTools = await this.mcp.listTools(sessionId);
    const trustedProjects = Array.isArray(settings.trustedProjects) ? settings.trustedProjects : [];
    const cwd = session.projectDir || agent?.defaultProjectPath || process.cwd();
    return {
      type: "init",
      sessionId,
      cwd,
      agentDir: profileDir,
      sessionDir: this.profiles.getSessionDir(session.agentId),
      sessionFile: this.sessionRepository.getPiSessionFile(sessionId),
      systemPrompt: agent?.systemPrompt,
      provider: workerProvider(this.configPresenter, provider, session.modelId),
      thinkingLevel: (await this.sessionRepository.getGenerationSettings(sessionId))?.reasoningEffort,
      disabledTools: await this.sessionRepository.getDisabledAgentTools(sessionId),
      tools: availableTools.filter((tool) => tool.server.name !== "argos-orchestration"),
      orchestrationTools: availableTools.filter((tool) => tool.server.name === "argos-orchestration"),
      projectTrusted: trustedProjects.includes(path.resolve(cwd)),
      permissionMode: await this.sessionRepository.getPermissionMode(sessionId),
      profileFingerprint: JSON.stringify(settings),
    };
  }

  private async onEvent(
    sessionId: string,
    worker: PiWorkerHandle,
    event: PiWorkerEvent,
    resolveReady: () => void,
    rejectReady: (error: Error) => void,
  ): Promise<void> {
    if (event.type === "ready") {
      worker.sessionFile = event.sessionFile;
      if (event.sessionFile) this.sessionRepository.setPiSessionFile(sessionId, event.sessionFile);
      for (const item of event.diagnostics)
        console[item.severity === "error" ? "error" : "warn"](`[pi:${item.source}] ${item.message}`);
      resolveReady();
      return;
    }
    if (event.type === "error") {
      const error = new Error(event.message);
      if (!worker.sessionFile) rejectReady(error);
      if (event.id) {
        this.controlWaiters.get(event.id)?.reject(error);
        this.controlWaiters.delete(event.id);
      }
      worker.turn?.reject(error);
      worker.turn = undefined;
      return;
    }
    if (event.type === "diagnostic") {
      console[event.diagnostic.severity === "error" ? "error" : "warn"](
        `[pi:${event.diagnostic.source}] ${event.diagnostic.message}`,
      );
      return;
    }
    if (event.type === "notification") {
      console[event.level === "error" ? "error" : event.level === "warning" ? "warn" : "info"](
        `[pi:extension] ${event.message}`,
      );
      return;
    }
    if (event.type === "mcpRequest") {
      try {
        const response = await this.mcp.callTool({
          id: event.toolCallId,
          type: "function",
          function: { name: event.toolName, arguments: JSON.stringify(event.input) },
          conversationId: sessionId,
        });
        this.send(worker.process, { type: "mcpResponse", id: event.id, response });
      } catch (error) {
        this.send(worker.process, {
          type: "mcpResponse",
          id: event.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (event.type === "permissionRequest" || event.type === "uiRequest") {
      this.addInteraction(sessionId, worker, event);
      return;
    }

    if (event.type === "usage") {
      worker.lastUsage = {
        input: event.usage.input,
        output: event.usage.output,
        cacheRead: event.usage.cacheRead,
        cacheWrite: event.usage.cacheWrite,
        total: event.usage.total,
        cost: event.usage.cost,
      };
      const turn = worker.turn;
      if (turn) {
        const usage = worker.lastUsage;
        this.sessionRepository.upsertUsageStat({
          messageId: turn.messageId,
          sessionId,
          // The Argos (Pi) agent is its own service in the usage view; the
          // underlying configured provider stays visible via the model id.
          providerId: "argos",
          modelId: worker.modelId || "argos",
          usageDate: usageDateKey(Date.now()),
          inputTokens: usage.input,
          cachedInputTokens: usage.cacheRead,
          cacheWriteInputTokens: usage.cacheWrite,
          outputTokens: usage.output,
          reasoningTokens: 0,
          totalTokens: usage.total,
          costUsd: usage.cost > 0 ? usage.cost : null,
          costSource: usage.cost > 0 ? "reported" : "none",
          createdAt: Date.now(),
        });
      }
      return;
    }

    if (event.type === "settled" && event.id && this.controlWaiters.has(event.id)) {
      this.controlWaiters.get(event.id)!.resolve();
      this.controlWaiters.delete(event.id);
      if (event.sessionFile) this.sessionRepository.setPiSessionFile(sessionId, event.sessionFile);
      return;
    }

    const turn = worker.turn;
    if (!turn) return;
    if (event.type === "delta") {
      const type = event.kind === "thinking" ? "reasoning_content" : "content";
      const previous = turn.blocks.at(-1);
      if (previous?.type === type && previous.status === "loading")
        previous.content = `${previous.content ?? ""}${event.text}`;
      else turn.blocks.push({ type, content: event.text, status: "loading", timestamp: Date.now() });
      this.publishSnapshot(sessionId, turn);
    } else if (event.type === "thinkingStart") {
      if (turn.thinkingStart === undefined) turn.thinkingStart = Date.now();
    } else if (event.type === "thinkingEnd") {
      const start = turn.thinkingStart ?? Date.now();
      const end = Date.now();
      turn.thinkingStart = undefined;
      const block = turn.blocks.at(-1);
      if (block?.type === "reasoning_content" && block.status === "loading") {
        block.reasoning_time = { start, end };
      }
      this.publishSnapshot(sessionId, turn);
    } else if (event.type === "toolStart") {
      turn.blocks.push({
        id: event.toolCallId,
        type: "tool_call",
        status: "loading",
        timestamp: Date.now(),
        tool_call: { id: event.toolCallId, name: event.toolName, params: JSON.stringify(event.input) },
      });
      this.publishSnapshot(sessionId, turn);
    } else if (event.type === "toolEnd") {
      const block = turn.blocks.find((item) => item.id === event.toolCallId);
      if (block) {
        block.status = event.isError ? "error" : "success";
        block.tool_call = { ...block.tool_call!, response: stringifyResult(event.result) };
      }
      this.publishSnapshot(sessionId, turn);
    } else if (event.type === "bashUpdate") {
      const target =
        (event.toolCallId ? turn.blocks.find((item) => item.id === event.toolCallId) : undefined) ??
        [...turn.blocks].reverse().find((item) => item.type === "tool_call" && item.status === "loading");
      if (target && target.status === "loading") {
        target.tool_call = {
          ...target.tool_call!,
          response: `${target.tool_call?.response ?? ""}${event.delta}`,
        };
        this.publishSnapshot(sessionId, turn);
      }
    } else if (event.type === "settled") {
      for (const block of turn.blocks) if (block.status === "loading") block.status = "success";
      // If thinking never emitted thinkingEnd (e.g. the run ended mid-thought),
      // close the window with the assistant message timestamp from the worker.
      if (turn.thinkingStart !== undefined) {
        const block = turn.blocks.find((item) => item.type === "reasoning_content" && item.status === "success");
        if (block) {
          block.reasoning_time = {
            start: turn.thinkingStart,
            end: event.messageTimestamp ?? Date.now(),
          };
        }
        turn.thinkingStart = undefined;
      }
      worker.turn = undefined;
      try {
        await this.sessionRepository.finalizeAssistantMessage(
          turn.messageId,
          turn.blocks,
          JSON.stringify({ runtime: "pi" }),
        );
        this.eventPublisher.publish("chat.stream.completed", {
          requestId: turn.requestId,
          sessionId,
          messageId: turn.messageId,
          completedAt: Date.now(),
        });
        turn.resolve();
        if (event.sessionFile) this.sessionRepository.setPiSessionFile(sessionId, event.sessionFile);
      } catch (error) {
        turn.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private addInteraction(
    sessionId: string,
    worker: PiWorkerHandle,
    event: Extract<PiWorkerEvent, { type: "permissionRequest" | "uiRequest" }>,
  ): void {
    const turn = worker.turn;
    if (!turn) return;
    const blockId = event.type === "permissionRequest" ? event.toolCallId : event.id;
    const toolName = event.type === "permissionRequest" ? event.toolName : event.method;
    const params = event.type === "permissionRequest" ? event.input : event.message;
    const extra: Record<string, unknown> = { needsUserAction: true, permissionRequestId: blockId, providerId: "pi" };
    if (event.type === "uiRequest") {
      extra.questionText = event.title;
      extra.questionOptions = event.options;
      extra.questionCustom = event.method === "input" || event.method === "editor";
    }
    turn.blocks.push({
      id: blockId,
      type: "action",
      action_type: event.type === "permissionRequest" ? "tool_call_permission" : "question_request",
      content: event.type === "permissionRequest" ? `Pi requests permission to run ${toolName}.` : event.title,
      status: "pending",
      timestamp: Date.now(),
      tool_call: { id: blockId, name: toolName, params: JSON.stringify(params ?? {}) },
      extra: extra as any,
    });
    this.interactions.set(blockId, {
      worker: worker.process,
      workerRequestId: event.id,
      blockId,
      kind: event.type === "permissionRequest" ? "permission" : "ui",
    });
    this.publishSnapshot(sessionId, turn);
  }

  private publishSnapshot(sessionId: string, turn: ActiveTurn): void {
    // Persistence is not on the streaming hot path; the final content is
    // persisted by finalizeAssistantMessage on settled. A failed write here
    // must not stall or drop the live stream.
    void this.sessionRepository.updateAssistantContent(turn.messageId, turn.blocks).catch(() => {});
    this.eventPublisher.publish("chat.stream.updated", {
      kind: "snapshot",
      requestId: turn.requestId,
      sessionId,
      messageId: turn.messageId,
      updatedAt: Date.now(),
      blocks: turn.blocks,
    });
  }

  private send(worker: ChildProcessWithoutNullStreams, command: PiWorkerCommand): void {
    worker.stdin.write(`${JSON.stringify(command)}\n`);
  }
}
