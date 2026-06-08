import { Store } from '@tanstack/store'
import type { AssistantMessageBlock } from '@shared/types/agent-interface'

export const streamStateStore = new Store({
  isStreaming: false,
  streamingBlocks: [] as AssistantMessageBlock[],
  currentStreamSessionId: null as string | null,
  currentStreamMessageId: null as string | null,
  streamRevision: 0
})

export const setStream = (
  sessionId: string,
  blocks: AssistantMessageBlock[],
  messageId?: string
): void => {
  streamStateStore.setState((prev) => ({
    ...prev,
    isStreaming: true,
    currentStreamSessionId: sessionId,
    currentStreamMessageId: messageId ?? null,
    streamingBlocks: blocks,
    streamRevision: prev.streamRevision + 1
  }))
}

export const clearStreamingState = (): void => {
  streamStateStore.setState((prev) => ({
    ...prev,
    isStreaming: false,
    streamingBlocks: [],
    currentStreamSessionId: null,
    currentStreamMessageId: null,
    streamRevision: prev.streamRevision + 1
  }))
}
