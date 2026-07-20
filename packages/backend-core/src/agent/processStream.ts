import type { AssistantMessageBlock, MessageMetadata, PermissionMode } from "@argos/shared/types/agent-interface";
import type { PermissionRequestPayload } from "@argos/shared/types/core/llm-events";
import type { LLMCoreStreamEvent } from "@argos/shared/types/core/llm-events";
import type { ChatMessage, ChatMessageProviderOptions } from "@argos/shared/types/core/chat-message";
import type { MCPToolDefinition, MCPToolResponse } from "@argos/shared/types/core/mcp";
import type { ModelConfig } from "@argos/shared/presenter";
import type { IEventPublisher } from "../host/interfaces";
import { accumulate, createState } from "../runtime";
import { fitMessagesToContextWindow } from "../runtime/contextBuilder";

const MAX_TOOL_CALLS = 128;
const UNKNOWN_CONTEXT_LIMIT = Number.MAX_SAFE_INTEGER;
const CONTEXT_WINDOW_ERROR_PATTERNS = [
  "context length",
  "context window",
  "too many tokens",
  "prompt too long",
  "maximum context length",
  "reduce the length",
];
const USER_CANCELED_GENERATION_ERROR = "common.error.userCanceledGeneration";
const NO_MODEL_RESPONSE_ERROR = "common.error.noModelResponse";

export interface AgentMessageStore {
  updateAssistantContent(messageId: string, blocks: AssistantMessageBlock[]): void;
  finalizeAssistantMessage(messageId: string, blocks: AssistantMessageBlock[], metadataJson: string): void;
  setMessageError(messageId: string, blocks: AssistantMessageBlock[], metadataJson: string): void;
  getMessage(messageId: string): Promise<{ role: string; status?: string; content: string } | null | undefined>;
}

export interface AgentProcessHooks {
  onPreToolUse?: (tool: { callId?: string; name?: string; params?: string }) => void;
  onPostToolUse?: (tool: { callId?: string; name?: string; params?: string; response?: string }) => void;
  onPostToolUseFailure?: (tool: { callId?: string; name?: string; params?: string; error?: string }) => void;
  onPermissionRequest?: (
    permission: Record<string, unknown>,
    tool: { callId?: string; name?: string; params?: string },
  ) => void;
  autoGrantPermission?: (permission: Record<string, unknown>) => Promise<void>;
}

export interface AgentToolPresenter {
  callTool(
    toolCall: {
      id: string;
      type: string;
      function: { name: string; arguments: string };
      server?: unknown;
      conversationId?: string;
      providerId?: string;
    },
    options: { onProgress?: (update: unknown) => void; signal: AbortSignal; permissionMode: PermissionMode },
  ): Promise<{
    rawData: MCPToolResponse & {
      requiresPermission?: boolean;
      permissionRequest?: unknown;
      isError?: boolean;
      content: unknown;
    };
  }>;
  preCheckToolPermission?: (
    toolCall: { id: string; type: string; function: { name: string; arguments: string } },
    options: { permissionMode: PermissionMode },
  ) => Promise<{
    needsPermission: boolean;
    permissionType?: string;
    description?: string;
    toolName?: string;
    serverName?: string;
  } | null>;
}

export interface AgentProcessParams {
  messages: ChatMessage[];
  tools: MCPToolDefinition[];
  refreshTools?: () => Promise<MCPToolDefinition[]>;
  toolPresenter: AgentToolPresenter;
  coreStream: (
    messages: ChatMessage[],
    modelId: string,
    modelConfig: ModelConfig,
    temperature: number,
    maxTokens: number,
    tools: MCPToolDefinition[],
  ) => AsyncGenerator<LLMCoreStreamEvent>;
  providerId: string;
  modelId: string;
  modelConfig: ModelConfig;
  temperature: number;
  maxTokens: number;
  permissionMode: PermissionMode;
  initialBlocks?: AssistantMessageBlock[];
  shouldYieldForPendingInput?: () => boolean;
  hooks?: AgentProcessHooks;
  sessionId: string;
  requestId: string;
  messageId: string;
  abortSignal: AbortSignal;
  eventPublisher: IEventPublisher;
  messageStore: AgentMessageStore;
  usableContextLength?: number;
  reserveTokens?: number;
  minimumProtectedTailCount?: number;
}

