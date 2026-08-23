import { type FC, memo, useCallback, useMemo, useState } from "react";
import { useSelector } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import { MessageBlockContent } from "./MessageBlockContent";
import { formatActivityDuration } from "./messageActivityGroups";
import { uiSettingsStore } from "#/stores/uiSettingsStore";

interface MessageTurnFoldProps {
  blocks: DisplayAssistantMessageBlock[];
  messageId: string;
  threadId: string;
  durationMs: number;
  onToggleCollapse?: (isCollapsed: boolean) => void;
}

const DURATION_LABELS = { day: "d", hour: "h", minute: "m", second: "s" } as const;

const BODY_CLASSES =
  "mt-1 ms-6 border-s border-border/45 ps-3 font-mono text-[11px] leading-relaxed wrap-break-word whitespace-pre-wrap text-muted-foreground";

// ---------------------------------------------------------------------------
// Row labels: t3code-style verb phrases with per-tool-type icons.
// ---------------------------------------------------------------------------

const capitalize = (value: string): string => (value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value);

const truncateText = (value: string, max = 72): string =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

const basename = (value: string): string => {
  const normalized = value.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
};

const parseToolParams = (raw?: string): Record<string, unknown> => {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const firstString = (params: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
};

const COMMAND_TOOL_RE = /(bash|shell|terminal|run_command|powershell|exec)/i;
const READ_TOOL_RE = /(read|view|list|image|fetch|grep|search_files|get_file)/i;
const WRITE_TOOL_RE = /(write|edit|patch|replace|remove|delete|create|move|copy|rename|mkdir)/i;

/** t3code-style fold row kinds — used for icons and per-kind heading counts. */
type FoldRowKind = "reasoning" | "command" | "read" | "write" | "tool";

const toolRowKind = (block: DisplayAssistantMessageBlock): FoldRowKind => {
  const name = block.tool_call?.name?.trim() || "tool";
  const params = parseToolParams(block.tool_call?.params);
  const command = firstString(params, ["command", "cmd"]);
  if (COMMAND_TOOL_RE.test(name) || (command && /(run|exec|shell)/i.test(name))) {
    return "command";
  }
  if (READ_TOOL_RE.test(name)) {
    return "read";
  }
  if (WRITE_TOOL_RE.test(name)) {
    return "write";
  }
  return "tool";
};

const isReasoningBlock = (block: DisplayAssistantMessageBlock): boolean =>
  block.type === "reasoning_content" || block.type === "artifact-thinking";

interface FoldGroup {
  /** One work unit between narrative blocks: tool calls of any kind plus the
   *  reasoning stream, collapsed into a single row. */
  kind: "activity";
  blocks: DisplayAssistantMessageBlock[];
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
): Array<FoldGroup | { kind: "content"; block: DisplayAssistantMessageBlock }> => {
  const items: Array<FoldGroup | { kind: "content"; block: DisplayAssistantMessageBlock }> = [];
  for (const block of blocks) {
    if (block.type === "content") {
      items.push({ kind: "content", block });
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
      items.push({ kind: "activity", blocks: [block] });
    }
  }
  return items;
};

interface ToolRowMeta {
  icon: string;
  heading: string;
}

/** HugeIcons per fold kind (loaded on demand by @iconify/react). */
const FOLD_KIND_ICON: Record<FoldRowKind, string> = {
  command: "hugeicons:command-line",
  read: "hugeicons:eye",
  write: "hugeicons:pencil-edit-01",
  tool: "hugeicons:wrench-01",
  reasoning: "hugeicons:brain-01",
};

const pluralize = (count: number, singular: string, plural?: string): string =>
  count === 1 ? singular : (plural ?? `${singular}s`);

const toolRowMeta = (block: DisplayAssistantMessageBlock): ToolRowMeta => {
  const name = block.tool_call?.name?.trim() || "tool";
  const params = parseToolParams(block.tool_call?.params);
  const command = firstString(params, ["command", "cmd"]);
  const file = basename(firstString(params, ["path", "filePath", "file", "filename", "target"]));

  if (COMMAND_TOOL_RE.test(name) || (command && /(run|exec|shell)/i.test(name))) {
    return { icon: "hugeicons:command-line", heading: command ? `Ran ${truncateText(command, 48)}` : "Ran command" };
  }
  if (READ_TOOL_RE.test(name)) {
    return { icon: "hugeicons:eye", heading: file ? `Read ${file}` : capitalize(name.replace(/[_-]+/g, " ")) };
  }
  if (WRITE_TOOL_RE.test(name)) {
    const verb = /(remove|delete)/i.test(name) ? "Removed" : /(create|write|mkdir)/i.test(name) ? "Created" : "Edited";
    return { icon: "hugeicons:pencil-edit-01", heading: file ? `${verb} ${file}` : `${verb} file` };
  }
  if (block.tool_call?.server_name) {
    return { icon: "hugeicons:wrench-01", heading: `Called ${truncateText(name)}` };
  }
  return { icon: "hugeicons:settings-01", heading: `Called ${truncateText(name)}` };
};

/** Sums the reasoning time across a group's thinking blocks. */
const sumReasoningMs = (blocks: DisplayAssistantMessageBlock[]): number => {
  let totalMs = 0;
  for (const block of blocks) {
    const range = block.reasoning_time;
    if (range && typeof range === "object" && typeof range.start === "number" && typeof range.end === "number") {
      totalMs += Math.max(0, range.end - range.start);
    }
  }
  return totalMs;
};

/** t3code-style "Thought for Xs" label for a run of thinking blocks. */
const thoughtLabel = (totalMs: number): string =>
  totalMs > 0 ? `Thought for ${formatActivityDuration(totalMs, DURATION_LABELS)}` : "Thought";

/** Aggregate heading for a collapsed group (t3code "Ran 8 commands" /
 *  "Used 1 tool and ran 1 command"). Composes per-kind counts for mixed runs
 *  and appends the folded thought time when reasoning is present. */
const groupHeading = (group: FoldGroup): string => {
  const blocks = group.blocks;
  const reasoningMs = sumReasoningMs(blocks);
  const hasReasoning = blocks.some(isReasoningBlock);
  const toolBlocks = blocks.filter((block) => block.type === "tool_call");

  // A group that is only thinking renders a single "Thought for …" row.
  if (toolBlocks.length === 0 && hasReasoning) {
    return thoughtLabel(reasoningMs);
  }

  let commands = 0;
  let reads = 0;
  let writes = 0;
  let tools = 0;
  let firstWriteVerb: string | null = null;
  for (const block of toolBlocks) {
    switch (toolRowKind(block)) {
      case "command":
        commands += 1;
        break;
      case "read":
        reads += 1;
        break;
      case "write": {
        writes += 1;
        const name = block.tool_call?.name ?? "";
        firstWriteVerb ??= /(remove|delete)/i.test(name)
          ? "Removed"
          : /(create|write|mkdir)/i.test(name)
            ? "Created"
            : "Edited";
        break;
      }
      default:
        tools += 1;
        break;
    }
  }

  const parts: string[] = [];
  if (commands > 0) parts.push(`Ran ${commands} ${pluralize(commands, "command")}`);
  if (writes > 0) parts.push(`${firstWriteVerb ?? "Edited"} ${writes} ${pluralize(writes, "file")}`);
  if (reads > 0) parts.push(`Read ${reads} ${pluralize(reads, "file")}`);
  if (tools > 0) parts.push(`Used ${tools} ${pluralize(tools, "tool")}`);
  if (hasReasoning && parts.length > 0) {
    parts.push(thoughtLabel(reasoningMs));
  }
  return parts.join(" · ") || "Worked";
};

/** Icon for a group: pure reasoning shows the brain; mixed work shows the
 *  icon of its most common tool kind (t3code picks the row's entry tone). */
const groupIcon = (group: FoldGroup): string => {
  const toolBlocks = group.blocks.filter((block) => block.type === "tool_call");
  if (toolBlocks.length === 0) {
    return FOLD_KIND_ICON.reasoning;
  }
  const counts: Partial<Record<FoldRowKind, number>> = {};
  for (const block of toolBlocks) {
    const kind = toolRowKind(block);
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  let leaderKind: FoldRowKind = "tool";
  let leaderCount = 0;
  (Object.keys(counts) as FoldRowKind[]).forEach((kind) => {
    if ((counts[kind] ?? 0) > leaderCount) {
      leaderKind = kind;
      leaderCount = counts[kind] ?? 0;
    }
  });
  return FOLD_KIND_ICON[leaderKind];
};

const groupBodyParts = (group: FoldGroup): string[] => {
  return group.blocks.flatMap((block) => {
    if (isReasoningBlock(block)) {
      const text = (block.content ?? "").trim();
      return text ? [text] : [];
    }
    const command = firstString(parseToolParams(block.tool_call?.params), ["command", "cmd"]);
    const response = (block.tool_call?.response ?? "").trim();
    const body = [command, response].filter((part) => part.length > 0).join("\n\n");
    return [body || toolRowMeta(block).heading];
  });
};

// ---------------------------------------------------------------------------
// Fold content row — narrative blocks are collapsible: a preview line with a
// chevron, expanding to the full rendered content.
// ---------------------------------------------------------------------------

interface FoldContentRowProps {
  block: DisplayAssistantMessageBlock;
  messageId: string;
  threadId: string;
}

const previewText = (block: DisplayAssistantMessageBlock): string => {
  const text = typeof block.content === "string" ? block.content.trim() : "";
  if (!text) return "";
  const firstLine = text.split("\n")[0] ?? "";
  const compact = firstLine.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 119).trimEnd()}…` : compact;
};

const FoldContentRowBase: FC<FoldContentRowProps> = ({ block, messageId, threadId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const preview = previewText(block);

  // Empty/non-text content renders as plain content, no collapse affordance.
  if (!preview) {
    return <MessageBlockContent block={block} messageId={messageId} threadId={threadId} />;
  }

  return (
    <div className="flex w-full min-w-0 flex-col">
       <MessageBlockContent block={block} messageId={messageId} threadId={threadId} />
    </div>
  );
};

const FoldContentRow = memo(FoldContentRowBase);

// ---------------------------------------------------------------------------
// Fold group row
// ---------------------------------------------------------------------------

interface FoldGroupRowProps {
  group: FoldGroup;
}

const FoldGroupRowBase: FC<FoldGroupRowProps> = ({ group }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const icon = groupIcon(group);
  const heading = groupHeading(group);
  const bodyParts = groupBodyParts(group).filter((part) => part.length > 0);
  const isFailure = group.blocks.some((block) => block.status === "error" || block.status === "denied");

  return (
    <div className="flex w-full min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-fit min-w-0 max-w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[12px] select-none leading-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        <Icon
          icon={icon}
          className={`h-3.5 w-3.5 shrink-0 ${isFailure ? "text-destructive" : "text-muted-foreground/65"}`}
        />
        <span className={`min-w-0 truncate font-medium ${isFailure ? "text-destructive" : "text-foreground/82"}`}>
          {heading}
        </span>
      </button>
      {isExpanded && bodyParts.length > 0 && (
        <div className={BODY_CLASSES}>
          {bodyParts.map((part, index) => (
            <div key={`${group.kind}:${index}`} className={index > 0 ? "mt-2" : undefined}>
              {part}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const FoldGroupRow = memo(FoldGroupRowBase);

// ---------------------------------------------------------------------------
// Turn fold
// ---------------------------------------------------------------------------

/**
 * Stable per-block key: prefer the block id or tool_call id, else derive a
 * deterministic key from type/timestamp/name/content. Duplicate fallbacks get
 * a `#n` suffix so sibling keys stay unique (legacy history can contain
 * several id-less blocks with identical timestamps and content).
 */
