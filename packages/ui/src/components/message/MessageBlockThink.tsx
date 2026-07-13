import { type FC, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Icon } from "@iconify/react";
import { createConfigClient } from "#api/ConfigClient";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";

interface MessageBlockThinkProps {
  block: DisplayAssistantMessageBlock;
  usage: {
    reasoning_start_time: number;
    reasoning_end_time: number;
  };
  onToggleCollapse?: (isCollapsed: boolean) => void;
}

type ReasoningTimeRange = {
  start: number;
  end: number;
};

const toReasoningTimeRange = (value: DisplayAssistantMessageBlock["reasoning_time"]): ReasoningTimeRange | null => {
  if (!value || typeof value !== "object") return null;
  return typeof value.start === "number" && typeof value.end === "number"
    ? { start: value.start, end: value.end }
    : null;
};

const UPDATE_INTERVAL = 1000;
const UPDATE_OFFSET = 80;

export const MessageBlockThink: FC<MessageBlockThinkProps> = ({ block, usage, onToggleCollapse }) => {
  const [collapse, setCollapse] = useState(false);
  const [displayedSeconds, setDisplayedSeconds] = useState(0);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const configClient = useMemo(() => createConfigClient(), []);

  const reasoningTimeRange = useMemo(() => toReasoningTimeRange(block.reasoning_time), [block.reasoning_time]);

  const reasoningDuration = useMemo(() => {
    let duration = 0;
    if (reasoningTimeRange) {
      duration = (reasoningTimeRange.end - reasoningTimeRange.start) / 1000;
    } else {
      duration = (usage.reasoning_end_time - usage.reasoning_start_time) / 1000;
    }
    return parseFloat(duration.toFixed(2));
  }, [reasoningTimeRange, usage.reasoning_end_time, usage.reasoning_start_time]);

  const isModeChange = useMemo(() => block.extra?.mode_change !== undefined, [block.extra]);
  const modeChangeId = useMemo(() => block.extra?.mode_change as string, [block.extra]);

  const updateDisplayedSecondsLocal = useCallback(() => {
    const normalized = Number.isFinite(reasoningDuration) ? reasoningDuration : 0;
    const value = Math.max(0, Math.floor(normalized));
    setDisplayedSeconds(value);
  }, [reasoningDuration]);

  const stopTimer = useCallback(() => {
    if (updateTimer.current !== null) {
      clearTimeout(updateTimer.current);
      updateTimer.current = null;
    }
  }, []);

  const scheduleNextUpdate = useCallback(() => {
    stopTimer();
    if (block.status !== "loading") return;

    const fallbackDuration = Number.isFinite(reasoningDuration) ? reasoningDuration * 1000 : 0;
    const startTimestamp = reasoningTimeRange?.start ?? Date.now() - fallbackDuration;
    const now = Date.now();
    const elapsed = Math.max(0, now - startTimestamp);
    const remainder = elapsed % UPDATE_INTERVAL;
    const delay = Math.max(UPDATE_INTERVAL - remainder, 0) + UPDATE_OFFSET;

    updateTimer.current = setTimeout(() => {
      updateDisplayedSecondsLocal();
      scheduleNextUpdate();
    }, delay);
  }, [block.status, reasoningDuration, reasoningTimeRange, stopTimer, updateDisplayedSecondsLocal]);

  useEffect(() => {
    updateDisplayedSecondsLocal();
    if (block.status === "loading") {
      scheduleNextUpdate();
    } else {
      stopTimer();
    }
  }, [block.status, reasoningTimeRange?.start, reasoningTimeRange?.end]);

  useEffect(() => {
    updateDisplayedSecondsLocal();
  }, [reasoningDuration, updateDisplayedSecondsLocal]);

  useEffect(() => {
    void configClient.getSetting("think_collapse").then((val) => {
      setCollapse(Boolean(val));
    });
  }, [configClient]);

  useEffect(() => {
    return () => {
      stopTimer();
    };
  }, [stopTimer]);

  const handleToggleCollapse = (newValue: boolean) => {
    setCollapse(newValue);
    void configClient.setSetting("think_collapse", newValue);
    onToggleCollapse?.(!newValue);
  };

  const headerText = useMemo(() => {
    if (isModeChange) return `Mode changed to ${modeChangeId}`;
    const seconds = displayedSeconds;
    return block.status === "loading" ? `Thinking for ${seconds}s...` : `Thought for ${seconds}s`;
  }, [isModeChange, modeChangeId, displayedSeconds, block.status]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200">
      <button
        type="button"
        className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
        onClick={() => handleToggleCollapse(!collapse)}
      >
        <Icon
          icon="lucide:chevron-right"
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${collapse ? "" : "rotate-90"}`}
        />
        <Icon icon="lucide:brain-circuit" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium text-accent-foreground">{headerText}</span>
        {block.status === "loading" && (
          <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
        )}
      </button>

      {!collapse && (
        <div className="border-t bg-muted/20 px-3 py-2.5 text-xs leading-5 text-muted-foreground whitespace-pre-wrap break-words">
          {block.content}
        </div>
      )}
    </div>
  );
};
