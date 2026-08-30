import { type FC, useState } from "react";
import { useSelector } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import { FoldContentRow } from "./FoldContentRow";
import { FoldGroupRow } from "./FoldGroupRow";
import { DURATION_LABELS, type FoldGroup, isReasoningBlock } from "./MessageTurnFold.shared";
import { formatActivityDuration } from "./messageActivityGroups";
import { uiSettingsStore } from "#/stores/uiSettingsStore";

// ---------------------------------------------------------------------------
// Turn fold
// ---------------------------------------------------------------------------

interface MessageTurnFoldProps {
  blocks: DisplayAssistantMessageBlock[];
  messageId: string;
  threadId: string;
  durationMs: number;
  onToggleCollapse?: (isCollapsed: boolean) => void;
}

/**
 * Collapse all work between content (narrative) blocks into a single row —
 * t3code `deriveMessagesTimelineRows` groups consecutive work entries
 * regardless of kind ("Used 1 tool and ran 1 command"). Reasoning is part of
 * the work stream, so it folds into the same group instead of splitting it.
 * Content blocks break the run and stay as their own rows; other non-activity
 * blocks that render nothing inside the fold (placeholder actions, plans) are
 * skipped entirely so they don't split a run into size-1 groups.
 */
const collapseFoldBlocks = (
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
    const last = items.at(-1);
    if (last && "blocks" in last) {
      last.blocks.push(block);
    } else {
      // Start (or restart after a content boundary) an activity group.
      items.push({
        kind: "activity",
        blocks: [block],
      });
    }
  }
  return items;
};

/**
 * Stable per-block key: prefer the block id or tool_call id, else derive a
 * deterministic key from type/timestamp/name/content. Duplicate fallbacks get
 * a `#n` suffix so sibling keys stay unique (legacy history can contain
 * several id-less blocks with identical timestamps and content).
 */
const blockKey = (block: DisplayAssistantMessageBlock): string =>
  block.id ??
  block.tool_call?.id ??
  `${block.type}:${block.timestamp ?? "no-ts"}:${block.tool_call?.name ?? "anonymous"}:${Array.isArray(block.content) ? block.content.join("").length : (block.content?.length ?? 0)}`;
const buildGroupItems = (
  blocks: DisplayAssistantMessageBlock[],
): Array<{
  key: string;
  item:
    | FoldGroup
    | {
        kind: "content";
        block: DisplayAssistantMessageBlock;
      };
}> => {
  const items: Array<{
    key: string;
    item:
      | FoldGroup
      | {
          kind: "content";
          block: DisplayAssistantMessageBlock;
        };
  }> = [];
  // Dedup fallback keys within this fold only, so identical id-less blocks in
  // different messages keep stable, independent identities.
  const seen = new Map<string, number>();
  const keyForBlock = (block: DisplayAssistantMessageBlock): string => {
    const base = blockKey(block);
    const duplicateCount = seen.get(base) ?? 0;
    seen.set(base, duplicateCount + 1);
    return duplicateCount === 0 ? base : `${base}#${duplicateCount}`;
  };
  for (const groupItem of collapseFoldBlocks(blocks)) {
    if (groupItem.kind === "content") {
      items.push({
        key: keyForBlock(groupItem.block),
        item: groupItem,
      });
      continue;
    }
    // A group spans N blocks — anchor its key on the first block so the row
    // keeps a stable identity while the run grows.
    const firstBlock = groupItem.blocks[0];
    items.push({
      key: `group:${groupItem.kind}:${firstBlock ? keyForBlock(firstBlock) : groupItem.blocks.length}`,
      item: groupItem,
    });
  }
  return items;
};
export const MessageTurnFold: FC<MessageTurnFoldProps> = ({
  blocks,
  messageId,
  threadId,
  durationMs,
  onToggleCollapse,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hideReasoningOnFinishedTurn = useSelector(uiSettingsStore, (s) => s.hideReasoningOnFinishedTurn);
  const durationText = formatActivityDuration(durationMs, DURATION_LABELS);
  const label = durationMs >= 1000 ? `Worked for ${durationText}` : "Worked";
  // Thinking is only shown while the turn is live; once settled the fold can
  // drop it entirely (setting) so the summary stays clean.
  const groupItems = buildGroupItems(hideReasoningOnFinishedTurn ? blocks.filter((b) => !isReasoningBlock(b)) : blocks);
  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    onToggleCollapse?.(!next);
  };
  return (
    <div className="flex w-full flex-col" data-testid="turn-fold">
      <button
        type="button"
        data-testid="turn-fold-toggle"
        aria-expanded={isExpanded}
        aria-label={isExpanded ? `Collapse: ${label}` : `Expand: ${label}`}
        onClick={toggleExpanded}
        className="inline-flex max-w-full min-w-0 items-center gap-1 self-start rounded-sm text-xs leading-4 text-muted-foreground tabular-nums select-none transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Icon
          icon="hugeicons:arrow-right-01"
          className={`h-[14px] w-[14px] shrink-0 transition-transform duration-(--dc-motion-fast) ease-(--dc-ease-out-soft) motion-reduce:transition-none ${isExpanded ? "rotate-90" : "rotate-0"}`}
        />
        <span className="min-w-0 truncate">{label}</span>
      </button>

      <div
        className={`grid w-full overflow-hidden transition-[grid-template-rows,opacity] duration-(--dc-motion-default) ease-(--dc-ease-out-express) motion-reduce:transition-none ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] pointer-events-none opacity-0"}`}
        aria-hidden={!isExpanded}
        inert={isExpanded ? undefined : true}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-1 flex w-full flex-col gap-px" data-testid="turn-fold-body">
            {groupItems.map(({ key, item }) =>
              item.kind === "content" ? (
                <FoldContentRow key={key} block={item.block} messageId={messageId} threadId={threadId} />
              ) : (
                <FoldGroupRow key={key} group={item} />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