export interface AgentProcessResult {
  status: "completed" | "paused" | "aborted" | "error";
  pendingInteractions?: Array<{
    type: "permission" | "question";
    messageId: string;
    toolCallId: string;
    toolName: string;
    toolArgs: string;
    serverName?: string;
    permission?: Record<string, unknown>;
  }>;
  terminalError?: string;
  stopReason?: string;
  errorMessage?: string;
  blocks: AssistantMessageBlock[];
  usage?: Record<string, number>;
}

interface StreamState {
  blocks: AssistantMessageBlock[];
  metadata: MessageMetadata;
  startTime: number;
  firstTokenTime: number | null;
  pendingToolCalls: Map<
    string,
    { name: string; arguments: string; blockIndex: number; providerOptions?: ChatMessageProviderOptions }
  >;
  completedToolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
    providerOptions?: ChatMessageProviderOptions;
  }>;
  pendingInteractions?: Array<{
    type: "permission" | "question";
    messageId: string;
    toolCallId: string;
    toolName: string;
    toolArgs: string;
    serverName?: string;
    permission?: Record<string, unknown>;
  }>;
  stopReason: "complete" | "tool_use" | "error" | "abort" | "max_tokens";
  dirty: boolean;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "CanceledError");
}

function isContextWindowErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return CONTEXT_WINDOW_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function getLatestErrorMessage(state: StreamState): string | null {
  for (let i = state.blocks.length - 1; i >= 0; i -= 1) {
    const block = state.blocks[i];
    if (block.type === "error" && typeof block.content === "string" && block.content.trim()) {
      return block.content;
    }
  }
  return null;
}

function stripTrailingErrorBlock(state: StreamState, message: string): void {
  const lastBlock = state.blocks[state.blocks.length - 1];
  if (lastBlock?.type === "error" && lastBlock.content === message) {
    state.blocks.pop();
  }
}

function parseAssistantBlocks(rawContent: string): AssistantMessageBlock[] {
  try {
    const parsed = JSON.parse(rawContent) as AssistantMessageBlock[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isTerminalPendingStatus(status: AssistantMessageBlock["status"]): boolean {
  return status === "pending" || status === "loading";
}

async function isUserCanceledAlreadyFinalized(io: {
  messageId: string;
  messageStore: AgentMessageStore;
}): Promise<boolean> {
  const message = await io.messageStore.getMessage(io.messageId);
  if (!message || message.role !== "assistant" || message.status !== "error") {
    return false;
  }
  const blocks = parseAssistantBlocks(message.content);
  if (blocks.length === 0) return false;
  if (blocks.some((b) => isTerminalPendingStatus(b.status))) return false;
  return blocks.some((b) => b.type === "error" && b.content === USER_CANCELED_GENERATION_ERROR);
}

function buildUsageSnapshot(state: StreamState): Record<string, number> {
  const usage: Record<string, number> = {};
  const m = state.metadata as Record<string, unknown>;
  for (const key of ["totalTokens", "inputTokens", "outputTokens", "cachedInputTokens", "cacheWriteInputTokens"]) {
    if (typeof m[key] === "number") usage[key] = m[key] as number;
  }
  return usage;
}

function normalizePermissionType(permissionType: unknown): "read" | "write" | "all" | "command" {
  return permissionType === "read" ||
    permissionType === "write" ||
    permissionType === "all" ||
    permissionType === "command"
    ? permissionType
    : "write";
}

function toolResponseToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item: { type?: string; text?: string; resource?: { text?: string } }) => {
        if (item.type === "text" && typeof item.text === "string") return item.text;
        if (item.type === "resource" && typeof item.resource?.text === "string") return item.resource.text;
        return `[${item.type}]`;
      })
      .join("\n");
  }
  return "";
}