const blockKey = (block: DisplayAssistantMessageBlock): string =>
  block.id ??
  block.tool_call?.id ??
  `${block.type}:${block.timestamp ?? "no-ts"}:${block.tool_call?.name ?? "anonymous"}:${
    Array.isArray(block.content) ? block.content.join("").length : (block.content?.length ?? 0)
  }`;

const buildGroupItems = (
  blocks: DisplayAssistantMessageBlock[],
): Array<{ key: string; item: FoldGroup | { kind: "content"; block: DisplayAssistantMessageBlock } }> => {
  const items: Array<{ key: string; item: FoldGroup | { kind: "content"; block: DisplayAssistantMessageBlock } }> = [];
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
      items.push({ key: keyForBlock(groupItem.block), item: groupItem });
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

const MessageTurnFoldBase: FC<MessageTurnFoldProps> = ({
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
  const groupItems = useMemo(
    () => buildGroupItems(hideReasoningOnFinishedTurn ? blocks.filter((b) => !isReasoningBlock(b)) : blocks),
    [blocks, hideReasoningOnFinishedTurn],
  );

  const toggleExpanded = useCallback(() => {
    const next = !isExpanded;
    setIsExpanded(next);
    onToggleCollapse?.(!next);
  }, [isExpanded, onToggleCollapse]);

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
        className={`grid w-full overflow-hidden transition-[grid-template-rows,opacity] duration-(--dc-motion-default) ease-(--dc-ease-out-express) motion-reduce:transition-none ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] pointer-events-none opacity-0"
        }`}
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

export const MessageTurnFold = memo(MessageTurnFoldBase);
