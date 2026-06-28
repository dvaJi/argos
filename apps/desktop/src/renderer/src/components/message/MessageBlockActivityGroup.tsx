import { type FC, useState, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import type { DisplayAssistantMessageBlock, DisplayMessageUsage } from "@/components/chat/messageListItems";
import { formatActivityDuration } from "./messageActivityGroups";
import { MessageBlockThink } from "./MessageBlockThink";
import MessageBlockToolCall from "./MessageBlockToolCall";

interface MessageBlockActivityGroupProps {
  blocks: DisplayAssistantMessageBlock[];
  messageId: string;
  threadId: string;
  usage: DisplayMessageUsage;
  durationMs: number;
  reasoningCount: number;
  toolCallCount: number;
  onToggleCollapse?: (isCollapsed: boolean) => void;
}

const buildActivityBlockKey = (block: DisplayAssistantMessageBlock, index: number): string =>
  block.id ?? block.tool_call?.id ?? `${block.type}:${block.timestamp}:${index}`;

export const MessageBlockActivityGroup: FC<MessageBlockActivityGroupProps> = ({
  blocks,
  messageId,
  threadId,
  usage,
  durationMs,
  reasoningCount,
  toolCallCount,
  onToggleCollapse,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const durationLabels = useMemo(
    () => ({
      day: "d",
      hour: "h",
      minute: "m",
      second: "s",
    }),
    [],
  );

  const durationText = useMemo(() => formatActivityDuration(durationMs, durationLabels), [durationMs, durationLabels]);

  const countSegments = useMemo(() => {
    const segments: string[] = [];
    if (reasoningCount > 0) segments.push(`${reasoningCount} reasoning`);
    if (toolCallCount > 0) segments.push(`${toolCallCount} tool calls`);
    return segments;
  }, [reasoningCount, toolCallCount]);

  const titleText = useMemo(
    () => [`Worked for ${durationText}`, ...countSegments].filter(Boolean).join(" \u00b7 "),
    [durationText, countSegments],
  );

  const toggleLabel = useMemo(
    () => (isExpanded ? `Collapse: ${titleText}` : `Expand: ${titleText}`),
    [isExpanded, titleText],
  );

  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    onToggleCollapse?.(!next);
  };

  const handleChildCollapseToggle = useCallback(
    (isCollapsed: boolean) => {
      onToggleCollapse?.(isCollapsed);
    },
    [onToggleCollapse],
  );

  return (
    <div className="flex flex-col w-full" data-testid="activity-group">
      <button
        type="button"
        data-testid="activity-group-toggle"
        className="inline-flex max-w-full min-w-0 items-center gap-1 self-start text-xs leading-4 text-[rgba(37,37,37,0.5)] dark:text-white/50 select-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-expanded={isExpanded}
        aria-label={toggleLabel}
        onClick={toggleExpanded}
      >
        <Icon
          icon="lucide:chevron-right"
          className={`w-[14px] h-[14px] shrink-0 text-[rgba(37,37,37,0.5)] dark:text-white/50 transition-transform duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)] motion-reduce:transition-none ${isExpanded ? "rotate-90" : "rotate-0"}`}
        />
        <span className="min-w-0 truncate">{titleText}</span>
      </button>

      <div
        className={`grid w-full overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-[var(--dc-motion-default)] ease-[var(--dc-ease-out-express)] motion-reduce:transition-none ${
          isExpanded ? "mt-1.5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0 pointer-events-none"
        }`}
        aria-hidden={!isExpanded}
        inert={isExpanded ? undefined : true}
        data-testid="activity-group-body-shell"
      >
        <div className="min-h-0 flex flex-col w-full gap-1.5 overflow-hidden" data-testid="activity-group-body">
          {blocks.map((block, index) => {
            const key = buildActivityBlockKey(block, index);
            if ((block.type === "reasoning_content" || block.type === "artifact-thinking") && block.content) {
              return (
                <MessageBlockThink key={key} block={block} usage={usage} onToggleCollapse={handleChildCollapseToggle} />
              );
            }
            if (block.type === "tool_call") {
              return <MessageBlockToolCall key={key} block={block} messageId={messageId} threadId={threadId} />;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};