function buildTerminalErrorBlocks(blocks: AssistantMessageBlock[], errorMessage: string): AssistantMessageBlock[] {
  const result = blocks.filter((b) => !(b.type === "error" && b.status === "pending"));
  result.push({ type: "error", content: errorMessage, status: "error", timestamp: Date.now() });
  return result;
}

function flushBlocks(
  state: StreamState,
  io: { sessionId: string; requestId: string; messageId: string },
  eventPublisher: IEventPublisher,
): void {
  eventPublisher.publish("chat.stream.updated", {
    kind: "snapshot",
    requestId: io.requestId,
    sessionId: io.sessionId,
    messageId: io.messageId,
    updatedAt: Date.now(),
    blocks: state.blocks,
  });
}

function finalize(
  state: StreamState,
  io: { sessionId: string; requestId: string; messageId: string },
  eventPublisher: IEventPublisher,
  messageStore: AgentMessageStore,
): void {
  for (const block of state.blocks) {
    if (block.status === "pending") block.status = "success";
  }
  finalizeMetadata(state);
  messageStore.finalizeAssistantMessage(io.messageId, state.blocks, JSON.stringify(state.metadata));
  flushBlocks(state, io, eventPublisher);
  eventPublisher.publish("chat.stream.completed", {
    requestId: io.requestId,
    sessionId: io.sessionId,
    messageId: io.messageId,
    completedAt: Date.now(),
  });
}

function finalizeMetadata(state: StreamState): void {
  const endTime = Date.now();
  const m = state.metadata as Record<string, unknown>;
  m.generationTime = endTime - state.startTime;
  if (state.firstTokenTime !== null) m.firstTokenTime = state.firstTokenTime - state.startTime;
  if (typeof m.outputTokens === "number" && typeof m.generationTime === "number" && m.generationTime > 0) {
    m.tokensPerSecond = Math.round(((m.outputTokens as number) / (m.generationTime as number)) * 1000);
  }
}

function finalizeError(
  state: StreamState,
  io: { sessionId: string; requestId: string; messageId: string },
  eventPublisher: IEventPublisher,
  messageStore: AgentMessageStore,
  error: unknown,
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  state.blocks = buildTerminalErrorBlocks(state.blocks, errorMessage);
  finalizeMetadata(state);
  messageStore.setMessageError(io.messageId, state.blocks, JSON.stringify(state.metadata));
  flushBlocks(state, io, eventPublisher);
  eventPublisher.publish("chat.stream.failed", {
    requestId: io.requestId,
    sessionId: io.sessionId,
    messageId: io.messageId,
    failedAt: Date.now(),
    error: errorMessage,
  });
}

function appendPermissionInteraction(
  state: StreamState,
  io: { sessionId: string; requestId: string; messageId: string },
  tool: { id: string; name: string; args: string; serverName?: string },
  permission: Record<string, unknown>,
): void {
  state.blocks.push({
    type: "action",
    content: typeof permission.description === "string" ? permission.description : "",
    status: "pending",
    timestamp: Date.now(),
    action_type: "tool_call_permission",
    tool_call: { id: tool.id, name: tool.name, params: tool.args, server_name: tool.serverName },
    extra: {
      needsUserAction: true,
      permissionType: permission.permissionType,
      permissionRequest: JSON.stringify(permission),
    },
  } as AssistantMessageBlock);
  state.dirty = true;
  state.pendingInteractions = [
    ...(state.pendingInteractions ?? []),
    {
      type: "permission",
      messageId: io.messageId,
      toolCallId: tool.id,
      toolName: tool.name,
      toolArgs: tool.args,
      serverName: tool.serverName,
      permission,
    },
  ];
}

function extractAssistantContent(blocks: AssistantMessageBlock[]): ChatMessage["content"] | undefined {
  const textBlocks = blocks.filter(
    (b): b is AssistantMessageBlock & { content: string } =>
      b.type === "content" && typeof b.content === "string" && b.content.length > 0,
  );
  if (textBlocks.length === 0) return undefined;
  return textBlocks.map((b) => b.content).join("");
}

