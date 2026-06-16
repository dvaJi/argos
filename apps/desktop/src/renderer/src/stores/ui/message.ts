import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createSessionClient } from "../../../api/SessionClient";
import type { DisplayAssistantMessageBlock, DisplayUserMessageContent } from "@/components/chat/messageListItems";
import type {
  AssistantMessageBlock,
  ChatMessageRecord,
  MessageFile,
  MessagePageCursor,
  MessageMetadata,
  SessionWithState,
} from "@shared/types/agent-interface";
import { streamStateStore, setStream, clearStreamingState as _clearStreamState } from "./stream";
import { bindMessageStoreIpc } from "./messageIpc";

const EPHEMERAL_STREAM_MESSAGE_PREFIXES = ["__rate_limit__:"];

type ParsedMessageCacheEntry = {
  updatedAt: number;
  content: string;
  metadata: string;
  assistantBlocks?: DisplayAssistantMessageBlock[];
  prevAssistantBlocks?: DisplayAssistantMessageBlock[];
  userContent?: DisplayUserMessageContent;
  parsedMetadata?: MessageMetadata;
};

export const messageStore = new Store({
  messageIds: [] as string[],
  lastPersistedRevision: 0,
  currentSessionId: null as string | null,
  nextCursor: null as MessagePageCursor | null,
  hasMoreHistory: false,
  isLoadingHistory: false,
});

const sessionClient = createSessionClient();
const messageCache = new Map<string, ChatMessageRecord>();
const parsedMessageCache = new Map<string, ParsedMessageCacheEntry>();
const hydratingStreamMessageIds = new Set<string>();
let latestLoadRequestId = 0;
let latestHistoryRequestId = 0;

export const getMessages = () =>
  messageStore.state.messageIds.map(messageCache.get).filter((m): m is ChatMessageRecord => m !== undefined);

function upsertMessageRecord(record: ChatMessageRecord): void {
  messageCache.set(record.id, record);
  const ids = messageStore.state.messageIds;
  if (!ids.includes(record.id)) {
    const nextIds = [...ids, record.id];
    nextIds.sort((a, b) => {
      const aSeq = messageCache.get(a)?.orderSeq ?? Number.MAX_SAFE_INTEGER;
      const bSeq = messageCache.get(b)?.orderSeq ?? Number.MAX_SAFE_INTEGER;
      return aSeq - bSeq;
    });
    messageStore.setState((prev) => ({ ...prev, messageIds: nextIds }));
  }
}

function getParsedEntry(record: ChatMessageRecord) {
  const cached = parsedMessageCache.get(record.id);
  if (cached) {
    if (cached.content !== record.content) {
      cached.content = record.content;
      cached.prevAssistantBlocks = cached.assistantBlocks;
      delete cached.assistantBlocks;
      delete cached.userContent;
    }

    if (cached.metadata !== record.metadata) {
      cached.metadata = record.metadata;
      delete cached.parsedMetadata;
    }

    cached.updatedAt = record.updatedAt;
    return cached;
  }

  const nextEntry: ParsedMessageCacheEntry = {
    updatedAt: record.updatedAt,
    content: record.content,
    metadata: record.metadata,
  };
  parsedMessageCache.set(record.id, nextEntry);
  return nextEntry;
}

function assistantBlockPayloadEqual(
  previous: DisplayAssistantMessageBlock,
  next: DisplayAssistantMessageBlock,
): boolean {
  return (
    previous.content === next.content &&
    previous.action_type === next.action_type &&
    JSON.stringify(previous.extra) === JSON.stringify(next.extra) &&
    JSON.stringify(previous.tool_call) === JSON.stringify(next.tool_call) &&
    JSON.stringify(previous.artifact) === JSON.stringify(next.artifact) &&
    JSON.stringify(previous.image_data) === JSON.stringify(next.image_data) &&
    JSON.stringify(previous.reasoning_time) === JSON.stringify(next.reasoning_time)
  );
}

