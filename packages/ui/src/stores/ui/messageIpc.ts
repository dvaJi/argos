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

export function bindMessageStoreIpc(options: BindMessageStoreIpcOptions): () => void {
  const chatClient = createChatClient();
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
      const contentPreview = blocks?.map((b) => `${b.type}:${(b.content ?? "").slice(0, 80)}`).join(" | ") ?? "(none)";
      console.log(
        "[chat] stream.updated ←",
        payload.requestId,
        "session=",
        payload.sessionId,
        "active=",
        options.getActiveSessionId(),
        "blocks=",
        payload.blocks?.length,
        "content=",
        contentPreview,
      );
      if (payload.sessionId !== options.getActiveSessionId()) {
        return;
      }

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

      reloadPersistedMessages(payload.sessionId);
    }),
    chatClient.onStreamFailed((payload) => {
      console.log("[chat] stream.failed ←", payload.requestId, "session=", payload.sessionId, "error=", payload.error);
      if (payload.sessionId !== options.getActiveSessionId()) {
        return;
      }

      reloadPersistedMessages(payload.sessionId);
    }),
    onIpcChannel(STREAM_EVENTS.END, (_event, payload) => {
      reloadPersistedMessagesFromLegacyEvent(payload);
    }),
    onIpcChannel(STREAM_EVENTS.ERROR, (_event, payload) => {
      reloadPersistedMessagesFromLegacyEvent(payload);
    }),
  ];

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