async function executeTools(
  state: StreamState,
  conversation: ChatMessage[],
  tools: MCPToolDefinition[],
  toolPresenter: AgentToolPresenter,
  permissionMode: PermissionMode,
  io: { sessionId: string; requestId: string; messageId: string },
  abortSignal: AbortSignal,
  hooks: AgentProcessHooks | undefined,
  providerId: string,
  eventPublisher: IEventPublisher,
): Promise<{
  executed: number;
  pendingInteractions: NonNullable<StreamState["pendingInteractions"]>;
  toolsChanged: boolean;
  terminalError?: string;
}> {
  const completed = state.completedToolCalls;
  const iterationBlocks = state.blocks;
  const assistantContent = extractAssistantContent(iterationBlocks) ?? "";
  conversation.push({
    role: "assistant",
    content: assistantContent,
    tool_calls: completed.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments },
      ...(tc.providerOptions ? { provider_options: tc.providerOptions } : {}),
    })),
  });

  let executed = 0;
  let toolsChanged = false;
  const pendingInteractions: NonNullable<StreamState["pendingInteractions"]> = [];

  for (const tc of completed) {
    if (abortSignal.aborted) break;
    const toolDef = tools.find((t) => t.function.name === tc.name);
    const toolCall = {
      id: tc.id,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments },
      server: toolDef?.server,
      conversationId: io.sessionId,
      providerId,
    };
    const toolContext = { id: tc.id, name: tc.name, args: tc.arguments, serverName: toolDef?.server?.name };

    try {
      let preChecked: {
        needsPermission: boolean;
        permissionType?: string;
        description?: string;
        toolName?: string;
        serverName?: string;
      } | null = null;
      if (toolPresenter.preCheckToolPermission) {
        preChecked = await toolPresenter.preCheckToolPermission(toolCall, { permissionMode });
      }

      if (preChecked?.needsPermission) {
        const permission = {
          permissionType: normalizePermissionType(preChecked.permissionType),
          description: preChecked.description ?? `Permission required for ${toolContext.name}`,
          toolName: preChecked.toolName ?? toolContext.name,
          serverName: preChecked.serverName ?? toolContext.serverName,
        };
        if (permissionMode === "full_access") {
          await hooks?.autoGrantPermission?.(permission);
        } else {
          hooks?.onPermissionRequest?.(permission, toolContext);
          appendPermissionInteraction(state, io, toolContext, permission);
          continue;
        }
      }

      hooks?.onPreToolUse?.({ callId: tc.id, name: tc.name, params: tc.arguments });

      const result = await toolPresenter.callTool(toolCall, { signal: abortSignal, permissionMode });
      const raw = result.rawData;
      const responseText = toolResponseToText(raw.content);
      const isError = raw.isError === true;

      updateToolCallBlock(state.blocks, tc.id, responseText, isError);
      conversation.push({ role: "tool", tool_call_id: tc.id, content: responseText });

      if (isError) {
        hooks?.onPostToolUseFailure?.({ callId: tc.id, name: tc.name, params: tc.arguments, error: responseText });
      } else {
        hooks?.onPostToolUse?.({ callId: tc.id, name: tc.name, params: tc.arguments, response: responseText });
      }
      executed += 1;
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      updateToolCallBlock(state.blocks, tc.id, `Error: ${errorText}`, true);
      conversation.push({ role: "tool", tool_call_id: tc.id, content: `Error: ${errorText}` });
      hooks?.onPostToolUseFailure?.({ callId: tc.id, name: tc.name, params: tc.arguments, error: errorText });
      executed += 1;
    }
  }

  flushBlocks(state, io, eventPublisher);
  void toolsChanged;
  return { executed, pendingInteractions, toolsChanged };
}