function isReusableStableAssistantBlock(
  previous: DisplayAssistantMessageBlock | undefined,
  next: DisplayAssistantMessageBlock,
  index: number,
  blocksLength: number,
): previous is DisplayAssistantMessageBlock {
  if (!previous || index === blocksLength - 1) {
    return false;
  }

  if (previous.status !== next.status || previous.status === "pending" || previous.status === "loading") {
    return false;
  }

  if (previous.type !== next.type || previous.timestamp !== next.timestamp) {
    return false;
  }

  if (previous.id || next.id) {
    if (previous.id !== next.id) return false;
    return assistantBlockPayloadEqual(previous, next);
  }

  if (previous.tool_call?.id || next.tool_call?.id) {
    if (previous.tool_call?.id !== next.tool_call?.id) return false;
    return assistantBlockPayloadEqual(previous, next);
  }

  return assistantBlockPayloadEqual(previous, next);
}

function reuseStableAssistantBlocks(
  blocks: DisplayAssistantMessageBlock[],
  previousBlocks?: DisplayAssistantMessageBlock[],
): DisplayAssistantMessageBlock[] {
  if (!previousBlocks?.length || blocks.length === 0) {
    return blocks;
  }

  return blocks.map((block, index) =>
    isReusableStableAssistantBlock(previousBlocks[index], block, index, blocks.length) ? previousBlocks[index] : block,
  );
}

export function getAssistantMessageBlocks(record: ChatMessageRecord): DisplayAssistantMessageBlock[] {
  const entry = getParsedEntry(record);
  if (entry.assistantBlocks) {
    return entry.assistantBlocks;
  }

  try {
    const parsed = JSON.parse(record.content) as DisplayAssistantMessageBlock[];
    const blocks = Array.isArray(parsed) ? parsed : [];
    entry.assistantBlocks = reuseStableAssistantBlocks(blocks, entry.prevAssistantBlocks);
  } catch {
    entry.assistantBlocks = [];
  }

  entry.prevAssistantBlocks = entry.assistantBlocks;
  return entry.assistantBlocks;
}

export function getUserMessageContent(record: ChatMessageRecord): DisplayUserMessageContent {
  const entry = getParsedEntry(record);
  if (entry.userContent) {
    return entry.userContent;
  }

  try {
    const parsed = JSON.parse(record.content) as DisplayUserMessageContent;
    if (parsed && typeof parsed === "object") {
      entry.userContent = {
        text: parsed.text ?? "",
        files: parsed.files ?? [],
        links: parsed.links ?? [],
        search: parsed.search ?? false,
        think: parsed.think ?? false,
        continue: parsed.continue,
        resources: parsed.resources,
        prompts: parsed.prompts,
        content: parsed.content,
      };
      return entry.userContent;
    }
  } catch {}

  entry.userContent = {
    text: "",
    files: [],
    links: [],
    search: false,
    think: false,
  };
  return entry.userContent;
}

export function getMessageMetadata(record: ChatMessageRecord): MessageMetadata {
  const entry = getParsedEntry(record);
  if (entry.parsedMetadata) {
    return entry.parsedMetadata;
  }

  try {
    const parsed = JSON.parse(record.metadata) as MessageMetadata;
    entry.parsedMetadata = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    entry.parsedMetadata = {};
  }

  return entry.parsedMetadata;
}

export function setCurrentSessionId(sessionId: string | null): void {
  messageStore.setState((prev) => ({ ...prev, currentSessionId: sessionId }));
}

function isCurrentLoadRequest(requestId: number, sessionId: string): boolean {
  return requestId === latestLoadRequestId && messageStore.state.currentSessionId === sessionId;
}

function isCurrentHistoryRequest(requestId: number, sessionId: string): boolean {
  return requestId === latestHistoryRequestId && messageStore.state.currentSessionId === sessionId;
}

