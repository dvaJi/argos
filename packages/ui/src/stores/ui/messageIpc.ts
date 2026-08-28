import { createChatClient } from "../../../api/ChatClient";
import { onIpcChannel } from "#api/runtime";
import { STREAM_EVENTS } from "#/events";
import type { AssistantMessageBlock } from "@argos/shared/types/agent-interface";

interface BindMessageStoreIpcOptions {
  getActiveSessionId: () => string | null;
  setStreamingState: (payload: { sessionId: string; messageId?: string; blocks: AssistantMessageBlock[] }) => void;
  clearStreamingState: () => void;
  loadMessages: (sessionId: string) => void | Promise<unknown>;
  applyStreamingBlocksToMessage?: (messageId: string, sessionId: string, blocks: AssistantMessageBlock[]) => void;
  isEphemeralStreamMessageId: (messageId: string) => boolean;
}

/**
 * A stream that stops delivering updates must not spin forever: the completion
 * event can be lost (WS drop/reconnect gap, daemon wedge) while the turn still
 * settles server-side. After this much silence for the active session's stream,
 * run the same recovery as completion (docs/issues/stream-stall-recovery).
 * Tolerates legitimately slow tools (a 66s webhook wait was observed in the
 * wild); a stream that resumes simply re-establishes itself on the next update.
 */
const STREAM_STALE_AFTER_MS = 120_000;
const STREAM_WATCHDOG_INTERVAL_MS = 15_000;
/** Bounded memory for settled requestIds so stale updates can be recognized. */
const MAX_TRACKED_SETTLED_REQUEST_IDS = 100;
/** Cap for the per-request log-delta map (app-lifetime singleton binding). */
const MAX_TRACKED_STREAM_LOG_IDS = 200;

