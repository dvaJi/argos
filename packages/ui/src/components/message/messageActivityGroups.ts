import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";

export type AssistantRenderItem =
  | {
      kind: "block";
      key: string;
      block: DisplayAssistantMessageBlock;
    }
  | {
      kind: "turn-fold";
      key: string;
      blocks: DisplayAssistantMessageBlock[];
      startedAt: number;
      endedAt: number;
      durationMs: number;
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

type BufferedFoldBlock = {
  block: DisplayAssistantMessageBlock;
  index: number;
};

const ACTIVITY_BLOCK_TYPES = new Set<DisplayAssistantMessageBlock["type"]>([
  "reasoning_content",
  "artifact-thinking",
  "tool_call",
]);

const isFiniteTimestamp = (value: number): boolean => Number.isFinite(value) && value >= 0;

const isEmptyReasoningBlock = (block: DisplayAssistantMessageBlock): boolean =>
  (block.type === "reasoning_content" || block.type === "artifact-thinking") &&
  (typeof block.content !== "string" || block.content.trim().length === 0);

const isCompletedActivityBlock = (block: DisplayAssistantMessageBlock): boolean => {
  if (!ACTIVITY_BLOCK_TYPES.has(block.type)) {
    return false;
  }

  if (block.status === "loading" || block.status === "pending") {
    return false;
  }

  if (block.type === "tool_call") {
    return true;
  }

  return typeof block.content === "string" && block.content.trim().length > 0;
};

const RATE_LIMIT_VISIBILITY_WINDOW_MS = 180_000;

/**
 * Blocks that produce no DOM in settled history must not split folds (nor
 * remain as invisible standalone items): placeholder actions without
 * `needContinue` (MessageBlockAction renders null for them; question_request
 * actions stay visible via MessageBlockQuestionRequest) and rate-limit blocks
 * long past their active window. They fold along with surrounding work and
 * stay hidden inside it.
 */
const isInvisibleInHistory = (block: DisplayAssistantMessageBlock, messageUpdatedAt: number): boolean => {
  if (block.type !== "action") {
    return false;
  }
  if (block.action_type === "rate_limit") {
    return messageUpdatedAt - block.timestamp >= RATE_LIMIT_VISIBILITY_WINDOW_MS;
  }
  if (block.action_type === "question_request") {
    return false;
  }
  return !block.extra?.needContinue;
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
 *
 * Plan blocks share one logical identity: the ACP mapper emits a fresh,
 * id-less plan block on every plan update notification (one per status
 * transition). Without this, history shows one plan card per update.
 */
const deduplicateBlocks = (blocks: DisplayAssistantMessageBlock[]): DisplayAssistantMessageBlock[] => {
  const keyToIndex = new Map<string, number>();
  const result: DisplayAssistantMessageBlock[] = [];

  for (const block of blocks) {
    const stableId = block.id ?? block.tool_call?.id ?? (block.type === "plan" ? "__plan__" : undefined);
    if (!stableId) {
      result.push(block);
      continue;
    }
    const dedupKey = block.type === "plan" ? "plan" : `${block.type}:${stableId}`;
    const existing = keyToIndex.get(dedupKey);
    if (existing !== undefined) {
      // Plan updates supersede with the latest entries but keep the earliest
      // timestamp so the card stays where the plan was first announced.
      result[existing] =
        block.type === "plan" ? { ...block, timestamp: Math.min(block.timestamp, result[existing].timestamp) } : block;
    } else {
      keyToIndex.set(dedupKey, result.length);
      result.push(block);
    }
  }

  return result;
};

type OrderedBlock = {
  block: DisplayAssistantMessageBlock;
  index: number;
};

/**
 * Chronological order is the source of truth for settled history: persisted
 * block order may lag the original stream order. Blocks with missing/invalid
 * timestamps keep their relative order at the end.
 */
const compareByTimestamp = (a: OrderedBlock, b: OrderedBlock): number => {
  const ta =
    isFiniteTimestamp(a.block.timestamp) && a.block.timestamp > 0 ? a.block.timestamp : Number.POSITIVE_INFINITY;
  const tb =
    isFiniteTimestamp(b.block.timestamp) && b.block.timestamp > 0 ? b.block.timestamp : Number.POSITIVE_INFINITY;
  return ta - tb || a.index - b.index;
};

/**
 * Boundary blocks that render nothing (auto-granted permission actions, etc.)
 * split folds without leaving any visible gap. Merge folds that end up adjacent
 * in the final item list, and unwrap a fold that covers a single block — chrome
 * around one item is pure overhead.
 */
const compactRenderItems = (items: AssistantRenderItem[]): AssistantRenderItem[] => {
  const merged: AssistantRenderItem[] = [];

  for (const item of items) {
    const prev = merged[merged.length - 1];
    if (item.kind === "turn-fold" && prev?.kind === "turn-fold") {
      prev.blocks.push(...item.blocks);
      prev.startedAt = Math.min(prev.startedAt, item.startedAt);
      prev.endedAt = Math.max(prev.endedAt, item.endedAt);
      prev.durationMs = prev.endedAt - prev.startedAt;
      prev.key = `${prev.key}+${item.key}`;
      continue;
    }
    merged.push(item);
  }

  return merged.map((item) =>
    item.kind === "turn-fold" && item.blocks.length === 1
      ? { kind: "block", key: item.key, block: item.blocks[0] }
      : item,
  );
};

const buildFoldKey = (messageId: string, buffer: BufferedFoldBlock[]): string => {
  const first = buffer[0]?.index ?? 0;
  const last = buffer[buffer.length - 1]?.index ?? first;
  return `turnfold:${messageId}:${first}:${last}`;
};

const buildTurnFoldItem = (
  messageId: string,
  messageUpdatedAt: number,
  buffer: BufferedFoldBlock[],
): AssistantRenderItem | null => {
  if (buffer.length === 0) {
    return null;
  }

  const activityTimestamps: number[] = [];
  for (const { block } of buffer) {
    if (isCompletedActivityBlock(block)) {
      activityTimestamps.push(block.timestamp);
    }
  }
  const finiteTimestamps = activityTimestamps.filter(isFiniteTimestamp);

  let startedAt = messageUpdatedAt;
  let endedAt = messageUpdatedAt;
  for (const timestamp of finiteTimestamps) {
    if (timestamp < startedAt) startedAt = timestamp;
    if (timestamp > endedAt) endedAt = timestamp;
  }

  return {
    kind: "turn-fold",
    key: buildFoldKey(messageId, buffer),
    blocks: buffer.map((item) => item.block),
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
  };
};

/**
 * Settled messages fold turn activity t3code-style: every completed
 * reasoning/tool-call block — together with any interim content text between
 * them — collapses into a single "turn fold" row ("Worked for 22s"). Content
 * text that trails the final activity block (the turn's answer) stays visible
 * below the fold. Visual boundaries (non-content, non-activity blocks like
 * plans, searches, questions, media) close the current fold so they keep
 * their place in the stream. Blocks are timestamp-sorted first so folded and
 * visible items render in true chronological order.
 */
export const buildAssistantRenderItems = ({
  blocks: rawBlocks,
  messageId,
  messageUpdatedAt,
  shouldGroup,
  isInternalToolCall,
}: BuildAssistantRenderItemsOptions): AssistantRenderItem[] => {
  const blocks = deduplicateBlocks(rawBlocks);
  const ordered: OrderedBlock[] = blocks.map((block, index) => ({ block, index }));
  if (shouldGroup) {
    ordered.sort(compareByTimestamp);
  }

  const items: AssistantRenderItem[] = [];
  let foldBuffer: BufferedFoldBlock[] = [];

  const flushFoldBuffer = () => {
    if (foldBuffer.length === 0) {
      return;
    }

    // Fold ends at the last activity block: content text after it is the
    // turn's visible answer and must stay outside the fold.
    let lastActivityPos = -1;
    foldBuffer.forEach((entry, position) => {
      if (isCompletedActivityBlock(entry.block)) {
        lastActivityPos = position;
      }
    });

    if (lastActivityPos >= 0) {
      const fold = buildTurnFoldItem(messageId, messageUpdatedAt, foldBuffer.slice(0, lastActivityPos + 1));
      if (fold) {
        items.push(fold);
      }
      foldBuffer = foldBuffer.slice(lastActivityPos + 1);
    }

    foldBuffer.forEach(({ block, index }) => {
      if (isInvisibleInHistory(block, messageUpdatedAt)) {
        return;
      }
      items.push({
        kind: "block",
        key: buildBlockKey(block, messageId, index),
        block,
      });
    });
    foldBuffer = [];
  };

  ordered.forEach(({ block, index }) => {
    if (block.type === "tool_call" && isInternalToolCall?.(block)) {
      return;
    }

    if (shouldGroup && isEmptyReasoningBlock(block)) {
      return;
    }

    if (
      shouldGroup &&
      (isCompletedActivityBlock(block) || block.type === "content" || isInvisibleInHistory(block, messageUpdatedAt))
    ) {
      foldBuffer.push({ block, index });
      return;
    }

    flushFoldBuffer();
    items.push({
      kind: "block",
      key: buildBlockKey(block, messageId, index),
      block,
    });
  });

  flushFoldBuffer();
  return compactRenderItems(items);
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
  return parts.filter(Boolean).join(" ").trimEnd();
};