async function restoreMessageWindow(
  sessionId: string,
  desiredCount: number,
  requestId: number,
): Promise<Awaited<ReturnType<typeof sessionClient.restore>> | null> {
  const initialLimit = Math.min(Math.max(desiredCount, 40), 500);
  const restored = await sessionClient.restore(sessionId, initialLimit);
  if (!isCurrentLoadRequest(requestId, sessionId)) {
    return null;
  }

  if (!restored.hasMore || !restored.nextCursor || restored.messages.length >= desiredCount) {
    return restored;
  }

  const seenIds = new Set(restored.messages.map((message) => message.id));
  let messages = restored.messages;
  let nextCursorValue: { orderSeq: number; id: string } | null = restored.nextCursor;
  let hasMoreValue: boolean = restored.hasMore;

  while (messages.length < desiredCount && hasMoreValue && nextCursorValue) {
    const page = await sessionClient.listMessagesPage(sessionId, {
      cursor: nextCursorValue,
      limit: Math.min(Math.max(desiredCount - messages.length, 1), 500),
    });
    if (!isCurrentLoadRequest(requestId, sessionId)) {
      return null;
    }

    const uniqueMessages = page.messages.filter((message) => {
      if (seenIds.has(message.id)) {
        return false;
      }
      seenIds.add(message.id);
      return true;
    });

    if (uniqueMessages.length > 0) {
      messages = [...uniqueMessages, ...messages];
    }

    nextCursorValue = page.nextCursor;
    hasMoreValue = page.hasMore;

    if (page.messages.length === 0) {
      break;
    }
  }

  return {
    session: restored.session,
    messages,
    nextCursor: nextCursorValue,
    hasMore: hasMoreValue,
  };
}

export async function loadMessages(sessionId: string, desiredCountOverride?: number): Promise<SessionWithState | null> {
  const desiredCount =
    desiredCountOverride ??
    (messageStore.state.currentSessionId === sessionId ? Math.max(messageStore.state.messageIds.length, 100) : 100);
  const requestId = ++latestLoadRequestId;
  latestHistoryRequestId += 1;
  setCurrentSessionId(sessionId);
  messageStore.setState((prev) => ({ ...prev, isLoadingHistory: false }));
  try {
    const restored = await restoreMessageWindow(sessionId, desiredCount, requestId);
    if (!restored) {
      return null;
    }
    const result = restored.messages;
    if (!isCurrentLoadRequest(requestId, sessionId)) {
      return null;
    }

    const nextMessageCache = new Map<string, ChatMessageRecord>();
    const nextMessageIds: string[] = [];
    for (const msg of result) {
      nextMessageCache.set(msg.id, msg);
      nextMessageIds.push(msg.id);
    }

    parsedMessageCache.clear();
    hydratingStreamMessageIds.clear();
    messageCache.clear();
    for (const [k, v] of nextMessageCache) {
      messageCache.set(k, v);
    }
    messageStore.setState((prev) => ({
      ...prev,
      messageIds: nextMessageIds,
      nextCursor: restored.nextCursor,
      hasMoreHistory: restored.hasMore,
      lastPersistedRevision: prev.lastPersistedRevision + 1,
    }));
    return restored.session;
  } catch (e) {
    console.error("Failed to load messages:", e);
    return null;
  }
}

export async function loadOlderMessages(): Promise<number> {
  if (
    !messageStore.state.currentSessionId ||
    !messageStore.state.hasMoreHistory ||
    messageStore.state.isLoadingHistory
  ) {
    return 0;
  }

  const sessionId = messageStore.state.currentSessionId;
  const requestId = ++latestHistoryRequestId;
  messageStore.setState((prev) => ({ ...prev, isLoadingHistory: true }));
  try {
    const page = await sessionClient.listMessagesPage(sessionId, {
      cursor: messageStore.state.nextCursor,
      limit: 100,
    });
    if (!isCurrentHistoryRequest(requestId, sessionId)) {
      return 0;
    }
    const incomingIds: string[] = [];
    for (const msg of page.messages) {
      messageCache.set(msg.id, msg);
      incomingIds.push(msg.id);
    }

    let nextIds = messageStore.state.messageIds;
    if (incomingIds.length > 0) {
      const existingIds = new Set(nextIds);
      nextIds = [...incomingIds.filter((id) => !existingIds.has(id)), ...nextIds];
    }

    messageStore.setState((prev) => ({
      ...prev,
      messageIds: nextIds,
      nextCursor: page.nextCursor,
      hasMoreHistory: page.hasMore,
      lastPersistedRevision: incomingIds.length > 0 ? prev.lastPersistedRevision + 1 : prev.lastPersistedRevision,
    }));
    return incomingIds.length;
  } catch (error) {
    console.error("Failed to load older messages:", error);
    return 0;
  } finally {
    if (isCurrentHistoryRequest(requestId, sessionId)) {
      messageStore.setState((prev) => ({ ...prev, isLoadingHistory: false }));
    }
  }
}

