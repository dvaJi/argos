import type * as schema from "@agentclientprotocol/sdk/unstable";
import type { AcpConfigState } from "@argos/shared/presenter";
import type { AssistantMessageBlock } from "@argos/shared/chat";
import { createStreamEvent, type LLMCoreStreamEvent } from "@argos/shared/types/core/llm-events";
import { normalizeAcpConfigState } from "./acpConfigState";

export interface PlanEntry {
  content: string;
  priority?: string | null;
  status?: string | null;
}

export interface MappedContent {
  events: LLMCoreStreamEvent[];
  blocks: AssistantMessageBlock[];
  /** Structured plan entries from the agent (optional) */
  planEntries?: PlanEntry[];
  /** Timestamp (ms) of the reasoning/thought chunk that produced this mapping (optional) */
  reasoningStartTime?: number;
  /** Current mode ID from mode change notification (optional) */
  currentModeId?: string;
  /** Available slash commands from ACP session (optional) */
  availableCommands?: Array<{
    name: string;
    description: string;
    input?: { hint: string } | null;
  }>;
  /** Prompt suggestions predicted by the agent (optional), most likely first */
  promptSuggestions?: string[];
  /** Session cursors announced by the agent (optional); forkable ones can seed `session/fork` */
  cursors?: AcpCursorEntry[];
  /** Unified ACP session config state */
  configState?: AcpConfigState;
  /** ACP session metadata update */
  sessionInfo?: {
    title?: string | null;
    updatedAt?: string | null;
    meta?: Record<string, unknown> | null;
  };
  /** ACP session usage/context update */
  usage?: {
    used: number;
    size: number;
    cost?: schema.Cost | null;
    meta?: Record<string, unknown> | null;
  };
}

interface ToolCallState {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  argumentsBuffer: string;
  paramsCaptured: boolean;
  status?: schema.ToolCallStatus | null;
  started: boolean;
  rawContents?: schema.ToolCallContent[];
}

/** Per-compaction tracking state (id-addressed compaction contract) */
interface CompactionState {
  status?: schema.CompactionStatus;
  /** Whether summary chunks were streamed for this compaction already */
  summaryStreamed: boolean;
}

/** Child-session metadata reported through `subagent_update` (patch semantics) */
interface SubagentSessionEntry {
  title?: string;
  description?: string;
}

/** A session cursor announced by the agent via `cursor_update` */
export interface AcpCursorEntry {
  cursorId: string;
  forkable: boolean;
  anchorType: string;
  anchorId?: string;
  position?: string;
}

const now = () => Date.now();

export class AcpContentMapper {
  private readonly toolCallStates = new Map<string, ToolCallState>();
  private readonly compactionStates = new Map<schema.CompactionId, CompactionState>();
  private readonly subagentSessions = new Map<string, SubagentSessionEntry>();
  private readonly messageOwners = new Map<string, string>();
  private readonly messageStreamed = new Set<string>();
  private readonly sessionCursors = new Map<string, Map<string, AcpCursorEntry>>();

