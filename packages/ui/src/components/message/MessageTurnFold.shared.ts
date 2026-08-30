import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";

/** Duration units for `formatActivityDuration` fold labels. */
export const DURATION_LABELS = {
  day: "d",
  hour: "h",
  minute: "m",
  second: "s",
} as const;

export const isReasoningBlock = (block: DisplayAssistantMessageBlock): boolean =>
  block.type === "reasoning_content" || block.type === "artifact-thinking";

export interface FoldGroup {
  /** One work unit between narrative blocks: tool calls of any kind plus the
   *  reasoning stream, collapsed into a single row. */
  kind: "activity";
  blocks: DisplayAssistantMessageBlock[];
}