export function bindMessageStoreIpc(options: BindMessageStoreIpcOptions): () => void {
  const chatClient = createChatClient();
  const settledRequestIds = new Map<string, number>();
  const streamLogState = new Map<string, { blocks: number; chars: number; at: number }>();
  let activeStream: { sessionId: string; requestId: string | null } | null = null;
  let lastStreamActivityAt = 0;

  const markSettled = (requestId: string | null | undefined): void => {
    if (!requestId) return;
    if (settledRequestIds.size >= MAX_TRACKED_SETTLED_REQUEST_IDS) {
      const oldest = settledRequestIds.keys().next().value;
      if (oldest !== undefined) {
        settledRequestIds.delete(oldest);
      }
    }
    settledRequestIds.set(requestId, Date.now());
  };

  const reloadPersistedMessages = (sessionId: string) => {
    // Streaming blocks were folded into the message record in place during
    // generation (applyStreamingBlocksToMessage), so the record already exists and
    // stays mounted. Clearing the stream flag first just stops the high-frequency
    // mutation; loadMessages then swaps the same id to its persisted copy. Same
    // node throughout — no blank, no remount.
    options.clearStreamingState();
    void options.loadMessages(sessionId);
  };

  const reloadPersistedMessagesFromLegacyEvent = (payload?: { conversationId?: string; sessionId?: string }) => {
    const sessionId = payload?.conversationId ?? payload?.sessionId;
    if (!sessionId || sessionId !== options.getActiveSessionId()) {
      return;
    }

    reloadPersistedMessages(sessionId);
  };

  const cleanups = [
    chatClient.onStreamUpdated((payload) => {
      const blocks = payload.blocks as AssistantMessageBlock[];
      // Compact, delta-aware line: repeats (a stale re-publish) show as (+0/+0 …)
      // instead of thousands of unchanged characters (docs/issues/stream-diagnostics-logging).
      const blockCount = blocks?.length ?? 0;
      const charCount = blocks?.reduce((sum, block) => sum + (block.content?.length ?? 0), 0) ?? 0;
      const prevLog = streamLogState.get(payload.requestId);
      if (!prevLog && streamLogState.size >= MAX_TRACKED_STREAM_LOG_IDS) {
        // App-lifetime singleton: evict the oldest entry so the map stays
        // bounded (docs/issues/archives/stream-diagnostics-logging).
        const oldest = streamLogState.keys().next().value;
        if (oldest !== undefined) streamLogState.delete(oldest);
      }
      const delta = prevLog
        ? `(${blockCount - prevLog.blocks >= 0 ? "+" : ""}${blockCount - prevLog.blocks} blocks, ` +
          `${charCount - prevLog.chars >= 0 ? "+" : ""}${charCount - prevLog.chars} chars, ` +
          `+${((Date.now() - prevLog.at) / 1000).toFixed(1)}s)`
        : "(first)";
      streamLogState.set(payload.requestId, { blocks: blockCount, chars: charCount, at: Date.now() });
      console.log(
        `[chat] stream.updated ← ${payload.requestId.slice(0, 8)} session=${payload.sessionId.slice(0, 8)} ` +
          `active=${options.getActiveSessionId()?.slice(0, 8) ?? "none"} blocks=${blockCount} ${delta}`,
      );
      if (prevLog) {
        console.debug(
          `[chat] stream.updated content ← ${payload.requestId.slice(0, 8)}`,
          blocks?.map((b) => `${b.type}:${(b.content ?? "").slice(0, 80)}`).join(" | ") ?? "(none)",
        );
      }
      if (payload.sessionId !== options.getActiveSessionId()) {
        return;
      }
      // A snapshot for a request that already settled is stale (duplicate or
      // reordered delivery); applying it would resurrect a finished stream.
      if (payload.requestId && settledRequestIds.has(payload.requestId)) {
        console.log("[chat] stream.updated ignored (request already settled):", payload.requestId);
        return;
      }

      activeStream = { sessionId: payload.sessionId, requestId: payload.requestId ?? null };
      lastStreamActivityAt = Date.now();
      const streamMessageId = payload.messageId ?? payload.requestId;
      options.setStreamingState({
        sessionId: payload.sessionId,
        messageId: streamMessageId,
        blocks,
      });

      if (
        streamMessageId &&
        options.applyStreamingBlocksToMessage &&
        !options.isEphemeralStreamMessageId(streamMessageId)
      ) {
        options.applyStreamingBlocksToMessage(streamMessageId, payload.sessionId, blocks);
      }
    }),
    chatClient.onStreamCompleted((payload) => {
      console.log(
        "[chat] stream.completed ←",
        payload.requestId,
        "session=",
        payload.sessionId,
        "messageId=",
        payload.messageId,
      );
      if (payload.sessionId !== options.getActiveSessionId()) {
        return;
      }
      markSettled(payload.requestId);
      // A late completion for an older request must not wipe a newer stream's
      // live state for the same session.
      if (activeStream && payload.requestId && activeStream.requestId && activeStream.requestId !== payload.requestId) {
        return;
      }

      activeStream = null;
      reloadPersistedMessages(payload.sessionId);
    }),
    chatClient.onStreamFailed((payload) => {
      console.log("[chat] stream.failed ←", payload.requestId, "session=", payload.sessionId, "error=", payload.error);
      if (payload.sessionId !== options.getActiveSessionId()) {
        return;
      }
      markSettled(payload.requestId);
      if (activeStream && payload.requestId && activeStream.requestId && activeStream.requestId !== payload.requestId) {
        return;
      }

      activeStream = null;
      reloadPersistedMessages(payload.sessionId);
    }),
    onIpcChannel(STREAM_EVENTS.END, (_event, payload) => {
      reloadPersistedMessagesFromLegacyEvent(payload);
    }),
    onIpcChannel(STREAM_EVENTS.ERROR, (_event, payload) => {
      reloadPersistedMessagesFromLegacyEvent(payload);
    }),
    createStreamWatchdog(),
  ];

  /**
   * Recovers the UI when stream events stop arriving for the active session's
   * stream (lost completion event, silent WS). Mirrors the "switch thread and
   * back" workaround: clear streaming state and reload persisted messages.
   */
  function createStreamWatchdog(): () => void {
    const timer = setInterval(() => {
      const current = activeStream;
      if (!current || current.sessionId !== options.getActiveSessionId()) {
        return;
      }
      if (Date.now() - lastStreamActivityAt < STREAM_STALE_AFTER_MS) {
        return;
      }
      console.warn(
        `[chat] stream watchdog: no updates for ${Math.round((Date.now() - lastStreamActivityAt) / 1000)}s ` +
          `(request=${current.requestId ?? "unknown"}, session=${current.sessionId}); reloading persisted messages`,
      );
      activeStream = null;
      reloadPersistedMessages(current.sessionId);
    }, STREAM_WATCHDOG_INTERVAL_MS);
    return () => clearInterval(timer);
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    settledRequestIds.clear();
    streamLogState.clear();
    activeStream = null;
  };
}
