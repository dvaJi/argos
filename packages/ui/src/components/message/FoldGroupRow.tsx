import { type FC, useState } from "react";
import { Icon } from "@iconify/react";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import { DURATION_LABELS, isReasoningBlock, type FoldGroup } from "./MessageTurnFold.shared";
import { formatActivityDuration } from "./messageActivityGroups";

// ---------------------------------------------------------------------------
// Fold group row
// ---------------------------------------------------------------------------

const BODY_CLASSES =
  "mt-1 ms-6 border-s border-border/45 ps-3 font-mono text-[11px] leading-relaxed wrap-break-word whitespace-pre-wrap text-muted-foreground";

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
const toolRowMeta = (block: DisplayAssistantMessageBlock): ToolRowMeta => {
  const name = block.tool_call?.name?.trim() || "tool";
  const params = parseToolParams(block.tool_call?.params);
  const command = firstString(params, ["command", "cmd"]);
  const file = basename(firstString(params, ["path", "filePath", "file", "filename", "target"]));
  if (COMMAND_TOOL_RE.test(name) || (command && /(run|exec|shell)/i.test(name))) {
    return {
      icon: "hugeicons:command-line",
      heading: command ? `Ran ${truncateText(command, 48)}` : "Ran command",
    };
  }
  if (READ_TOOL_RE.test(name)) {
    return {
      icon: "hugeicons:eye",
      heading: file ? `Read ${file}` : capitalize(name.replace(/[_-]+/g, " ")),
    };
  }
  if (WRITE_TOOL_RE.test(name)) {
    const verb = /(remove|delete)/i.test(name) ? "Removed" : /(create|write|mkdir)/i.test(name) ? "Created" : "Edited";
    return {
      icon: "hugeicons:pencil-edit-01",
      heading: file ? `${verb} ${file}` : `${verb} file`,
    };
  }
  if (block.tool_call?.server_name) {
    return {
      icon: "hugeicons:wrench-01",
      heading: `Called ${truncateText(name)}`,
    };
  }
  return {
    icon: "hugeicons:settings-01",
    heading: `Called ${truncateText(name)}`,
  };
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

/** Heading for a fold group. Groups hold either a run of thinking blocks
 *  ("Thought for Xs") or a single action, so the per-action label covers
 *  every reachable case. */
const groupHeading = (group: FoldGroup): string => {
  const blocks = group.blocks;
  const toolBlocks = blocks.filter((block) => block.type === "tool_call");
  if (toolBlocks.length === 0) {
    return thoughtLabel(sumReasoningMs(blocks));
  }
  const firstTool = toolBlocks[0];
  return firstTool ? toolRowMeta(firstTool).heading : "Worked";
};

/** Icon for a group: pure reasoning shows the brain; an action shows its
 *  per-kind icon. */
const groupIcon = (group: FoldGroup): string => {
  const toolBlocks = group.blocks.filter((block) => block.type === "tool_call");
  if (toolBlocks.length === 0) {
    return FOLD_KIND_ICON.reasoning;
  }
  const firstTool = toolBlocks[0];
  return FOLD_KIND_ICON[firstTool ? toolRowKind(firstTool) : "tool"];
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

interface FoldGroupRowProps {
  group: FoldGroup;
}
export const FoldGroupRow: FC<FoldGroupRowProps> = ({ group }) => {
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
