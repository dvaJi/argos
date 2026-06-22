import { type FC, useMemo } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import type { MessageFile } from "@shared/types/agent-interface";
import type { PendingSessionInputRecord } from "@shared/types/agent-interface";

interface PendingInputLaneProps {
  steerItems: PendingSessionInputRecord[];
  queueItems: PendingSessionInputRecord[];
  activeLimit?: number;
  disableSteerAction?: boolean;
  isGenerating?: boolean;

  onDeleteQueue: (itemId: string) => void;
  onSteerQueueItem: (itemId: string) => void;
}

const formatPayloadText = (item: PendingSessionInputRecord): string => {
  const text = item.payload.text?.trim();
  if (text) return text;
  const fileCount = item.payload.files?.length ?? 0;
  if (fileCount > 0) return `${fileCount} attachment(s)`;
  return "(empty)";
};

const PendingInputLane: FC<PendingInputLaneProps> = ({
  steerItems,
  queueItems,
  activeLimit = 5,
  disableSteerAction = false,
  isGenerating = false,

  onDeleteQueue,
  onSteerQueueItem,
}) => {
  const showLane = useMemo(() => steerItems.length > 0 || queueItems.length > 0, [steerItems, queueItems]);

  if (!showLane) return null;

  return (
    <div className="w-full max-w-4xl" data-testid="pending-rail">
      <div className="rounded-xl border border-border/70 bg-card/55 px-2.5 py-2 shadow-sm backdrop-blur-lg">
        <div className="mb-1.5 flex items-center justify-between gap-2" data-testid="pending-rail-header">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {steerItems.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Steer {steerItems.length}
              </span>
            )}
            {queueItems.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Queue {queueItems.length}/{activeLimit}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1 overflow-visible" data-testid="pending-rail-list" data-scrollable="false">
          {steerItems.map((item) => (
            <div
              key={item.id}
              data-testid="pending-row"
              data-mode="steer"
              className="group flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/65 px-1.5 py-1 transition hover:border-border/80 hover:bg-background/80"
            >
              <Icon icon="lucide:corner-down-right" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] leading-5 text-foreground" title={formatPayloadText(item)}>
                  {formatPayloadText(item)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {(item.payload.files?.length ?? 0) > 0 && (
                  <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/35 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                    {item.payload.files?.length ?? 0} file(s)
                  </span>
                )}
                <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/45 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                  Locked
                </span>
              </div>
            </div>
          ))}

          {queueItems.map((element) => (
            <div
              key={element.id}
              data-testid="pending-row"
              data-mode="queue"
              data-editing="false"
              className="group rounded-lg border border-border/50 bg-background/65 px-1.5 py-1 transition hover:border-border/80 hover:bg-background/80 focus-within:border-border/80 focus-within:bg-background/80"
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="pending-input-drag inline-flex h-6 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
                  title="Reorder"
                  disabled={false}
                >
                  <Icon icon="lucide:grip-vertical" className="h-3.5 w-3.5" />
                </button>

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    data-testid="pending-row-main"
                    className="block w-full min-w-0 rounded-md px-1 py-0.5 text-left outline-none transition hover:bg-muted/35 focus-visible:bg-muted/35"
                    title={formatPayloadText(element)}
                  >
                    <span className="block truncate text-[13px] leading-5 text-foreground">
                      {formatPayloadText(element)}
                    </span>
                  </button>
                </div>

                <div className="flex shrink-0 items-center gap-1 opacity-70 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  {(element.payload.files?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/35 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                      {element.payload.files?.length ?? 0} file(s)
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full text-muted-foreground"
                    disabled={!isGenerating}
                    title={isGenerating ? "Interrupt & send" : "Start a turn to steer"}
                    aria-label={isGenerating ? "Interrupt & send" : "Start a turn to steer"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSteerQueueItem(element.id);
                    }}
                  >
                    <Icon icon="lucide:zap" className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full text-muted-foreground"
                    title="Remove"
                    aria-label="Remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteQueue(element.id);
                    }}
                  >
                    <Icon icon="lucide:x" className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {disableSteerAction && (
          <div className="mt-1.5 text-[11px] text-muted-foreground">Limit reached (max {activeLimit})</div>
        )}
      </div>
    </div>
  );
};

export default PendingInputLane;
