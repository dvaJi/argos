import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";

export type AssistantRenderItem =
  | {
      kind: "block";
      key: string;
      block: DisplayAssistantMessageBlock;
    }
  | {
      kind: "activity-group";
      key: string;
      blocks: DisplayAssistantMessageBlock[];
      startedAt: number;
      endedAt: number;
      durationMs: number;
      reasoningCount: number;
      toolCallCount: number;
    };

export type BuildAssistantRenderItemsOptions = {
  blocks: DisplayAssistantMessageBlock[];
  messageId: string;
  messageUpdatedAt: number;
  shouldGroup: boolean;
  isInternalToolCall?: (block: DisplayAssistantMessageBlock) => boolean;
};

export type ActivityDurationLabels = {
  day: string;
  hour: string;
  minute: string;
  second: string;
};

type BufferedActivityBlock = {
  block: DisplayAssistantMessageBlock;
  index: number;
};

const ACTIVITY_BLOCK_TYPES = new Set<DisplayAssistantMessageBlock["type"]>([
  "reasoning_content",
  "artifact-thinking",
  "tool_call",
]);

const isFiniteTimestamp = (value: number): boolean => Number.isFinite(value) && value >= 0;

const normalizeTimestamp = (value: number, fallback: number): number => (isFiniteTimestamp(value) ? value : fallback);

const isReasoningActivityBlock = (block: DisplayAssistantMessageBlock): boolean =>
  (block.type === "reasoning_content" || block.type === "artifact-thinking") &&
  typeof block.content === "string" &&
  block.content.trim().length > 0;

const isEmptyReasoningBlock = (block: DisplayAssistantMessageBlock): boolean =>
  (block.type === "reasoning_content" || block.type === "artifact-thinking") &&
  (typeof block.content !== "string" || block.content.trim().length === 0);

export const isCompletedActivityBlock = (block: DisplayAssistantMessageBlock): boolean => {
  if (!ACTIVITY_BLOCK_TYPES.has(block.type)) {
    return false;
  }

  if (block.status === "loading" || block.status === "pending") {
    return false;
  }

  if (block.type === "tool_call") {
    return true;
  }

  return isReasoningActivityBlock(block);
};

const buildBlockKey = (block: DisplayAssistantMessageBlock, messageId: string, index: number): string => {
  const stableId = block.id ?? block.tool_call?.id;
  return stableId ? `${messageId}:${stableId}` : `${messageId}:${index}`;
};

/**
 * Pi streams status transitions (pending -> completed) as separate blocks that
 * share the same stable ID. Without deduplication these collide as duplicate
 * React keys. We keep the last occurrence per (type, stableId) so the completed
 * version supersedes the pending one at the original position.
 */
const deduplicateBlocks = (blocks: DisplayAssistantMessageBlock[]): DisplayAssistantMessageBlock[] => {
  const keyToIndex = new Map<string, number>();
  const result: DisplayAssistantMessageBlock[] = [];

  for (const block of blocks) {
    const stableId = block.id ?? block.tool_call?.id;
    if (!stableId) {
      result.push(block);
      continue;
    }
    const dedupKey = `${block.type}:${stableId}`;
    const existing = keyToIndex.get(dedupKey);
    if (existing !== undefined) {
      result[existing] = block;
    } else {
      keyToIndex.set(dedupKey, result.length);
      result.push(block);
    }
  }

  return result;
};

const buildGroupKey = (messageId: string, buffer: BufferedActivityBlock[]): string => {
  const first = buffer[0]?.index ?? 0;
  const last = buffer[buffer.length - 1]?.index ?? first;
  return `activity:${messageId}:${first}:${last}`;
};

const countReasoningBlocks = (blocks: DisplayAssistantMessageBlock[]): number =>
  blocks.filter((block) => block.type === "reasoning_content" || block.type === "artifact-thinking").length;

const countToolCallBlocks = (blocks: DisplayAssistantMessageBlock[]): number =>
  blocks.filter((block) => block.type === "tool_call").length;

const buildActivityGroupItem = (
  messageId: string,
  messageUpdatedAt: number,
  buffer: BufferedActivityBlock[],
): AssistantRenderItem | null => {
  const firstBlock = buffer[0]?.block;
  if (!firstBlock) {
    return null;
  }

  const startedAt = normalizeTimestamp(firstBlock.timestamp, messageUpdatedAt);
  const endedAt = Math.max(startedAt, normalizeTimestamp(messageUpdatedAt, startedAt));
  const blocks = buffer.map((item) => item.block);

  return {
    kind: "activity-group",
    key: buildGroupKey(messageId, buffer),
    blocks,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    reasoningCount: countReasoningBlocks(blocks),
    toolCallCount: countToolCallBlocks(blocks),
  };
};

export const buildAssistantRenderItems = ({
  blocks: rawBlocks,
  messageId,
  messageUpdatedAt,
  shouldGroup,
  isInternalToolCall,
}: BuildAssistantRenderItemsOptions): AssistantRenderItem[] => {
  const blocks = deduplicateBlocks(rawBlocks);
  const items: AssistantRenderItem[] = [];
  let activityBuffer: BufferedActivityBlock[] = [];

  const flushActivityBuffer = () => {
    if (activityBuffer.length === 0) {
      return;
    }

    const group = buildActivityGroupItem(messageId, messageUpdatedAt, activityBuffer);
    if (group) {
      items.push(group);
    }
    activityBuffer = [];
  };

  blocks.forEach((block, index) => {
    if (block.type === "tool_call" && isInternalToolCall?.(block)) {
      return;
    }

    if (shouldGroup && isEmptyReasoningBlock(block)) {
      return;
    }

    if (shouldGroup && isCompletedActivityBlock(block)) {
      activityBuffer.push({ block, index });
      return;
    }

    flushActivityBuffer();
    items.push({
      kind: "block",
      key: buildBlockKey(block, messageId, index),
      block,
    });
  });

  flushActivityBuffer();
  return items;
};

export const formatActivityDuration = (durationMs: number, labels: ActivityDurationLabels): string => {
  const safeDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  let remainingSeconds = Math.floor(safeDurationMs / 1000);
  const days = Math.floor(remainingSeconds / 86_400);
  remainingSeconds %= 86_400;
  const hours = Math.floor(remainingSeconds / 3_600);
  remainingSeconds %= 3_600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  const parts = [
    days > 0 ? `${days}${labels.day}` : "",
    hours > 0 ? `${hours}${labels.hour}` : "",
    minutes > 0 ? `${minutes}${labels.minute}` : "",
    seconds > 0 || (days === 0 && hours === 0 && minutes === 0) ? `${seconds}${labels.second}` : "",
  ];
  return parts.filter(Boolean).join("").trimEnd();
};