  map(notification: schema.SessionNotification): MappedContent {
    const { update, sessionId } = notification;
    const payload: MappedContent = { events: [], blocks: [] };

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        this.pushContent(update.content, "text", payload);
        break;
      case "agent_thought_chunk": {
        payload.reasoningStartTime = now();
        this.pushContent(update.content, "reasoning", payload);
        break;
      }
      case "tool_call":
      case "tool_call_update":
        this.handleToolCallUpdate(sessionId, update, payload);
        break;
      case "plan":
        console.info("[ACP] Plan update received:", JSON.stringify(update));
        this.handlePlanUpdate(update, payload);
        break;
      case "plan_update":
        this.handlePlanUpdateContent(update.plan, payload);
        break;
      case "plan_removed":
        this.pushPlanEntries([], payload);
        break;
      case "notice":
        this.handleNotice(update, payload);
        break;
      case "compaction_update":
        this.handleCompactionUpdate(update, payload);
        break;
      case "compaction_summary_chunk":
        this.handleCompactionSummaryChunk(update, payload);
        break;
      case "prompt_suggestions_update":
        this.handlePromptSuggestionsUpdate(update, payload);
        break;
      case "current_mode_update":
        console.info("[ACP] Mode update received:", update);
        this.handleModeUpdate(update, payload);
        break;
      case "available_commands_update":
        console.info(
          "[ACP] Available commands update:",
          JSON.stringify(update.availableCommands?.map((c) => c.name) ?? []),
        );
        this.handleAvailableCommandsUpdate(update, payload);
        break;
      case "config_option_update":
        this.handleConfigOptionUpdate(update, payload);
        break;
      case "session_info_update":
        this.handleSessionInfoUpdate(update, payload);
        break;
      case "usage_update":
        this.handleUsageUpdate(update, payload);
        break;
      case "user_message_chunk":
        // ignore echo
        break;
      case "cursor_update": {
        const cursors = this.handleCursorUpdate(update, sessionId);
        if (cursors) {
          payload.cursors = cursors;
        }
        break;
      }
      case "subagent_update":
        this.handleSubagentUpdate(update, payload, sessionId);
        break;
      case "session_message":
        this.handleSessionMessage(update, payload, sessionId);
        break;
      case "session_message_chunk":
        this.handleSessionMessageChunk(update, payload, sessionId);
        break;
      default:
        // Handle any unrecognized session update types
        const sessionUpdate = (update as { sessionUpdate?: string }).sessionUpdate;
        console.warn("[ACP] Unhandled session update type:", sessionUpdate);
        console.debug("[ACP] Full update data:", JSON.stringify(update));
        break;
    }

