import { methods as acpMethods, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type * as schema from "@agentclientprotocol/sdk";
import { BaseLLMProvider, SUMMARY_TITLES_PROMPT } from "../baseProvider";
import type {
  AcpConfigState,
  ChatMessage,
  LLMResponse,
  MCPToolDefinition,
  MODEL_META,
  ModelConfig,
  AcpAgentConfig,
  AcpDebugRequest,
  AcpDebugRunResult,
  AcpAgentDiagnostics,
  AcpTurnFinishPayload,
  AcpTurnStartPayload,
  LLM_PROVIDER,
  IConfigPresenter,
} from "@argos/shared/presenter";
import {
  createStreamEvent,
  type LLMCoreStreamEvent,
  type PermissionRequestPayload,
  type PermissionRequestOption,
} from "@argos/shared/types/core/llm-events";
import { ModelType } from "@argos/shared/model";
import { eventBus, SendTarget } from "#/eventbus";
import { ACP_DEBUG_EVENTS, ACP_WORKSPACE_EVENTS, CONFIG_EVENTS } from "#/events";
import { publishArgosEvent } from "#/routes/publishArgosEvent";
import {
  AcpContentMapper,
  AcpMessageFormatter,
  getAcpConfigOption,
  getAcpConfigOptionByCategory,
  getLegacyModeState,
  hasAcpConfigStateData,
  LEGACY_MODEL_CONFIG_ID,
  LEGACY_MODE_CONFIG_ID,
  normalizeAcpConfigState,
  updateAcpConfigStateValue,
} from "@argos/acp-runtime";
import { createAcpRuntime, type AcpRuntime } from "@argos/acp-runtime";
import { runAcpDebugAction, computeAcpDiagnostics } from "@argos/acp-runtime";
import type { SendMessageInput } from "@argos/shared/types/agent-interface";
import { AcpSessionManager } from "@argos/acp-runtime/session/acpSessionManager";
import { AcpSessionPersistence } from "@argos/acp-runtime/session/acpSessionPersistence";
import { AcpProcessManager, type AcpProcessHandle } from "@argos/acp-runtime/process/acpProcessManager";
import type { AcpSessionRecord } from "@argos/acp-runtime/session/acpSessionManager";
import { createDesktopAcpPorts } from "../acp/desktopPorts";
import { AcpPromptController } from "@argos/acp-runtime";
import { nanoid } from "nanoid";
import type { ProviderMcpRuntimePort } from "../runtimePorts";
import { resolveAcpAgentAlias } from "@argos/backend-core";

type EventQueue = {
  push: (event: LLMCoreStreamEvent | null) => void;
  next: () => Promise<LLMCoreStreamEvent | null>;
  done: () => void;
};

type RunPromptOptions = {
  onPromptSucceeded?: () => void;
};

type PermissionRequestContext = {
  agent: AcpAgentConfig;
  conversationId: string;
};

const preserveLegacyConfigOptions = (
  currentState: AcpConfigState | null | undefined,
  incomingState: AcpConfigState,
): AcpConfigState => {
  const incomingIds = new Set(incomingState.options.map((option) => option.id));
  const incomingCategories = new Set(
    incomingState.options.map((option) => option.category).filter((category): category is string => Boolean(category)),
  );
  const legacyOptions =
    currentState?.options.filter(
      (option) =>
        (option.id === LEGACY_MODEL_CONFIG_ID || option.id === LEGACY_MODE_CONFIG_ID) &&
        !incomingIds.has(option.id) &&
        (!option.category || !incomingCategories.has(option.category)),
    ) ?? [];

  return {
    source: incomingState.source,
    options: [...legacyOptions, ...incomingState.options],
  };
};

type PendingPermissionState = {
  requestId: string;
  sessionId: string;
  params: schema.RequestPermissionRequest;
  context: PermissionRequestContext;
  resolve: (response: schema.RequestPermissionResponse) => void;
  reject: (error: Error) => void;
};

type AcpSetSessionModelRequest = { sessionId: string; modelId: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const summarizePromptBlocks = (blocks: schema.ContentBlock[]) =>
  blocks.map((block) => {
    if (!isRecord(block)) {
      return { type: "unknown", keys: [] };
    }
    const record = block as unknown as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text : undefined;
    return {
      type: typeof record.type === "string" ? record.type : "unknown",
      textLength: text?.length,
      keys: Object.keys(record),
    };
  });

async function setSessionModelCompat(_connection: unknown, _params: AcpSetSessionModelRequest): Promise<unknown> {
  throw new Error("[ACP] Session model selection is not supported by this SDK connection.");
}

/**
 * Extract the current-turn user input (text + files) from the last user
 * `ChatMessage`. ACP agents own conversation history, so only this turn is
 * forwarded (the Argos system prompt is prepended separately, once).
 */
function normalizeUserMessage(message: ChatMessage | undefined): SendMessageInput {
  if (!message) return { text: "" };
  const content = message.content;
  if (typeof content === "string") {
    return { text: content, files: [] };
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
    const files = (content as Array<Record<string, unknown>>)
      .filter((part) => part.type === "file" || part.type === "image_url" || part.type === "input_image")
      .map((part) => ({
        name: typeof part.name === "string" ? part.name : "file",
        path: typeof part.path === "string" ? part.path : "",
        type: typeof part.mimeType === "string" ? part.mimeType : undefined,
        mimeType: typeof part.mimeType === "string" ? part.mimeType : undefined,
        content: typeof part.content === "string" ? part.content : undefined,
      }));
    return { text, files };
  }
  return { text: "" };
}

export class AcpProvider extends BaseLLMProvider {
  private readonly processManager: AcpProcessManager;
  private readonly sessionManager: AcpSessionManager;
  private readonly sessionPersistence: AcpSessionPersistence;
  private readonly sqlitePresenter?: {
    createConversation: (title: string, settings?: Record<string, unknown>) => Promise<string>;
  };
  private readonly acpRuntime: AcpRuntime;
  private readonly promptController: AcpPromptController;
  private readonly contentMapper = new AcpContentMapper();
  private readonly pendingPermissions = new Map<string, PendingPermissionState>();

  constructor(
    provider: LLM_PROVIDER,
    configPresenter: IConfigPresenter,
    sessionPersistence: AcpSessionPersistence,
    mcpRuntime?: ProviderMcpRuntimePort,
    sqlitePresenter?: { createConversation: (title: string, settings?: Record<string, unknown>) => Promise<string> },
  ) {
    super(provider, configPresenter, mcpRuntime);
    this.sessionPersistence = sessionPersistence;
    this.sqlitePresenter = sqlitePresenter;
    const ports = createDesktopAcpPorts();
    if (mcpRuntime) {
      ports.mcp = {
        getNpmRegistry: async () => mcpRuntime.getNpmRegistry?.() ?? null,
        getUvRegistry: async () => mcpRuntime.getUvRegistry?.() ?? null,
      };
    }
    this.acpRuntime = createAcpRuntime({
      provider,
      configPresenter,
      sessionPersistence,
      ports,
    });
    this.processManager = this.acpRuntime.processManager;
    this.sessionManager = this.acpRuntime.sessionManager;
    this.promptController = this.acpRuntime.promptController;

    void this.initWhenEnabled();
  }

  protected async fetchProviderModels(): Promise<MODEL_META[]> {
    try {
      const acpEnabled = await this.configPresenter.getAcpEnabled();
      if (!acpEnabled) {
        console.log("[ACP] fetchProviderModels: ACP is disabled, returning empty models");
        this.configPresenter.setProviderModels(this.provider.id, []);
        return [];
      }
      const agents = await this.configPresenter.getAcpAgents();
      console.log(
        `[ACP] fetchProviderModels: found ${agents.length} agents, creating models for provider "${this.provider.id}"`,
      );

      const models: MODEL_META[] = agents.map((agent) => {
        const model: MODEL_META = {
          id: agent.id,
          name: agent.name,
          group: "ACP",
          providerId: this.provider.id, // Ensure providerId is explicitly set
          isCustom: true,
          contextLength: 8192,
          maxTokens: 4096,
          description: agent.description || agent.command,
          functionCall: true,
          reasoning: false,
          enableSearch: false,
          type: ModelType.Chat,
        };

        // Validate that providerId is correctly set
        if (model.providerId !== this.provider.id) {
          console.error(
            `[ACP] fetchProviderModels: Model ${model.id} has incorrect providerId: expected "${this.provider.id}", got "${model.providerId}"`,
          );
          model.providerId = this.provider.id; // Fix it
        }

        return model;
      });

      console.log(
        `[ACP] fetchProviderModels: returning ${models.length} models, all with providerId="${this.provider.id}"`,
      );
      this.configPresenter.setProviderModels(this.provider.id, models);
      return models;
    } catch (error) {
      console.error("[ACP] fetchProviderModels: Failed to load ACP agents:", error);
      return [];
    }
  }

  public onProxyResolved(): void {
    // ACP agents run locally; no proxy handling needed
    // When provider is enabled, trigger model loading
    void this.initWhenEnabled();
  }

  public override updateConfig(provider: LLM_PROVIDER): void {
    super.updateConfig(provider);
  }

  /**
   * Override init to send MODEL_LIST_CHANGED event after initialization
   * This ensures renderer is notified when ACP provider is initialized on startup
   */
  protected async init(): Promise<void> {
    const acpEnabled = await this.configPresenter.getAcpEnabled();
    if (!acpEnabled || !this.provider.enable) return;

    try {
      this.isInitialized = true;
      await this.fetchModels();
      await this.autoEnableModelsIfNeeded();
      // Send MODEL_LIST_CHANGED event to notify renderer to refresh model list
      console.log(`[ACP] init: sending MODEL_LIST_CHANGED event for provider "${this.provider.id}"`);
      eventBus.send(CONFIG_EVENTS.MODEL_LIST_CHANGED, SendTarget.ALL_WINDOWS, this.provider.id);
      console.info("Provider initialized successfully:", this.provider.name);
    } catch (error) {
      console.warn("Provider initialization failed:", this.provider.name, error);
    }
  }

  /**
   * Handle provider enable state changes
   * Called when the provider's enable state changes to true
   */
  public async handleEnableStateChange(): Promise<void> {
    const acpEnabled = await this.configPresenter.getAcpEnabled();
    if (acpEnabled && this.provider.enable) {
      console.log("[ACP] handleEnableStateChange: ACP enabled, triggering model fetch");
      await this.fetchModels();
      // Send MODEL_LIST_CHANGED event to notify renderer to refresh model list
      console.log(`[ACP] handleEnableStateChange: sending MODEL_LIST_CHANGED event for provider "${this.provider.id}"`);
      eventBus.send(CONFIG_EVENTS.MODEL_LIST_CHANGED, SendTarget.ALL_WINDOWS, this.provider.id);
    }
  }

  public async refreshAgents(agentIds?: string[]): Promise<void> {
    const ids = agentIds?.length
      ? Array.from(new Set(agentIds))
      : (await this.configPresenter.getAcpAgents()).map((agent) => agent.id);

    const tasks = ids.map(async (agentId) => {
      try {
        await this.sessionManager.clearSessionsByAgent(agentId);
      } catch (error) {
        console.warn(`[ACP] Failed to clear sessions for agent ${agentId}:`, error);
      }

      try {
        await this.processManager.release(agentId);
      } catch (error) {
        console.warn(`[ACP] Failed to release process for agent ${agentId}:`, error);
      }
    });

    await Promise.allSettled(tasks);
  }

  public async clearSession(conversationId: string): Promise<void> {
    await this.sessionManager.clearSession(conversationId);
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

  public async check(): Promise<{ isOk: boolean; errorMsg: string | null }> {
    const enabled = await this.configPresenter.getAcpEnabled();
    if (!enabled) {
      return {
        isOk: false,
        errorMsg: "ACP is disabled",
      };
    }
    const agents = await this.configPresenter.getAcpAgents();
    if (!agents.length) {
      return {
        isOk: false,
        errorMsg: "No ACP agents configured",
      };
    }
    return { isOk: true, errorMsg: null };
  }

  public async summaryTitles(messages: ChatMessage[], modelId: string): Promise<string> {
    const promptMessages: ChatMessage[] = [{ role: "system", content: SUMMARY_TITLES_PROMPT }, ...messages];
    const response = await this.completions(promptMessages, modelId);
    return response.content || "";
  }

  public async completions(
    messages: ChatMessage[],
    modelId: string,
    temperature: number = 0.6,
    maxTokens: number = 4096,
  ): Promise<LLMResponse> {
    const modelConfig = this.configPresenter.getModelConfig(modelId, this.provider.id);
    const { content, reasoning } = await this.collectFromStream(messages, modelId, modelConfig, temperature, maxTokens);

    return {
      content,
      reasoning_content: reasoning,
    };
  }

  public async summaries(
    text: string,
    modelId: string,
    temperature: number = 0.6,
    maxTokens: number = 4096,
  ): Promise<LLMResponse> {
    return this.completions([{ role: "user", content: text }], modelId, temperature, maxTokens);
  }

  public async generateText(
    prompt: string,
    modelId: string,
    temperature: number = 0.6,
    maxTokens: number = 4096,
  ): Promise<LLMResponse> {
    return this.completions([{ role: "user", content: prompt }], modelId, temperature, maxTokens);
  }

  async *coreStream(
    messages: ChatMessage[],
    modelId: string,
    modelConfig: ModelConfig,
    _temperature: number,
    _maxTokens: number,
    _tools: MCPToolDefinition[],
  ): AsyncGenerator<LLMCoreStreamEvent> {
    const queue = this.createEventQueue();
    let session: AcpSessionRecord | null = null;

    try {
      const acpEnabled = await this.configPresenter.getAcpEnabled();
      if (!acpEnabled) {
        queue.push(createStreamEvent.error("ACP is disabled"));
        queue.done();
      } else {
        const agent = await this.getAgentById(modelId);
        if (!agent) {
          queue.push(createStreamEvent.error(`ACP agent not found: ${modelId}`));
          queue.done();
        } else {
          const conversationKey = modelConfig.conversationId ?? modelId;
          const workdir = await this.sessionPersistence.getWorkdir(conversationKey, agent.id);
          session = await this.sessionManager.getOrCreateSession(
            conversationKey,
            agent,
            {
              onSessionUpdate: (notification) =>
                this.handleSessionUpdate(conversationKey, agent.id, notification, queue),
              onPermission: (request) =>
                this.handlePermissionRequest(queue, request, {
                  agent,
                  conversationId: conversationKey,
                }),
            },
            workdir,
          );

          this.emitSessionModesReady(
            conversationKey,
            agent.id,
            session.workdir,
            session.currentModeId,
            session.availableModes,
          );
          this.emitSessionConfigOptionsReady(conversationKey, agent.id, session.workdir, session.configState);
          this.emitSessionCommandsReady(conversationKey, agent.id, session.availableCommands ?? []);

          // ACP agents own conversation history; send only the current user
          // turn. The Argos system prompt is included at most once, when the
          // local conversation first binds to this ACP session.
          let systemText: string | undefined;
          if (!session.systemPromptSent) {
            const systemMessage = messages.find((message) => message.role === "system");
            systemText =
              systemMessage && typeof systemMessage.content === "string" ? systemMessage.content.trim() : undefined;
          }
          const lastUser = [...messages].reverse().find((message) => message.role === "user");
          const userInput: SendMessageInput = normalizeUserMessage(lastUser);
          if (systemText) {
            userInput.text = `${systemText}\n\n${userInput.text}`.trim();
          }

          const activeSession = session;
          void this.runPrompt(activeSession, userInput, queue, modelConfig, {
            onPromptSucceeded: systemText
              ? () => {
                  activeSession.systemPromptSent = true;
                }
              : undefined,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      queue.push(createStreamEvent.error(`ACP: ${message}`));
      queue.done();
    }

    try {
      while (true) {
        const event = await queue.next();
        if (event === null) break;
        yield event;
      }
    } finally {
      if (session) {
        try {
          await session.connection.agent.notify(acpMethods.agent.session.cancel, { sessionId: session.sessionId });
        } catch (error) {
          console.warn("[ACP] cancel failed:", error);
        }
        this.clearPendingPermissionsForSession(session.sessionId);
      }
    }
  }

  public async getAcpWorkdir(conversationId: string, agentId: string): Promise<string> {
    return this.sessionPersistence.getWorkdir(conversationId, agentId);
  }

  public async updateAcpWorkdir(conversationId: string, agentId: string, workdir: string | null): Promise<void> {
    const requestedWorkdir = workdir?.trim() ? workdir.trim() : null;
    const trimmed =
      requestedWorkdir && this.sessionPersistence.isWorkdirUsable(requestedWorkdir) ? requestedWorkdir : null;
    if (requestedWorkdir && !trimmed) {
      console.warn(
        `[ACP] Ignoring unavailable ACP workdir "${requestedWorkdir}" for conversation ${conversationId} (agent ${agentId}); using default workdir.`,
      );
    }
    const existing = await this.sessionPersistence.getSessionData(conversationId, agentId);
    const previous = existing?.workdir ?? null;
    await this.sessionPersistence.updateWorkdir(conversationId, agentId, trimmed);
    const previousResolved = this.sessionPersistence.resolveWorkdir(previous);
    const nextResolved = this.sessionPersistence.resolveWorkdir(trimmed);
    if (previousResolved !== nextResolved) {
      try {
        await this.sessionManager.clearSession(conversationId);
      } catch (error) {
        console.warn("[ACP] Failed to clear session after workdir update:", error);
      }
    }
  }

  public async prepareSession(conversationId: string, agentId: string, workdir: string): Promise<void> {
    const requestedWorkdir = workdir?.trim();
    const persistedWorkdir =
      requestedWorkdir && this.sessionPersistence.isWorkdirUsable(requestedWorkdir) ? requestedWorkdir : null;
    const normalizedWorkdir = this.sessionPersistence.resolveWorkdir(persistedWorkdir);
    if (requestedWorkdir && !persistedWorkdir) {
      console.warn(
        `[ACP] Prepare requested unavailable workdir "${requestedWorkdir}" for conversation ${conversationId}; using "${normalizedWorkdir}".`,
      );
    }

    const agent = await this.getAgentById(agentId);
    if (!agent) {
      throw new Error(`[ACP] ACP agent not found: ${agentId}`);
    }

    await this.sessionPersistence.updateWorkdir(conversationId, agent.id, persistedWorkdir);

    const session = await this.sessionManager.getOrCreateSession(
      conversationId,
      agent,
      {
        onSessionUpdate: (notification) => this.handleSessionUpdate(conversationId, agent.id, notification),
        onPermission: async () => ({ outcome: { outcome: "cancelled" } }),
      },
      normalizedWorkdir,
    );

    this.emitSessionModesReady(
      conversationId,
      agent.id,
      session.workdir,
      session.currentModeId,
      session.availableModes,
    );
    this.emitSessionConfigOptionsReady(conversationId, agent.id, session.workdir, session.configState);
    this.emitSessionCommandsReady(conversationId, agent.id, session.availableCommands ?? []);
  }

  public async warmupProcess(agentId: string, workdir?: string): Promise<void> {
    const agent = await this.getAgentById(agentId);
    if (!agent) return;

    const requestedWorkdir = workdir?.trim();
    if (requestedWorkdir && !this.sessionPersistence.isWorkdirUsable(requestedWorkdir)) {
      console.info(
        `[ACP] Skipping warmup for agent ${agentId}: selected workdir "${requestedWorkdir}" is unavailable.`,
      );
      return;
    }

    try {
      await this.processManager.warmupProcess(agent, workdir);
    } catch (error) {
      console.warn(`[ACP] Failed to warmup ACP process for agent ${agentId}:`, error);
    }
  }

  public getProcessModes(
    agentId: string,
    workdir?: string,
  ):
    | {
        availableModes?: Array<{ id: string; name: string; description: string }>;
        currentModeId?: string;
      }
    | undefined {
    return this.processManager.getProcessModes(resolveAcpAgentAlias(agentId), workdir) ?? undefined;
  }

  public getProcessConfigOptions(agentId: string, workdir?: string): AcpConfigState | null {
    return this.processManager.getProcessConfigState(resolveAcpAgentAlias(agentId), workdir) ?? null;
  }

  public async setPreferredProcessMode(agentId: string, workdir: string, modeId: string) {
    const agent = await this.getAgentById(agentId);
    if (!agent) return;

    try {
      await this.processManager.setPreferredMode(agent, workdir, modeId);
    } catch (error) {
      console.warn(
        `[ACP] Failed to set preferred mode "${modeId}" for agent ${agentId} in workdir "${workdir}":`,
        error,
      );
    }
  }

  public async runDebugAction(request: AcpDebugRequest): Promise<AcpDebugRunResult> {
    return runAcpDebugAction({
      request,
      provider: this.provider,
      getAcpAgents: () => this.configPresenter.getAcpAgents(),
      processManager: this.processManager,
      sessionManager: this.sessionManager,
      sessionPersistence: this.sessionPersistence,
      sqlitePresenter: this.sqlitePresenter,
      toConnectionRef: (handle) => this.toConnectionRef(handle),
      onEvent: (event) => {
        if (request.webContentsId) {
          eventBus.sendToRenderer(ACP_DEBUG_EVENTS.EVENT, SendTarget.ALL_WINDOWS, {
            webContentsId: request.webContentsId,
            agentId: event.agentId,
            event,
          });
        }
      },
    });
  }

  private async persistTurnStart(input: AcpTurnStartPayload): Promise<void> {
    try {
      await this.sessionPersistence.startTurn(input);
    } catch (error) {
      console.warn("[ACP] Failed to persist turn start:", error);
    }
  }

  private async persistTurnFinish(input: AcpTurnFinishPayload): Promise<void> {
    try {
      await this.sessionPersistence.finishTurn(input);
    } catch (error) {
      console.warn("[ACP] Failed to persist turn finish:", error);
    }
  }

  private async runPrompt(
    session: AcpSessionRecord,
    input: SendMessageInput,
    queue: EventQueue,
    modelConfig: ModelConfig,
    options: RunPromptOptions = {},
  ): Promise<void> {
    const timeoutMs = this.resolveModelRequestTimeout(modelConfig);
    let timeoutId: NodeJS.Timeout | null = null;
    const conversationId = modelConfig.conversationId ?? session.conversationId;
    let turnStarted = false;
    let turnId: string | null = null;

    try {
      const turn = this.promptController.begin({
        sessionId: session.sessionId,
        conversationId,
      });
      turnId = turn.id;
      turnStarted = true;
      await this.persistTurnStart({
        id: turn.id,
        acpSessionId: session.sessionId,
        conversationId,
        userMessageId: turn.userMessageId,
        startedAt: turn.startedAt,
      });
      const requestBody = {
        sessionId: session.sessionId,
        prompt: AcpMessageFormatter.mapInput(input, session.promptCapabilities),
      };
      const promptSummary = {
        sessionId: session.sessionId,
        conversationId,
        agentId: session.agentId,
        turnId: turn.id,
        blockCount: requestBody.prompt.length,
        blocks: summarizePromptBlocks(requestBody.prompt),
        timeoutMs,
      };
      console.info(`[ACP] Sending prompt to ACP session ${session.sessionId}:`, promptSummary);
      this.processManager?.appendDebugEvent?.(session.agentId, {
        kind: "request",
        action: "session/prompt",
        sessionId: session.sessionId,
        payload: promptSummary,
      });
      await this.emitRequestTrace(modelConfig, {
        endpoint: "acp://session/prompt",
        headers: {},
        body: requestBody,
      });

      const promptRequest = session.connection.agent.request(acpMethods.agent.session.prompt, {
        sessionId: requestBody.sessionId,
        prompt: requestBody.prompt,
      });
      const response = await (timeoutMs
        ? Promise.race([
            promptRequest,
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(this.createModelRequestTimeoutError(timeoutMs));
              }, timeoutMs);
            }),
          ])
        : promptRequest);
      options.onPromptSucceeded?.();
      const responseSummary = {
        sessionId: session.sessionId,
        conversationId,
        agentId: session.agentId,
        turnId: turn.id,
        stopReason: response.stopReason,
        keys: Object.keys(response as Record<string, unknown>),
      };
      console.info(`[ACP] Prompt completed for ACP session ${session.sessionId}:`, responseSummary);
      this.processManager?.appendDebugEvent?.(session.agentId, {
        kind: "response",
        action: "session/prompt",
        sessionId: session.sessionId,
        payload: responseSummary,
      });
      const completedTurn = this.promptController.complete(session.sessionId, response.stopReason);
      if (completedTurn) {
        await this.persistTurnFinish({
          id: completedTurn.id,
          status: "completed",
          stopReason: response.stopReason,
          completedAt: completedTurn.completedAt ?? Date.now(),
        });
      }
      queue.push(createStreamEvent.stop(this.mapStopReason(response.stopReason)));
    } catch (error) {
      if (timeoutMs && error instanceof Error && error.name === "AbortError") {
        try {
          await session.connection.agent.notify(acpMethods.agent.session.cancel, { sessionId: session.sessionId });
        } catch (cancelError) {
          console.warn("[ACP] cancel after timeout failed:", cancelError);
        }
      }

      if (turnStarted) {
        const failedTurn = this.promptController.fail(session.sessionId);
        if (failedTurn) {
          await this.persistTurnFinish({
            id: failedTurn.id,
            status: "error",
            stopReason: "error",
            completedAt: failedTurn.completedAt ?? Date.now(),
          });
        } else if (turnId) {
          await this.persistTurnFinish({
            id: turnId,
            status: "error",
            stopReason: "error",
            completedAt: Date.now(),
          });
        }
      }
      const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      console.error(`[ACP] Prompt failed for ACP session ${session.sessionId}:`, error);
      this.processManager?.appendDebugEvent?.(session.agentId, {
        kind: "error",
        action: "session/prompt",
        sessionId: session.sessionId,
        message,
        payload: error instanceof Error ? { name: error.name, stack: error.stack } : error,
      });
      queue.push(createStreamEvent.error(`ACP: ${message}`));
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      queue.done();
    }
  }

  private handleSessionUpdate(
    conversationId: string,
    agentId: string,
    notification: schema.SessionNotification,
    queue?: EventQueue,
  ): void {
    const mapped = this.contentMapper.map(notification);
    mapped.events.forEach((event) => queue?.push(event));

    const currentSession = this.sessionManager.getSession(conversationId);
    if (mapped.currentModeId && currentSession) {
      currentSession.currentModeId = mapped.currentModeId;
      this.emitSessionModesReady(
        conversationId,
        agentId,
        currentSession.workdir,
        currentSession.currentModeId,
        currentSession.availableModes,
      );
    }

    if (mapped.availableCommands !== undefined) {
      if (currentSession) {
        currentSession.availableCommands = mapped.availableCommands;
      }
      this.emitSessionCommandsReady(conversationId, agentId, mapped.availableCommands);
    }

    if (mapped.configState && currentSession) {
      currentSession.configState = mapped.configState;
      const legacyModeState = getLegacyModeState(mapped.configState);
      if (legacyModeState) {
        currentSession.availableModes = legacyModeState.availableModes;
        currentSession.currentModeId = legacyModeState.currentModeId ?? currentSession.currentModeId;
        this.emitSessionModesReady(
          conversationId,
          agentId,
          currentSession.workdir,
          currentSession.currentModeId,
          currentSession.availableModes,
        );
      }

      const updated = this.processManager.updateBoundProcessConfigState(conversationId, mapped.configState);
      if (!updated) {
        console.warn(`[ACP] Bound process not found for conversation ${conversationId} while updating config state.`);
      }

      this.emitSessionConfigOptionsReady(conversationId, agentId, currentSession.workdir, mapped.configState);
    }

    if ((mapped.sessionInfo || mapped.usage) && currentSession) {
      const metadata = {
        ...currentSession.metadata,
        ...(mapped.sessionInfo
          ? {
              acpSessionInfo: mapped.sessionInfo,
            }
          : {}),
        ...(mapped.usage
          ? {
              acpUsage: mapped.usage,
            }
          : {}),
      };
      currentSession.metadata = metadata;
      void this.sessionPersistence.mergeMetadata(conversationId, agentId, metadata).catch((error) => {
        console.warn("[ACP] Failed to persist ACP session update metadata:", error);
      });
    }
  }

  private emitSessionModesReady(
    conversationId: string,
    agentId: string,
    workdir: string,
    currentModeId?: string,
    availableModes?: Array<{ id: string; name: string; description: string }>,
  ): void {
    eventBus.sendToRenderer(ACP_WORKSPACE_EVENTS.SESSION_MODES_READY, SendTarget.ALL_WINDOWS, {
      conversationId,
      agentId,
      workdir,
      current: currentModeId ?? "default",
      available: availableModes ?? [],
    });
  }

  private emitSessionCommandsReady(
    conversationId: string,
    agentId: string,
    commands: Array<{
      name: string;
      description: string;
      input?: { hint: string } | null;
    }>,
  ): void {
    eventBus.sendToRenderer(ACP_WORKSPACE_EVENTS.SESSION_COMMANDS_READY, SendTarget.ALL_WINDOWS, {
      conversationId,
      agentId,
      commands,
    });
    publishArgosEvent("sessions.acp.commands.ready", {
      conversationId,
      agentId,
      commands,
      version: Date.now(),
    });
  }

  private emitSessionConfigOptionsReady(
    conversationId: string,
    agentId: string,
    workdir: string,
    configState?: AcpConfigState | null,
  ): void {
    eventBus.sendToRenderer(ACP_WORKSPACE_EVENTS.SESSION_CONFIG_OPTIONS_READY, SendTarget.ALL_WINDOWS, {
      conversationId,
      agentId,
      workdir,
      configState: configState ?? normalizeAcpConfigState({}),
    });
    publishArgosEvent("sessions.acp.configOptions.ready", {
      conversationId,
      agentId,
      workdir,
      configState: configState ?? normalizeAcpConfigState({}),
      version: Date.now(),
    });
  }

  private async handlePermissionRequest(
    queue: EventQueue,
    params: schema.RequestPermissionRequest,
    context: PermissionRequestContext,
  ): Promise<schema.RequestPermissionResponse> {
    const { requestId, promise } = this.registerPendingPermission(params, context);

    const toolLabel = params.toolCall.title ?? params.toolCall.toolCallId;
    queue.push(createStreamEvent.reasoning(`ACP agent "${context.agent.name}" requests permission: ${toolLabel}`));
    queue.push(createStreamEvent.permission(this.buildPermissionPayload(params, context, requestId)));

    return await promise;
  }

  private registerPendingPermission(
    params: schema.RequestPermissionRequest,
    context: PermissionRequestContext,
  ): { requestId: string; promise: Promise<schema.RequestPermissionResponse> } {
    const requestId = nanoid();

    const promise = new Promise<schema.RequestPermissionResponse>((resolve, reject) => {
      this.pendingPermissions.set(requestId, {
        requestId,
        sessionId: params.sessionId,
        params,
        context,
        resolve,
        reject,
      });
    });

    return { requestId, promise };
  }

  private buildPermissionPayload(
    params: schema.RequestPermissionRequest,
    context: PermissionRequestContext,
    requestId: string,
  ): PermissionRequestPayload {
    const permissionType = this.mapPermissionType(params.toolCall.kind);
    const toolName = params.toolCall.title?.trim() || params.toolCall.toolCallId;
    const command = this.extractCommand(params.toolCall);
    const options: PermissionRequestOption[] = params.options.map((option) => ({
      optionId: option.optionId,
      kind: option.kind,
      name: option.name,
    }));

    return {
      providerId: this.provider.id,
      providerName: this.provider.name,
      requestId,
      sessionId: params.sessionId,
      conversationId: context.conversationId,
      agentId: context.agent.id,
      agentName: context.agent.name,
      tool_call_id: params.toolCall.toolCallId,
      tool_call_name: toolName,
      tool_call_params: this.summarizeToolCallParams(params.toolCall),
      description: `components.messageBlockPermissionRequest.description.${permissionType}`,
      permissionType,
      server_name: context.agent.name,
      server_description: context.agent.command,
      ...(command ? { command } : {}),
      options,
      metadata: { rememberable: false },
    };
  }

  private summarizeToolCallParams(toolCall: schema.RequestPermissionRequest["toolCall"]): string {
    if (toolCall.locations?.length) {
      const uniquePaths = Array.from(new Set(toolCall.locations.map((location) => location.path)));
      return uniquePaths.slice(0, 3).join(", ");
    }
    if (toolCall.rawInput && Object.keys(toolCall.rawInput).length > 0) {
      try {
        return JSON.stringify(toolCall.rawInput);
      } catch (error) {
        console.warn("[ACP] Failed to stringify rawInput for permission request:", error);
      }
    }
    return toolCall.toolCallId;
  }

  private extractCommand(toolCall: schema.RequestPermissionRequest["toolCall"]): string | undefined {
    const rawInput = toolCall.rawInput;
    if (!rawInput || typeof rawInput !== "object") {
      return undefined;
    }

    const command = (rawInput as Record<string, unknown>).command;
    if (typeof command !== "string" || !command.trim()) {
      return undefined;
    }

    return command.trim();
  }

  private mapPermissionType(kind?: schema.ToolKind | null): "read" | "write" | "all" | "command" {
    switch (kind) {
      case "read":
      case "fetch":
      case "search":
        return "read";
      case "edit":
      case "delete":
      case "move":
        return "write";
      case "execute":
        return "command";
      default:
        return "all";
    }
  }

  private pickPermissionOption(
    options: schema.PermissionOption[],
    decision: "allow" | "deny",
  ): schema.PermissionOption | null {
    const allowOrder: schema.PermissionOption["kind"][] = ["allow_once", "allow_always"];
    const denyOrder: schema.PermissionOption["kind"][] = ["reject_once", "reject_always"];
    const order = decision === "allow" ? allowOrder : denyOrder;
    for (const kind of order) {
      const match = options.find((option) => option.kind === kind);
      if (match) {
        return match;
      }
    }
    return null;
  }

  public async resolvePermissionRequest(requestId: string, granted: boolean): Promise<void> {
    const state = this.pendingPermissions.get(requestId);
    if (!state) {
      throw new Error(`Unknown ACP permission request: ${requestId}`);
    }

    this.pendingPermissions.delete(requestId);

    const option = this.pickPermissionOption(state.params.options, granted ? "allow" : "deny");
    if (option) {
      state.resolve({ outcome: { outcome: "selected", optionId: option.optionId } });
    } else if (granted) {
      console.warn("[ACP] No matching permission option for grant, defaulting to cancel");
      state.resolve({ outcome: { outcome: "cancelled" } });
    } else {
      state.resolve({ outcome: { outcome: "cancelled" } });
    }
  }

  private clearPendingPermissionsForSession(sessionId: string): void {
    for (const [requestId, state] of this.pendingPermissions.entries()) {
      if (state.sessionId === sessionId) {
        this.pendingPermissions.delete(requestId);
        state.resolve({ outcome: { outcome: "cancelled" } });
      }
    }
  }

  private async collectFromStream(
    messages: ChatMessage[],
    modelId: string,
    modelConfig: ModelConfig,
    temperature: number,
    maxTokens: number,
  ): Promise<{ content: string; reasoning: string }> {
    const mergedConfig: ModelConfig = {
      ...modelConfig,
      temperature: temperature ?? modelConfig.temperature,
      maxTokens: maxTokens ?? modelConfig.maxTokens,
    };

    let content = "";
    let reasoning = "";
    for await (const chunk of this.coreStream(messages, modelId, mergedConfig, temperature, maxTokens, [])) {
      console.log("[ACP] collectFromStream: chunk:", chunk);
      if (chunk.type === "text" && chunk.content) {
        content += chunk.content;
      } else if (chunk.type === "reasoning" && chunk.reasoning_content) {
        reasoning += chunk.reasoning_content;
      }
    }
    return { content, reasoning };
  }

  private mapStopReason(
    reason: schema.PromptResponse["stopReason"],
  ): "tool_use" | "max_tokens" | "stop_sequence" | "error" | "complete" {
    switch (reason) {
      case "max_tokens":
        return "max_tokens";
      case "max_turn_requests":
        return "stop_sequence";
      case "cancelled":
        return "error";
      case "refusal":
        return "error";
      case "end_turn":
      default:
        return "complete";
    }
  }

  private createEventQueue(): EventQueue {
    const queue: Array<LLMCoreStreamEvent | null> = [];
    let resolver: ((value: LLMCoreStreamEvent | null) => void) | null = null;

    return {
      push: (event) => {
        if (resolver) {
          resolver(event);
          resolver = null;
        } else {
          queue.push(event);
        }
      },
      next: async () => {
        if (queue.length > 0) {
          return queue.shift() ?? null;
        }
        return await new Promise<LLMCoreStreamEvent | null>((resolve) => {
          resolver = resolve;
        });
      },
      done: () => {
        if (resolver) {
          resolver(null);
          resolver = null;
        } else {
          queue.push(null);
        }
      },
    };
  }

  private async getAgentById(agentId: string): Promise<AcpAgentConfig | null> {
    const agents = await this.configPresenter.getAcpAgents();
    const resolvedId = resolveAcpAgentAlias(agentId);
    return agents.find((agent) => agent.id === resolvedId) ?? null;
  }

  private async initWhenEnabled(): Promise<void> {
    const enabled = await this.configPresenter.getAcpEnabled();
    if (!enabled) return;
    // Call this.init() instead of super.init() to use the overridden method
    await this.init();
  }

  /**
   * Set the session mode for an ACP conversation
   */
  async setSessionMode(conversationId: string, modeId: string): Promise<void> {
    const session = this.sessionManager.getSession(conversationId);
    if (!session) {
      throw new Error(`[ACP] No session found for conversation ${conversationId}`);
    }

    const configModeOption = getAcpConfigOptionByCategory(session.configState, "mode");
    if (configModeOption?.type === "select" && configModeOption.id !== LEGACY_MODE_CONFIG_ID) {
      await this.setSessionConfigOption(conversationId, configModeOption.id, modeId);
      return;
    }

    const previousMode = session.currentModeId ?? "default";
    const availableModes = session.availableModes ?? [];
    const availableModeIds = availableModes.map((m) => m.id);

    // Log available modes for debugging
    console.info(`[ACP] Agent "${session.agentId}" available modes: [${availableModeIds.join(", ")}]`);

    // Warn if requested mode is not in available modes
    if (availableModeIds.length > 0 && !availableModeIds.includes(modeId)) {
      console.warn(
        `[ACP] Mode "${modeId}" is not in agent's available modes [${availableModeIds.join(", ")}]. ` +
          `The agent may not support this mode.`,
      );
    }

    try {
      console.info(
        `[ACP] Changing session mode: "${previousMode}" -> "${modeId}" ` +
          `(conversation: ${conversationId}, agent: ${session.agentId})`,
      );
      await session.connection.agent.request(acpMethods.agent.session.setMode, {
        sessionId: session.sessionId,
        modeId,
      });
      session.currentModeId = modeId;
      session.configState =
        updateAcpConfigStateValue(session.configState, LEGACY_MODE_CONFIG_ID, modeId) ?? session.configState;
      const updated = this.processManager.updateBoundProcessMode(conversationId, modeId);
      if (!updated) {
        console.warn(
          `[ACP] Bound process not found for conversation ${conversationId} while setting mode "${modeId}".`,
        );
      }
      this.emitSessionConfigOptionsReady(conversationId, session.agentId, session.workdir, session.configState);
      eventBus.sendToRenderer(ACP_WORKSPACE_EVENTS.SESSION_MODES_READY, SendTarget.ALL_WINDOWS, {
        conversationId,
        agentId: session.agentId,
        workdir: session.workdir,
        current: modeId,
        available: session.availableModes ?? [],
      });
      console.info(`[ACP] Session mode successfully changed to "${modeId}" for conversation ${conversationId}`);
    } catch (error) {
      console.error(`[ACP] Failed to set session mode "${modeId}" for agent "${session.agentId}":`, error);
      throw error;
    }
  }

  /**
   * Get available session modes and current mode for a conversation
   */
  async getSessionModes(conversationId: string): Promise<{
    current: string;
    available: Array<{ id: string; name: string; description: string }>;
  } | null> {
    const session = this.sessionManager.getSession(conversationId);
    if (!session) {
      console.warn(`[ACP] getSessionModes: No session found for conversation ${conversationId}`);
      return null;
    }

    const legacyModeState = getLegacyModeState(session.configState);
    if (legacyModeState) {
      return {
        current: legacyModeState.currentModeId ?? session.currentModeId ?? "default",
        available: legacyModeState.availableModes,
      };
    }

    const result = {
      current: session.currentModeId ?? "default",
      available: session.availableModes ?? [],
    };

    console.info(
      `[ACP] getSessionModes for agent "${session.agentId}": ` +
        `current="${result.current}", available=[${result.available.map((m) => m.id).join(", ")}]`,
    );

    return result;
  }

  async getSessionConfigOptions(conversationId: string): Promise<AcpConfigState | null> {
    const session = this.sessionManager.getSession(conversationId);
    if (!session) {
      return null;
    }
    return session.configState ?? null;
  }

  async setSessionConfigOption(
    conversationId: string,
    configId: string,
    value: string | boolean,
  ): Promise<AcpConfigState | null> {
    const session = this.sessionManager.getSession(conversationId);
    if (!session) {
      throw new Error(`[ACP] No session found for conversation ${conversationId}`);
    }

    const option = getAcpConfigOption(session.configState, configId);
    if (!option) {
      throw new Error(`[ACP] Config option "${configId}" is unavailable for conversation ${conversationId}`);
    }

    let nextConfigState: AcpConfigState | null = null;

    if (configId === LEGACY_MODE_CONFIG_ID) {
      if (typeof value !== "string") {
        throw new Error("[ACP] Legacy mode config option expects a string value");
      }
      await session.connection.agent.request(acpMethods.agent.session.setMode, {
        sessionId: session.sessionId,
        modeId: value,
      });
      session.currentModeId = value;
      nextConfigState = updateAcpConfigStateValue(session.configState, configId, value) ?? session.configState ?? null;
    } else if (configId === LEGACY_MODEL_CONFIG_ID) {
      if (typeof value !== "string") {
        throw new Error("[ACP] Legacy model config option expects a string value");
      }
      await setSessionModelCompat(session.connection, {
        sessionId: session.sessionId,
        modelId: value,
      });
      nextConfigState = updateAcpConfigStateValue(session.configState, configId, value) ?? session.configState ?? null;
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
        ? preserveLegacyConfigOptions(session.configState, normalizedResponse)
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
      this.emitSessionModesReady(
        conversationId,
        session.agentId,
        session.workdir,
        session.currentModeId,
        session.availableModes,
      );
    }

    const updated = this.processManager.updateBoundProcessConfigState(conversationId, nextConfigState);
    if (!updated) {
      console.warn(
        `[ACP] Bound process not found for conversation ${conversationId} while setting config option "${configId}".`,
      );
    }

    this.emitSessionConfigOptionsReady(conversationId, session.agentId, session.workdir, nextConfigState);

    return nextConfigState;
  }

  async getSessionCommands(conversationId: string): Promise<
    Array<{
      name: string;
      description: string;
      input?: { hint: string } | null;
    }>
  > {
    const session = this.sessionManager.getSession(conversationId);
    if (!session) {
      return [];
    }
    return session.availableCommands ?? [];
  }

  /**
   * Returns a renderer-safe diagnostics snapshot for an ACP agent: readiness,
   * protocol version, auth methods, capability support, launch source, and the
   * last recorded error. Derived from the warm process handle when present.
   */
  getAcpDiagnostics(agentId: string, workdir?: string | null): AcpAgentDiagnostics {
    return computeAcpDiagnostics(this.processManager, agentId, workdir);
  }

  async cleanup(): Promise<void> {
    console.log("[ACP] Cleanup: shutting down ACP sessions and processes");
    try {
      await this.sessionManager.clearAllSessions();
    } catch (error) {
      console.warn("[ACP] Cleanup: failed to clear sessions:", error);
    }

    try {
      await this.processManager.shutdown();
    } catch (error) {
      console.warn("[ACP] Cleanup: failed to shutdown process manager:", error);
    }

    for (const [requestId, state] of this.pendingPermissions.entries()) {
      state.resolve({ outcome: { outcome: "cancelled" } });
      this.pendingPermissions.delete(requestId);
    }
  }
}
