import { type FC, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createConfigClient } from "@api/ConfigClient";
import type { DisplayAssistantMessageBlock } from "@/components/chat/messageListItems";

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
    <div className="rounded-lg border bg-card text-card-foreground overflow-hidden transition-all duration-200">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => handleToggleCollapse(!collapse)}
      >
        <svg
          className={`w-3 h-3 transition-transform ${collapse ? "" : "rotate-90"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        {block.status === "loading" && (
          <span className="inline-block w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        )}
        <span>{headerText}</span>
      </button>

      {!collapse && (
        <div className="px-3 pb-3 text-xs text-muted-foreground whitespace-pre-wrap break-words border-t">
          {block.content}
        </div>
      )}
    </div>
  );
};
