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
  /** Work rows between narrative blocks: each tool call is its own row;
   *  consecutive reasoning blocks collapse into a single thought row. */
  kind: "activity";
  blocks: DisplayAssistantMessageBlock[];
}

/**
 * Lay out the work between content (narrative) blocks as fold rows. Each tool
 * call is its own row ("Ran bun test", "Read foo.ts") so actions stay
 * individually expandable; consecutive reasoning blocks merge into a single
 * "Thought for …" row so streamed thinking chunks don't become a wall of tiny
 * rows with split durations. Content blocks break the stream and stay as their
 * own rows; other non-activity blocks that render nothing inside the fold
 * (placeholder actions, plans) are skipped entirely so they don't create gaps.
 */
export const collapseFoldBlocks = (
  blocks: DisplayAssistantMessageBlock[],
): Array<
  | FoldGroup
  | {
      kind: "content";
      block: DisplayAssistantMessageBlock;
    }
> => {
  const items: Array<
    | FoldGroup
    | {
        kind: "content";
        block: DisplayAssistantMessageBlock;
      }
  > = [];
  for (const block of blocks) {
    if (block.type === "content") {
      items.push({
        kind: "content",
        block,
      });
      continue;
    }
    if (block.type !== "tool_call" && !isReasoningBlock(block)) {
      // Invisible inside the fold (MessageBlockContent would render nothing
      // meaningful here) — must not split a run.
      continue;
    }
    if (block.type === "tool_call") {
      // One row per action — each tool call stays individually expandable.
      items.push({
        kind: "activity",
        blocks: [block],
      });
      continue;
    }
    // Reasoning: merge consecutive thinking blocks into one row.
    const last = items.at(-1);
    if (last && "blocks" in last && last.blocks.every(isReasoningBlock)) {
      last.blocks.push(block);
    } else {
      // Start (or restart after a content/action boundary) a thought run.
      items.push({
        kind: "activity",
        blocks: [block],
      });
    }
  }
  return items;
};