function updateToolCallBlock(
  blocks: AssistantMessageBlock[],
  toolCallId: string,
  response: string,
  isError: boolean,
): void {
  const block = blocks.find((b) => b.type === "tool_call" && b.tool_call?.id === toolCallId);
  if (block?.tool_call) {
    block.tool_call.response = response;
    block.status = isError ? "error" : "success";
  }
}

/**
 * Headless agent process driver. Runs the streaming + multi-turn tool-calling
 * loop, applying a context budget and permission gating. Emits the same
 * `chat.stream.*` events the desktop renderer consumes, but through an injected
 * `IEventPublisher` so it runs inside the daemon. Excludes desktop-only
 * rendering concerns (search blocks, skill drafts, plan blocks, RTK, image
 * previews).
 */
export async function agentProcessStream(params: AgentProcessParams): Promise<AgentProcessResult> {
  const {
    messages,
    tools,
    toolPresenter,
    coreStream,
    modelId,
    modelConfig,
    temperature,
    maxTokens,
    permissionMode,
    initialBlocks,
    hooks,
    shouldYieldForPendingInput,
    refreshTools,
    providerId,
    sessionId,
    requestId,
    messageId,
    abortSignal,
    eventPublisher,
    messageStore,
    usableContextLength = modelConfig.contextLength > 0 ? modelConfig.contextLength : UNKNOWN_CONTEXT_LIMIT,
    reserveTokens = 0,
    minimumProtectedTailCount = 8,
  } = params;

  const state = createState() as unknown as StreamState;
  state.metadata.provider = providerId;
  state.metadata.model = modelId;
  if (Array.isArray(initialBlocks) && initialBlocks.length > 0) {
    state.blocks = JSON.parse(JSON.stringify(initialBlocks)) as AssistantMessageBlock[];
  }

  const io = { sessionId, requestId, messageId };
  const conversationMessages = fitMessagesToContextWindow(
    messages,
    usableContextLength,
    reserveTokens,
    minimumProtectedTailCount,
  );
  let currentTools = [...tools];
  let toolCallCount = 0;

  console.log(`[AgentProcess] start session=${sessionId} message=${messageId}`);

  const finalizeUserCanceled = async (): Promise<void> => {
    if (await isUserCanceledAlreadyFinalized({ messageId, messageStore })) return;
    finalizeError(state, io, eventPublisher, messageStore, USER_CANCELED_GENERATION_ERROR);
  };

  try {
    while (true) {
      const prevBlockCount = state.blocks.length;
      state.completedToolCalls = [];
      state.pendingToolCalls.clear();

      const stream = coreStream(conversationMessages, modelId, modelConfig, temperature, maxTokens, currentTools);
      for await (const event of stream) {
        if (abortSignal.aborted) {
          console.log(`[AgentProcess] aborted`);
          await finalizeUserCanceled();
          return {
            status: "aborted",
            stopReason: "user_stop",
            errorMessage: USER_CANCELED_GENERATION_ERROR,
            blocks: state.blocks,
            usage: buildUsageSnapshot(state),
          };
        }
        if (event.type === "permission") {
          const p = (event as { permission: PermissionRequestPayload }).permission;
          const permission = {
            permissionType: normalizePermissionType(p.permissionType),
            description:
              p.description ?? `components.messageBlockPermissionRequest.description.${p.permissionType ?? "write"}`,
            toolName: p.tool_call_name,
            serverName: p.server_name,
            providerId: p.providerId,
            requestId: p.requestId,
          };
          const tool = {
            id: p.tool_call_id,
            name: p.tool_call_name ?? p.requestId,
            args: p.tool_call_params ?? "",
            serverName: p.server_name,
          };
          hooks?.onPermissionRequest?.(permission, tool);
          appendPermissionInteraction(state, io, tool, permission);
          flushBlocks(state, io, eventPublisher);
          continue;
        }
        accumulate(state as never, event);
        if (state.dirty) flushBlocks(state, io, eventPublisher);
      }

      if (abortSignal.aborted) {
        await finalizeUserCanceled();
        return {
          status: "aborted",
          stopReason: "user_stop",
          errorMessage: USER_CANCELED_GENERATION_ERROR,
          blocks: state.blocks,
          usage: buildUsageSnapshot(state),
        };
      }
      if (state.stopReason !== "tool_use") break;
      if (state.completedToolCalls.length === 0) break;

      if (toolCallCount + state.completedToolCalls.length > MAX_TOOL_CALLS) {
        console.log(`[AgentProcess] max tool calls reached`);
        break;
      }

      const executed = await executeTools(
        state,
        conversationMessages,
        currentTools,
        toolPresenter,
        permissionMode,
        io,
        abortSignal,
        hooks,
        providerId,
        eventPublisher,
      );
      toolCallCount += executed.executed;
      if (executed.terminalError) {
        finalizeError(state, io, eventPublisher, messageStore, executed.terminalError);
        return {
          status: "error",
          terminalError: executed.terminalError,
          stopReason: "error",
          errorMessage: executed.terminalError,
          blocks: state.blocks,
          usage: buildUsageSnapshot(state),
        };
      }
      if (executed.pendingInteractions.length > 0) {
        finalize(state, io, eventPublisher, messageStore);
        return {
          status: "paused",
          pendingInteractions: executed.pendingInteractions,
          blocks: state.blocks,
          usage: buildUsageSnapshot(state),
        };
      }
      if (abortSignal.aborted) {
        await finalizeUserCanceled();
        return {
          status: "aborted",
          stopReason: "user_stop",
          errorMessage: USER_CANCELED_GENERATION_ERROR,
          blocks: state.blocks,
          usage: buildUsageSnapshot(state),
        };
      }
      if (shouldYieldForPendingInput?.()) {
        finalize(state, io, eventPublisher, messageStore);
        return {
          status: "completed",
          stopReason: "pending_input",
          blocks: state.blocks,
          usage: buildUsageSnapshot(state),
        };
      }
      if (executed.toolsChanged && refreshTools) {
        try {
          currentTools = await refreshTools();
        } catch (err) {
          console.warn("[AgentProcess] failed to refresh tools:", err);
        }
      }
      void prevBlockCount;
    }

    if (abortSignal.aborted) {
      await finalizeUserCanceled();
      return {
        status: "aborted",
        stopReason: "user_stop",
        errorMessage: USER_CANCELED_GENERATION_ERROR,
        blocks: state.blocks,
        usage: buildUsageSnapshot(state),
      };
    }
    if (state.stopReason === "error") {
      const streamErrorMessage = getLatestErrorMessage(state);
      if (streamErrorMessage && isContextWindowErrorMessage(streamErrorMessage)) {
        stripTrailingErrorBlock(state, streamErrorMessage);
        finalizeError(state, io, eventPublisher, messageStore, streamErrorMessage);
        return {
          status: "error",
          terminalError: streamErrorMessage,
          blocks: state.blocks,
          usage: buildUsageSnapshot(state),
        };
      }
    }
    if (state.blocks.length === 0) {
      finalizeError(state, io, eventPublisher, messageStore, NO_MODEL_RESPONSE_ERROR);
      return {
        status: "error",
        terminalError: NO_MODEL_RESPONSE_ERROR,
        stopReason: "error",
        errorMessage: NO_MODEL_RESPONSE_ERROR,
        blocks: state.blocks,
        usage: buildUsageSnapshot(state),
      };
    }
    finalize(state, io, eventPublisher, messageStore);
    return { status: "completed", stopReason: "complete", blocks: state.blocks, usage: buildUsageSnapshot(state) };
  } catch (err) {
    if (abortSignal.aborted || isAbortError(err)) {
      return {
        status: "aborted",
        stopReason: "user_stop",
        errorMessage: USER_CANCELED_GENERATION_ERROR,
        blocks: state.blocks,
        usage: buildUsageSnapshot(state),
      };
    }
    console.error(`[AgentProcess] exception:`, err);
    finalizeError(state, io, eventPublisher, messageStore, err);
    return {
      status: "error",
      stopReason: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      blocks: state.blocks,
      usage: buildUsageSnapshot(state),
    };
  }
}
