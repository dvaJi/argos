import { type FC, memo, useCallback, useState } from "react";
import { Icon } from "@iconify/react";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import { MessageBlockContent } from "./MessageBlockContent";
import { formatActivityDuration } from "./messageActivityGroups";

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

interface ToolRowMeta {
  icon: string;
  heading: string;
}

const toolRowMeta = (block: DisplayAssistantMessageBlock): ToolRowMeta => {
  const name = block.tool_call?.name?.trim() || "tool";
  const params = parseToolParams(block.tool_call?.params);
  const command = firstString(params, ["command", "cmd"]);
  const file = basename(firstString(params, ["path", "filePath", "file", "filename", "target"]));

  if (COMMAND_TOOL_RE.test(name) || (command && /(run|exec|shell)/i.test(name))) {
    return { icon: "lucide:terminal", heading: command ? `Ran ${truncateText(command, 48)}` : "Ran command" };
  }
  if (READ_TOOL_RE.test(name)) {
    return { icon: "lucide:eye", heading: file ? `Read ${file}` : capitalize(name.replace(/[_-]+/g, " ")) };
  }
  if (WRITE_TOOL_RE.test(name)) {
    const verb = /(remove|delete)/i.test(name) ? "Removed" : /(create|write|mkdir)/i.test(name) ? "Created" : "Edited";
    return { icon: "lucide:square-pen", heading: file ? `${verb} ${file}` : `${verb} file` };
  }
  if (block.tool_call?.server_name) {
    return { icon: "lucide:wrench", heading: `Called ${truncateText(name)}` };
  }
  return { icon: "lucide:hammer", heading: `Called ${truncateText(name)}` };
};

const reasoningHeading = (block: DisplayAssistantMessageBlock): string => {
  const range = block.reasoning_time;
  if (
    range &&
    typeof range === "object" &&
    typeof range.start === "number" &&
    typeof range.end === "number" &&
    range.end >= range.start
  ) {
    return `Thought for ${formatActivityDuration(range.end - range.start, DURATION_LABELS)}`;
  }
  return "Reasoning";
};

// ---------------------------------------------------------------------------
// Individual fold rows
// ---------------------------------------------------------------------------

interface FoldRowProps {
  block: DisplayAssistantMessageBlock;
  messageId: string;
  threadId: string;
}

const FoldRowBase: FC<FoldRowProps> = ({ block, messageId, threadId }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (block.type === "content") {
    return <MessageBlockContent block={block} messageId={messageId} threadId={threadId} />;
  }

  // Non-content, non-activity blocks folded along with work (placeholder
  // actions that render nothing in settled history) stay invisible inside.
  if (block.type !== "tool_call" && block.type !== "reasoning_content" && block.type !== "artifact-thinking") {
    return null;
  }

  const isReasoning = block.type === "reasoning_content" || block.type === "artifact-thinking";
  const meta = isReasoning ? { icon: "lucide:brain-circuit", heading: reasoningHeading(block) } : toolRowMeta(block);
  const isFailure = block.status === "error" || block.status === "denied";

  const body = isReasoning
    ? (block.content ?? "").trim()
    : [
        firstString(parseToolParams(block.tool_call?.params), ["command", "cmd"]),
        (block.tool_call?.response ?? "").trim(),
      ]
        .filter((part) => part.length > 0)
        .join("\n\n");

  if (!body) {
    return (
      <div className="flex w-fit min-w-0 items-center gap-2 rounded px-1 py-0.5 text-[12px] leading-5">
        <Icon
          icon={meta.icon}
          className={`h-3.5 w-3.5 shrink-0 ${isFailure ? "text-destructive" : "text-muted-foreground/65"}`}
        />
        <span className={`min-w-0 truncate font-medium ${isFailure ? "text-destructive" : "text-foreground/82"}`}>
          {meta.heading}
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-fit min-w-0 max-w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[12px] select-none leading-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        <Icon
          icon={meta.icon}
          className={`h-3.5 w-3.5 shrink-0 ${isFailure ? "text-destructive" : "text-muted-foreground/65"}`}
        />
        <span className={`min-w-0 truncate font-medium ${isFailure ? "text-destructive" : "text-foreground/82"}`}>
          {meta.heading}
        </span>
      </button>
      {isExpanded && <div className={BODY_CLASSES}>{body}</div>}
    </div>
  );
};

const FoldRow = memo(FoldRowBase);

// ---------------------------------------------------------------------------
// Turn fold
// ---------------------------------------------------------------------------

/**
 * Sibling keys must be unique. Blocks with a stable id (block id / tool_call
 * id) key on it; the content-derived fallback can collide (e.g. legacy
 * history containing several id-less action blocks with the same timestamp
 * and content length), so duplicate fallbacks get a deterministic `#n`
 * suffix derived from their position among identical keys.
 */
const buildRowKeys = (blocks: DisplayAssistantMessageBlock[]): string[] => {
  const seen = new Map<string, number>();
  return blocks.map((block) => {
    const base =
      block.id ??
      block.tool_call?.id ??
      `${block.type}:${block.timestamp ?? "no-ts"}:${block.tool_call?.name ?? "anonymous"}:${
        Array.isArray(block.content) ? block.content.join("").length : (block.content?.length ?? 0)
      }`;
    const duplicateCount = seen.get(base) ?? 0;
    seen.set(base, duplicateCount + 1);
    return duplicateCount === 0 ? base : `${base}#${duplicateCount}`;
  });
};

const MessageTurnFoldBase: FC<MessageTurnFoldProps> = ({
  blocks,
  messageId,
  threadId,
  durationMs,
  onToggleCollapse,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const durationText = formatActivityDuration(durationMs, DURATION_LABELS);
  const label = durationMs >= 1000 ? `Worked for ${durationText}` : "Worked";
  const rowKeys = buildRowKeys(blocks);

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
          icon="lucide:chevron-right"
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
            {blocks.map((rowBlock, index) => (
              <FoldRow key={rowKeys[index]} block={rowBlock} messageId={messageId} threadId={threadId} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const MessageTurnFold = memo(MessageTurnFoldBase);
