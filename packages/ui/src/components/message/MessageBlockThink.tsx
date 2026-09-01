import { type FC, useCallback, useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { createConfigClient } from "#api/ConfigClient";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
function formatDuration(input: number) {
  if (input < 1000) {
    return `${input}ms`;
  }
  if (input < 60000) {
    return `${(input / 1000).toFixed(1)}s`;
  }
  if (input < 3600000) {
    const minutes = Math.floor(input / 60000);
    const seconds = Math.floor((input % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  if (input < 86400000) {
    const hours = Math.floor(input / 3600000);
    const minutes = Math.floor((input % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }
  const days = Math.floor(input / 86400000);
  const hours = Math.floor((input % 86400000) / 3600000);
  return `${days}d ${hours}h`;
}
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
    ? {
        start: value.start,
        end: value.end,
      }
    : null;
};
const UPDATE_INTERVAL = 1000;
const UPDATE_OFFSET = 80;

// Shared config client + a single cached read of the "think_collapse" setting.
// Every mounted think block previously issued its own bridge roundtrip on mount;
// the setting only ever changes through this component's toggle, so a
// module-level write-through cache is safe.
type ConfigClient = ReturnType<typeof createConfigClient>;
let sharedConfigClient: ConfigClient | null = null;
const getConfigClient = () => (sharedConfigClient ??= createConfigClient());
let thinkCollapseCache: boolean | null = null;
let thinkCollapseRequest: Promise<boolean> | null = null;
function getThinkCollapseSetting(): Promise<boolean> {
  if (thinkCollapseCache !== null) return Promise.resolve(thinkCollapseCache);
  thinkCollapseRequest ??= getConfigClient()
    .getSetting("think_collapse")
    .then((val) => {
      // Only apply the fetched value while the cache is still empty so a newer
      // toggle write-through cannot be overwritten by a stale in-flight read.
      if (thinkCollapseCache === null) {
        thinkCollapseCache = Boolean(val);
      }
      return thinkCollapseCache;
    })
    .catch((err: unknown) => {
      thinkCollapseRequest = null; // allow retry on next mount
      throw err;
    });
  return thinkCollapseRequest;
}
function setThinkCollapseSetting(value: boolean): Promise<unknown> {
  thinkCollapseCache = value; // write-through: later mounts see the new value immediately
  return getConfigClient().setSetting("think_collapse", value);
}

// Isolated ticking header label: the 1s "Thinking for Ns..." timer only
// re-renders this span instead of the whole block (incl. the reasoning body).
interface MessageBlockThinkHeaderLabelProps {
  isModeChange: boolean;
  modeChangeId: string;
  isLoading: boolean;
  reasoningTimeRange: ReasoningTimeRange | null;
  reasoningDuration: number;
}
const MessageBlockThinkHeaderLabelBase: FC<MessageBlockThinkHeaderLabelProps> = ({
  isModeChange,
  modeChangeId,
  isLoading,
  reasoningTimeRange,
  reasoningDuration,
}) => {
  const [displayedDurationMs, setDisplayedDurationMs] = useState(0);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Primitive deps only: the parent re-renders on every stream chunk, so object
  // identities (reasoningTimeRange) or fresh closures in the dep list would make
  // the effect re-run on every render and spin the duration state forever.
  const reasoningStart = reasoningTimeRange?.start;
  const updateDisplayedDuration = useCallback(() => {
    if (isLoading) {
      const fallbackDuration = Number.isFinite(reasoningDuration) ? reasoningDuration * 1000 : 0;
      const startTimestamp = reasoningStart ?? Date.now() - fallbackDuration;
      setDisplayedDurationMs(Math.max(0, Date.now() - startTimestamp));
    } else {
      const normalized = Number.isFinite(reasoningDuration) ? reasoningDuration : 0;
      setDisplayedDurationMs(Math.max(0, Math.round(normalized * 1000)));
    }
  }, [isLoading, reasoningDuration, reasoningStart]);
  const stopTimer = useCallback(() => {
    if (updateTimer.current !== null) {
      clearTimeout(updateTimer.current);
      updateTimer.current = null;
    }
  }, []);
  const scheduleNextUpdate = useCallback(
    function scheduleNextUpdate() {
      stopTimer();
      if (!isLoading) return;
      const fallbackDuration = Number.isFinite(reasoningDuration) ? reasoningDuration * 1000 : 0;
      const startTimestamp = reasoningStart ?? Date.now() - fallbackDuration;
      const now = Date.now();
      const elapsed = Math.max(0, now - startTimestamp);
      const remainder = elapsed % UPDATE_INTERVAL;
      const delay = Math.max(UPDATE_INTERVAL - remainder, 0) + UPDATE_OFFSET;
      updateTimer.current = setTimeout(() => {
        updateDisplayedDuration();
        scheduleNextUpdate();
      }, delay);
    },
    [isLoading, reasoningDuration, reasoningStart, stopTimer, updateDisplayedDuration],
  );
  useEffect(() => {
    // Defer the immediate refresh to a microtask so the state update does not
    // run synchronously inside the effect.
    queueMicrotask(() => updateDisplayedDuration());
    if (isLoading) {
      scheduleNextUpdate();
    } else {
      stopTimer();
    }
  }, [isLoading, updateDisplayedDuration, scheduleNextUpdate, stopTimer]);
  useEffect(() => {
    queueMicrotask(() => updateDisplayedDuration());
  }, [updateDisplayedDuration]);
  useEffect(() => {
    return () => {
      stopTimer();
    };
  }, [stopTimer]);
  const text = (() => {
    if (isModeChange) return `Mode changed to ${modeChangeId}`;
    const formatted = formatDuration(displayedDurationMs);
    return isLoading ? `Thinking for ${formatted}...` : `Thought for ${formatted}`;
  })();
  return <>{text}</>;
};
const MessageBlockThinkHeaderLabel = MessageBlockThinkHeaderLabelBase;
const MessageBlockThinkBase: FC<MessageBlockThinkProps> = ({ block, usage, onToggleCollapse }) => {
  const [collapse, setCollapse] = useState(false);
  const reasoningTimeRange = toReasoningTimeRange(block.reasoning_time);
  const reasoningDuration = (() => {
    let duration = 0;
    if (reasoningTimeRange) {
      duration = (reasoningTimeRange.end - reasoningTimeRange.start) / 1000;
    } else {
      duration = (usage.reasoning_end_time - usage.reasoning_start_time) / 1000;
    }
    return parseFloat(duration.toFixed(2));
  })();
  const isModeChange = block.extra?.mode_change !== undefined;
  const modeChangeId = block.extra?.mode_change as string;
  const trimmedContent = block.content?.trim() ?? "";
  useEffect(() => {
    let cancelled = false;
    void getThinkCollapseSetting()
      .then((val) => {
        if (!cancelled) setCollapse(val);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const handleToggleCollapse = (newValue: boolean) => {
    setCollapse(newValue);
    void setThinkCollapseSetting(newValue);
    onToggleCollapse?.(!newValue);
  };
  return (
    <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-(--dc-motion-default) ease-(--dc-ease-out-express) motion-reduce:transition-none">
      <button
        type="button"
        className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
        onClick={() => handleToggleCollapse(!collapse)}
        aria-expanded={!collapse}
      >
        <Icon
          icon="lucide:chevron-right"
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-(--dc-motion-fast) ease-(--dc-ease-out-soft) motion-reduce:transition-none ${collapse ? "" : "rotate-90"}`}
        />
        <Icon icon="lucide:brain-circuit" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium text-accent-foreground">
          <MessageBlockThinkHeaderLabel
            isModeChange={isModeChange}
            modeChangeId={modeChangeId}
            isLoading={block.status === "loading"}
            reasoningTimeRange={reasoningTimeRange}
            reasoningDuration={reasoningDuration}
          />
        </span>
        {block.status === "loading" && (
          <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
        )}
      </button>

      <div
        className={`grid w-full overflow-hidden transition-[grid-template-rows,opacity] duration-(--dc-motion-default) ease-(--dc-ease-out-express) motion-reduce:transition-none ${collapse ? "grid-rows-[0fr] pointer-events-none opacity-0" : "grid-rows-[1fr] opacity-100"}`}
        aria-hidden={collapse}
        inert={collapse ? true : undefined}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t bg-muted/20 px-3 py-2.5 text-xs leading-5 wrap-break-word whitespace-pre-wrap text-muted-foreground">
            {trimmedContent}
          </div>
        </div>
      </div>
    </div>
  );
};
export const MessageBlockThink = MessageBlockThinkBase;