    return payload;
  }

  private pushContent(
    content:
      | { type: "text"; text: string }
      | { type: "image"; data: string; mimeType: string }
      | { type: "audio"; data: string; mimeType: string }
      | { type: "resource_link"; uri: string }
      | { type: "resource"; resource: unknown }
      | undefined,
    channel: "text" | "reasoning",
    payload: MappedContent,
  ) {
    if (!content) return;

    switch (content.type) {
      case "text":
        if (channel === "text") {
          payload.events.push(createStreamEvent.text(content.text));
          payload.blocks.push(this.createBlock("content", content.text));
        } else {
          payload.events.push(createStreamEvent.reasoning(content.text));
          payload.blocks.push(this.createBlock("reasoning_content", content.text));
        }
        break;
      case "image":
        payload.events.push(createStreamEvent.imageData({ data: content.data, mimeType: content.mimeType }));
        payload.blocks.push(
          this.createBlock("image", undefined, {
            image_data: { data: content.data, mimeType: content.mimeType },
          }),
        );
        break;
      case "audio":
        this.emitAsText(`[audio ${content.mimeType}]`, channel, payload);
        break;
      case "resource_link":
        this.emitAsText(content.uri, channel, payload);
        break;
      case "resource":
        this.emitAsText(JSON.stringify(content.resource), channel, payload);
        break;
      default:
        this.emitAsText(JSON.stringify(content), channel, payload);
        break;
    }
  }

  private emitAsText(text: string, channel: "text" | "reasoning", payload: MappedContent) {
    if (channel === "text") {
      payload.events.push(createStreamEvent.text(text));
      payload.blocks.push(this.createBlock("content", text));
    } else {
      const timestamp = now();
      payload.events.push(createStreamEvent.reasoning(text));
      payload.blocks.push(
        this.createBlock("reasoning_content", text, {
          reasoning_time: { start: timestamp, end: timestamp },
        }),
      );
    }
  }

  private handleToolCallUpdate(
    sessionId: string,
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "tool_call" | "tool_call_update" }>,
    payload: MappedContent,
  ) {
    const toolCallId = update.toolCallId;
    if (!toolCallId) return;

    const rawTitle = "title" in update ? (update.title ?? undefined) : undefined;
    const title = typeof rawTitle === "string" ? rawTitle.trim() || undefined : undefined;
    const status = "status" in update ? (update.status ?? undefined) : undefined;

    const state = this.getOrCreateToolCallState(sessionId, toolCallId, title);
    if (title && state.toolName !== title) {
      state.toolName = title;
    }

    const previousStatus = state.status;
    if (status) {
      state.status = status;
    }

    this.emitToolCallStartIfNeeded(state, payload);

    const shouldEmitReasoning = update.sessionUpdate === "tool_call" || (status && status !== previousStatus);
    if (shouldEmitReasoning) {
      const reasoningText = this.buildToolCallReasoning(state.toolName, status);
      if (reasoningText) {
        payload.events.push(createStreamEvent.reasoning(reasoningText));
        payload.blocks.push(this.createBlock("action", reasoningText, { action_type: "tool_call_permission" }));
      }
    }

    const content = "content" in update ? (update.content ?? undefined) : undefined;
    if (content?.length) {
      state.rawContents = [...(state.rawContents ?? []), ...content];
    }
    const paramsChunk = this.stringifyToolParams(update);
    const contentChunk = this.formatToolCallContent(content, "");
    const rawInputSnapshot = this.hasRawInputSnapshot(update);
    let chunk: string | undefined;
    let isSnapshot = false;
    if (rawInputSnapshot) {
      // rawInput is the executable tool input and has replace semantics: every
      // snapshot supersedes the previous one.
      chunk = paramsChunk;
      isSnapshot = true;
    } else if (!state.paramsCaptured) {
      // Pre-capture fallback: complete params (title/locations) replace the display
      // buffer; streamed content text remains an append-only delta.
      chunk = paramsChunk ?? contentChunk;
      isSnapshot = paramsChunk !== undefined;
    }
    if (chunk) {
      this.emitToolCallChunk(state, chunk, payload, isSnapshot);
      if (rawInputSnapshot) {
        state.paramsCaptured = true;
      }
    }

    if (status === "completed" || status === "failed") {
      this.emitToolCallEnd(state, payload, status === "failed");
    }
  }

  private mapPlanEntries(entries: schema.PlanEntry[] | null | undefined): PlanEntry[] {
    return (entries ?? []).map((entry) => ({
      content: entry.content,
      priority: entry.priority ?? null,
      status: entry.status ?? null,
    }));
  }

  private pushPlanEntries(entries: PlanEntry[], payload: MappedContent) {
    payload.planEntries = entries;

    // Create dedicated plan block
    payload.events.push(createStreamEvent.reasoning("")); // Empty event for plan
    payload.blocks.push(
      this.createBlock("plan", "", {
        extra: { plan_entries: entries },
      }),
    );
  }

  private handlePlanUpdate(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "plan" }>,
    payload: MappedContent,
  ) {
    const entries = this.mapPlanEntries(update.entries);
    if (!entries.length) return;
    this.pushPlanEntries(entries, payload);
  }

  private handlePlanUpdateContent(plan: schema.PlanUpdateContent, payload: MappedContent) {
    if (plan.type === "items") {
      // `entries` is a complete replacement of that plan's entries
      this.pushPlanEntries(this.mapPlanEntries(plan.entries), payload);
      return;
    }
    // Markdown plan document; `path` points at the file holding the plan
    const text = plan.path ? `${plan.content}\n\n(${plan.path})` : plan.content;
    if (text.trim()) {
      this.emitAsText(text, "text", payload);
    }
  }

  private handleNotice(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "notice" }>,
    payload: MappedContent,
  ) {
    const title = typeof update.title === "string" ? update.title.trim() : "";
    if (!title) return;
    const description = typeof update.description === "string" ? update.description.trim() : "";
    const prefix = update.severity === "error" ? "Error" : update.severity === "warning" ? "Warning" : undefined;
    const text = `${prefix ? `${prefix}: ` : ""}${title}${description ? ` — ${description}` : ""}`;
    this.emitAsText(text, "text", payload);
  }

  private handleCompactionUpdate(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "compaction_update" }>,
    payload: MappedContent,
  ) {
    const state = this.compactionStates.get(update.compactionId) ?? { summaryStreamed: false };

    if (update.status && update.status !== state.status) {
      state.status = update.status;
      const suffix = update.status === "failed" && update.error ? `: ${update.error}` : "";
      this.emitAsText(`Context compaction ${update.status}${suffix}`, "text", payload);
    }

    // `summary` has replacement semantics; if summary chunks were streamed
    // earlier they already rendered the content, so don't duplicate it here.
    if (Array.isArray(update.summary) && update.summary.length && !state.summaryStreamed) {
      const summaryText = this.contentBlocksToText(update.summary);
      if (summaryText) {
        this.emitAsText(summaryText, "text", payload);
      }
    }

    this.compactionStates.set(update.compactionId, state);
  }

  private handleCompactionSummaryChunk(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "compaction_summary_chunk" }>,
    payload: MappedContent,
  ) {
    const state = this.compactionStates.get(update.compactionId) ?? { summaryStreamed: false };
    state.summaryStreamed = true;
    this.compactionStates.set(update.compactionId, state);
    this.pushContent(update.content, "text", payload);
  }

  private handlePromptSuggestionsUpdate(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "prompt_suggestions_update" }>,
    payload: MappedContent,
  ) {
    const suggestions = (update.suggestions ?? [])
      .map((suggestion) =>
        suggestion.prompt
          .filter((block): block is Extract<schema.ContentBlock, { type: "text" }> => block.type === "text")
          .map((block) => block.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    payload.promptSuggestions = suggestions;
  }

  private contentBlocksToText(blocks: schema.ContentBlock[]): string {
    return blocks
      .map((block) => (block.type === "text" ? block.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  /**
   * Track agent-announced session cursors. `capabilities` has patch semantics
   * (omitted = unchanged, `null` = clears, object = replaces); the anchor is
   * required on the first update and later omissions keep it. Emits the full
   * cursor list for the session on every update.
   */
  private handleCursorUpdate(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "cursor_update" }>,
    sessionId: string,
  ) {
    const cursorId = update.cursorId;
    if (!cursorId) return;
    let cursors = this.sessionCursors.get(sessionId);
    if (!cursors) {
      cursors = new Map();
      this.sessionCursors.set(sessionId, cursors);
    }
    const entry: AcpCursorEntry = cursors.get(cursorId) ?? {
      cursorId,
      forkable: false,
      anchorType: "unknown",
    };

    const anchor = update.anchor as
      | { type?: unknown; position?: unknown; messageId?: unknown; toolCallId?: unknown; compactionId?: unknown }
      | null
      | undefined;
    if (anchor) {
      entry.anchorType = typeof anchor.type === "string" ? anchor.type : "unknown";
      const anchorId =
        typeof anchor.messageId === "string"
          ? anchor.messageId
          : typeof anchor.toolCallId === "string"
            ? anchor.toolCallId
            : typeof anchor.compactionId === "string"
              ? anchor.compactionId
              : undefined;
      if (anchorId) entry.anchorId = anchorId;
      if (typeof anchor.position === "string") entry.position = anchor.position;
    }

    if (update.capabilities !== undefined) {
      entry.forkable = update.capabilities?.fork != null;
    }
    cursors.set(cursorId, entry);

    return [...cursors.values()];
  }

  private subagentSessionKey(parentSessionId: string, childSessionId: string): string {
    return `${parentSessionId}:${childSessionId}`;
  }

  private messageOwnerKey(parentSessionId: string, messageId: string): string {
    return `${parentSessionId}:${messageId}`;
  }

  private subagentDisplayName(parentSessionId: string, childSessionId: string): string {
    const entry = this.subagentSessions.get(this.subagentSessionKey(parentSessionId, childSessionId));
    return entry?.title?.trim() || entry?.description?.trim() || "Subagent";
  }

  /**
   * Resolve which child session owns a session-directed message: the stored
   * mapping from a previous `session_message`, else the sender when it is not
   * the parent session, else the recipient when it is not the parent.
   */
  private resolveMessageChild(
    parentSessionId: string,
    messageId: string,
    senderSessionId?: string | null,
    recipientSessionId?: string | null,
  ): string | undefined {
    const stored = this.messageOwners.get(this.messageOwnerKey(parentSessionId, messageId));
    if (stored) return stored;
    if (senderSessionId && senderSessionId !== parentSessionId) return senderSessionId;
    if (recipientSessionId && recipientSessionId !== parentSessionId) return recipientSessionId;
    return undefined;
  }

  private getSubagentToolCallState(parentSessionId: string, childSessionId: string): ToolCallState {
    return this.getOrCreateToolCallState(
      parentSessionId,
      childSessionId,
      this.subagentDisplayName(parentSessionId, childSessionId),
    );
  }

  /**
   * Child-session association and work-state snapshots. Rendered as a virtual
   * tool call per child so nested agent activity reuses the regular tool-call
   * blocks: `running` keeps it open, `idle` completes it, an `error` fails it.
   */
  private handleSubagentUpdate(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "subagent_update" }>,
    payload: MappedContent,
    sessionId: string,
  ) {
    const childSessionId = update.sessionId;
    if (!childSessionId) return;
    const key = this.subagentSessionKey(sessionId, childSessionId);
    const entry = this.subagentSessions.get(key) ?? {};
    if (update.title !== undefined) entry.title = update.title ?? undefined;
    if (update.description !== undefined) entry.description = update.description ?? undefined;
    this.subagentSessions.set(key, entry);

    const state = update.state ?? undefined;
    if (!state) return; // omitted = unchanged; null = clear activity (nothing to render)

    const stateView = state as { state?: unknown; error?: unknown };
    const stateName = typeof stateView.state === "string" ? stateView.state : undefined;
    const callState = this.getSubagentToolCallState(sessionId, childSessionId);
    this.emitToolCallStartIfNeeded(callState, payload);

    const hasError = stateView.error !== undefined && stateView.error !== null;
    if (stateName === "idle" || hasError) {
      callState.status = hasError ? "failed" : "completed";
      this.emitToolCallEnd(callState, payload, hasError);
      return;
    }
    if (stateName === "running") {
      callState.status = "in_progress";
    }
    // requires_action / unknown / custom states: leave the call open.
  }

  private handleSessionMessage(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "session_message" }>,
    payload: MappedContent,
    sessionId: string,
  ) {
    const messageId = update.messageId;
    if (!messageId) return;
    const ownerKey = this.messageOwnerKey(sessionId, messageId);
    const childSessionId = this.resolveMessageChild(
      sessionId,
      messageId,
      update.senderSessionId,
      update.recipientSessionId,
    );
    if (update.senderSessionId) {
      this.messageOwners.set(ownerKey, update.senderSessionId);
    } else if (update.recipientSessionId) {
      this.messageOwners.set(ownerKey, update.recipientSessionId);
    }
    if (!childSessionId) return;

    const content = Array.isArray(update.content) ? update.content : [];
    if (!content.length) return; // null/[] clears the content; nothing to render
    if (this.messageStreamed.has(ownerKey)) return; // chunks already streamed this message
    this.messageStreamed.add(ownerKey);

    const text = this.contentBlocksToText(content);
    if (!text) {
      console.debug("[ACP] Skipping non-text subagent session message content");
      return;
    }
    const callState = this.getSubagentToolCallState(sessionId, childSessionId);
    this.emitToolCallStartIfNeeded(callState, payload);
    this.emitToolCallChunk(callState, text, payload, false);
  }

  private handleSessionMessageChunk(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "session_message_chunk" }>,
    payload: MappedContent,
    sessionId: string,
  ) {
    const messageId = update.messageId;
    if (!messageId) return;
    let childSessionId = this.resolveMessageChild(sessionId, messageId);
    if (!childSessionId) {
      // Chunks carry no sender field. When the parent has exactly one child
      // session the owner is unambiguous; otherwise skip (the agent must
      // register the message via session_message first).
      const childKeyPrefix = `${sessionId}:`;
      const children = [...this.subagentSessions.keys()].filter((key) => key.startsWith(childKeyPrefix));
      if (children.length === 1) {
        childSessionId = children[0].slice(childKeyPrefix.length);
      }
    }
    if (!childSessionId) {
      console.debug("[ACP] Ignoring session message chunk without a known owner (messageId:", messageId, ")");
      return;
    }
    this.messageStreamed.add(this.messageOwnerKey(sessionId, messageId));
    const text = update.content?.type === "text" ? update.content.text : "";
    if (!text) {
      console.debug("[ACP] Skipping non-text session message chunk");
      return;
    }
    const callState = this.getSubagentToolCallState(sessionId, childSessionId);
    this.emitToolCallStartIfNeeded(callState, payload);
    this.emitToolCallChunk(callState, text, payload, false);
  }

  private handleModeUpdate(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "current_mode_update" }>,
    payload: MappedContent,
  ) {
    const modeId = update.currentModeId;
    if (!modeId) return;

    // Store mode change
    payload.currentModeId = modeId;

    // Emit as reasoning for visibility
    const text = `Mode changed to: ${modeId}`;
    payload.events.push(createStreamEvent.reasoning(text));
    payload.blocks.push(
      this.createBlock("reasoning_content", text, {
        extra: { mode_change: modeId },
      }),
    );
  }

  private handleAvailableCommandsUpdate(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "available_commands_update" }>,
    payload: MappedContent,
  ) {
    const commands = (update.availableCommands ?? [])
      .map((command) => {
        const name = typeof command.name === "string" ? command.name.trim() : "";
        if (!name) return null;
        const description = typeof command.description === "string" ? command.description.trim() : "";
        const hint = command.input?.hint;
        return {
          name,
          description,
          input: typeof hint === "string" && hint.trim() ? { hint: hint.trim() } : null,
        };
      })
      .filter((command): command is NonNullable<typeof command> => command !== null);

    payload.availableCommands = commands;
  }

  private handleConfigOptionUpdate(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "config_option_update" }>,
    payload: MappedContent,
  ) {
    payload.configState = normalizeAcpConfigState({
      configOptions: update.configOptions,
    });
  }

  private handleSessionInfoUpdate(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "session_info_update" }>,
    payload: MappedContent,
  ) {
    payload.sessionInfo = {
      title: update.title,
      updatedAt: update.updatedAt,
      meta: update._meta ?? null,
    };
  }

  private handleUsageUpdate(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "usage_update" }>,
    payload: MappedContent,
  ) {
    payload.usage = {
      used: update.used,
      size: update.size,
      cost: update.cost ?? null,
      meta: update._meta ?? null,
    };
  }

  private formatToolCallContent(contents?: schema.ToolCallContent[] | null, joiner: string = "\n"): string {
    if (!contents?.length) {
      return "";
    }

    return contents
      .map((item) => {
        if (item.type === "content") {
          const block = item.content;
          switch (block.type) {
            case "text":
              return block.text;
            case "image":
              return "[image]";
            case "audio":
              return "[audio]";
            case "resource":
              return "[resource]";
            case "resource_link":
              return block.uri;
            default:
              return JSON.stringify(block);
          }
        }
        if (item.type === "terminal") {
          return "output" in item && typeof item.output === "string" ? item.output : `[terminal:${item.terminalId}]`;
        }
        if (item.type === "diff") {
          return item.path ? `diff: ${item.path}` : "[diff]";
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join(joiner);
  }

  private tryParseJsonArguments(buffer: string, toolCallId: string): string | undefined {
    const trimmed = buffer.trim();
    if (!trimmed) {
      return undefined;
    }

    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return trimmed;
    }

    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch (error) {
      // Defense-in-depth for agents that still append snapshots: fall back to the
      // last complete JSON document so the tool call receives valid arguments.
      const salvaged = this.extractLastJsonDocument(trimmed);
      if (salvaged !== undefined) {
        return salvaged;
      }
      const preview = trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
      console.warn(`[ACP] Tool call arguments appear incomplete (toolCallId=${toolCallId}): ${preview}`, error);
      return trimmed;
    }
  }

  private extractLastJsonDocument(value: string): string | undefined {
    // Only top-level document boundaries qualify as salvage candidates: a complete
    // document nested inside a truncated outer document (e.g. `{"q":"v","m":{"a":1}`)
    // must NOT be returned silently — the tool call would execute with wrong args.
    const candidates: number[] = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === "{" || ch === "[") {
        if (depth === 0) {
          candidates.push(i);
        }
        depth += 1;
      } else if (ch === "}" || ch === "]") {
        depth = Math.max(0, depth - 1);
      }
    }
    for (let i = candidates.length - 1; i >= 0; i--) {
      const candidate = value.slice(candidates[i]);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // Keep scanning for an earlier complete document.
      }
    }
    return undefined;
  }

  private buildToolCallReasoning(title?: string, status?: schema.ToolCallStatus | null): string | null {
    const statusText = status ? status.replace(/_/g, " ") : undefined;
    const segments = ["Tool call", title, statusText].filter(Boolean);
    return segments.length ? segments.join(" - ") : null;
  }

  private emitToolCallStartIfNeeded(state: ToolCallState, payload: MappedContent) {
    if (state.started) return;
    state.started = true;
    payload.events.push(createStreamEvent.toolCallStart(state.toolCallId, state.toolName));
  }

  private emitToolCallChunk(state: ToolCallState, chunk: string, payload: MappedContent, isSnapshot: boolean) {
    // Structured params (rawInput/locations/title) have replace semantics in the ACP
    // schema — agents re-emit the complete current value. Once rawInput is captured,
    // only a fresh rawInput snapshot may touch the executable buffer; streaming text
    // fallback chunks are deltas and must still append.
    state.argumentsBuffer = isSnapshot ? chunk : `${state.argumentsBuffer}${chunk}`;
    payload.events.push(createStreamEvent.toolCallChunk(state.toolCallId, chunk));
    payload.blocks.push(
      this.createBlock("tool_call", state.argumentsBuffer, {
        status: "loading",
        tool_call: {
          id: state.toolCallId,
          name: state.toolName,
          params: state.argumentsBuffer,
        },
      }),
    );
  }

  private emitToolCallEnd(state: ToolCallState, payload: MappedContent, isError: boolean) {
    const toolCallId = state.toolCallId;
    const finalArgs = this.tryParseJsonArguments(state.argumentsBuffer, toolCallId);
    payload.events.push(createStreamEvent.toolCallEnd(toolCallId, finalArgs));
    payload.blocks.push(
      this.createBlock("tool_call", finalArgs, {
        status: isError ? "error" : "success",
        tool_call: {
          id: toolCallId,
          name: state.toolName,
          params: finalArgs,
        },
        ...(state.rawContents?.length ? { raw_contents: state.rawContents } : {}),
      }),
    );
    this.toolCallStates.delete(this.getToolCallStateKey(state.sessionId, toolCallId));
  }

  private getOrCreateToolCallState(sessionId: string, toolCallId: string, toolName?: string): ToolCallState {
    const key = this.getToolCallStateKey(sessionId, toolCallId);
    const existing = this.toolCallStates.get(key);
    if (existing) {
      if (toolName && existing.toolName !== toolName) {
        existing.toolName = toolName;
      }
      return existing;
    }

    const state: ToolCallState = {
      sessionId,
      toolCallId,
      toolName: toolName ?? toolCallId,
      argumentsBuffer: "",
      paramsCaptured: false,
      status: undefined,
      started: false,
    };
    this.toolCallStates.set(key, state);
    return state;
  }

  private getToolCallStateKey(sessionId: string, toolCallId: string): string {
    return `${sessionId}:${toolCallId}`;
  }

  private createBlock(
    type: AssistantMessageBlock["type"],
    content?: string,
    extra?: Partial<AssistantMessageBlock>,
  ): AssistantMessageBlock {
    return {
      type,
      content,
      status: "success",
      timestamp: now(),
      ...extra,
    } as AssistantMessageBlock;
  }

  private hasRawInputSnapshot(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "tool_call" | "tool_call_update" }>,
  ): boolean {
    const rawInput = (update as any).rawInput ?? (update as any).raw_input;
    return typeof rawInput === "object" && rawInput !== null && Object.keys(rawInput).length > 0;
  }

  private stringifyToolParams(
    update: Extract<schema.SessionNotification["update"], { sessionUpdate: "tool_call" | "tool_call_update" }>,
  ): string | undefined {
    const rawInput = (update as any).rawInput ?? (update as any).raw_input;
    if (rawInput && typeof rawInput === "object" && Object.keys(rawInput).length > 0) {
      try {
        return JSON.stringify(rawInput);
      } catch (error) {
        console.warn("[ACP] Failed to stringify rawInput for tool call params:", error);
      }
    }

    if (update.locations?.length) {
      try {
        return JSON.stringify({ locations: update.locations });
      } catch (error) {
        console.warn("[ACP] Failed to stringify locations for tool call params:", error);
      }
    }

    if ("title" in update && typeof update.title === "string" && update.title.trim()) {
      return update.title.trim();
    }

    return undefined;
  }
}