export async function getMessage(id: string): Promise<ChatMessageRecord | null> {
  const cached = messageCache.get(id);
  if (cached) return cached;
  return null;
}

export function addOptimisticUserMessage(sessionId: string, text: string, files: MessageFile[] = []): void {
  const id = `__optimistic_user_${Date.now()}`;
  const record: ChatMessageRecord = {
    id,
    sessionId,
    orderSeq: messageStore.state.messageIds.length + 1,
    role: "user",
    content: JSON.stringify({ text, files, links: [], search: false, think: false }),
    status: "sent",
    isContextEdge: 0,
    metadata: "{}",
    traceCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  messageCache.set(id, record);
  messageStore.setState((prev) => ({ ...prev, messageIds: [...prev.messageIds, id] }));
}

export function clear(): void {
  latestLoadRequestId += 1;
  latestHistoryRequestId += 1;
  setCurrentSessionId(null);
  messageCache.clear();
  parsedMessageCache.clear();
  hydratingStreamMessageIds.clear();
  messageStore.setState((prev) => ({
    ...prev,
    messageIds: [],
    nextCursor: null,
    hasMoreHistory: false,
    isLoadingHistory: false,
  }));
  clearStreamingState();
}

export function clearStreamingState(): void {
  _clearStreamState();
}

function isEphemeralStreamMessageId(messageId: string): boolean {
  return EPHEMERAL_STREAM_MESSAGE_PREFIXES.some((prefix) => messageId.startsWith(prefix));
}

export function applyStreamingBlocksToMessage(
  messageId: string,
  conversationId: string,
  blocks: AssistantMessageBlock[],
): void {
  const serializedBlocks = JSON.stringify(blocks);
  const existing = messageCache.get(messageId);
  if (existing) {
    if (existing.sessionId !== conversationId) return;
    if (existing.content === serializedBlocks && existing.status === "pending") {
      return;
    }
    upsertMessageRecord({
      ...existing,
      content: serializedBlocks,
      status: "pending",
      updatedAt: Date.now(),
    });
    return;
  }

  if (hydratingStreamMessageIds.has(messageId)) return;
  hydratingStreamMessageIds.add(messageId);
  upsertMessageRecord({
    id: messageId,
    sessionId: conversationId,
    orderSeq: messageStore.state.messageIds.length + 1,
    role: "assistant",
    content: serializedBlocks,
    status: "pending",
    isContextEdge: 0,
    metadata: "{}",
    traceCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  hydratingStreamMessageIds.delete(messageId);
}

const cleanupIpc = bindMessageStoreIpc({
  getActiveSessionId: () => messageStore.state.currentSessionId,
  setStreamingState: ({ sessionId, messageId, blocks }) => {
    setStream(sessionId, blocks, messageId);
  },
  clearStreamingState,
  loadMessages,
  applyStreamingBlocksToMessage,
  isEphemeralStreamMessageId,
});

export function cleanupMessageStore(): void {
  cleanupIpc();
}

export function useMessageStore() {
  const state = useStore(messageStore);
  return {
    ...state,
    getMessages,
    getAssistantMessageBlocks,
    getUserMessageContent,
    getMessageMetadata,
    setCurrentSessionId,
    loadMessages,
    loadOlderMessages,
    getMessage,
    addOptimisticUserMessage,
    clear,
    clearStreamingState,
    applyStreamingBlocksToMessage,
    cleanupMessageStore,
  };
}
