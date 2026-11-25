import { type FC, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import type { MessageFile } from "@argos/shared/types/agent-interface";
import type { PendingSessionInputRecord } from "@argos/shared/types/agent-interface";
interface PendingInputLaneProps {
  steerItems: PendingSessionInputRecord[];
  queueItems: PendingSessionInputRecord[];
  activeLimit?: number;
  disableSteerAction?: boolean;
  isGenerating?: boolean;
  onDeleteQueue: (itemId: string) => void;
  onDeleteSteer: (itemId: string) => void;
  onSteerQueueItem: (itemId: string) => void;
  /** Moves a queued item to a new position in the queue (0-based). */
  onMoveQueueItem?: (itemId: string, toIndex: number) => void;
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
  onDeleteSteer,
  onSteerQueueItem,
  onMoveQueueItem,
}) => {
  // Drag only starts from the grip, so text selection and buttons keep working.
  const gripPressed = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  // Insertion slot 0..n: the dragged item lands before the item at this index.
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const canReorder = Boolean(onMoveQueueItem) && queueItems.length > 1;
  const showLane = steerItems.length > 0 || queueItems.length > 0;
  if (!showLane) return null;

  const endDrag = () => {
    gripPressed.current = false;
    setDragId(null);
    setDropSlot(null);
  };
  const commitDrop = () => {
    if (dragId === null || dropSlot === null) return endDrag();
    const from = queueItems.findIndex((item) => item.id === dragId);
    // Removing the item first shifts later slots down by one.
    const to = dropSlot > from ? dropSlot - 1 : dropSlot;
    if (from !== -1 && to !== from) onMoveQueueItem?.(dragId, to);
    endDrag();
  };
  const moveBy = (itemId: string, delta: number) => {
    const from = queueItems.findIndex((item) => item.id === itemId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= queueItems.length) return;
    onMoveQueueItem?.(itemId, to);
  };

  return (
    <div className="mx-auto w-full max-w-4xl" data-testid="pending-rail">
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

        <div
          className="space-y-1 overflow-visible"
          data-testid="pending-rail-list"
          data-scrollable="false"
          // The gaps between rows still accept the drop (at the last shown slot).
          onDragOver={(e) => {
            if (dragId !== null) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            commitDrop();
          }}
        >
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
              <div className="flex shrink-0 items-center gap-1 opacity-70 transition group-hover:opacity-100 group-focus-within:opacity-100">
                {(item.payload.files?.length ?? 0) > 0 && (
                  <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/35 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                    {item.payload.files?.length ?? 0} file(s)
                  </span>
                )}
                <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/45 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                  Locked
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full text-muted-foreground"
                  title="Remove"
                  aria-label="Remove steer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSteer(item.id);
                  }}
                >
                  <Icon icon="lucide:x" className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {queueItems.map((element, index) => (
            <div
              key={element.id}
              data-testid="pending-row"
              data-mode="queue"
              data-editing="false"
              data-dragging={dragId === element.id ? "true" : undefined}
              draggable={canReorder}
              onDragStart={(e) => {
                if (!gripPressed.current) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", element.id);
                setDragId(element.id);
              }}
              onDragOver={(e) => {
                if (dragId === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect();
                setDropSlot(e.clientY < rect.top + rect.height / 2 ? index : index + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                commitDrop();
              }}
              onDragEnd={endDrag}
              className={[
                "group relative rounded-lg border border-border/50 bg-background/65 px-1.5 py-1 transition hover:border-border/80 hover:bg-background/80 focus-within:border-border/80 focus-within:bg-background/80",
                dragId === element.id ? "opacity-40" : "",
              ].join(" ")}
            >
              {dragId !== null && dropSlot === index && (
                <span
                  className="pointer-events-none absolute inset-x-1 -top-[3px] h-0.5 rounded bg-primary"
                  aria-hidden="true"
                />
              )}
              {dragId !== null && dropSlot === index + 1 && index === queueItems.length - 1 && (
                <span
                  className="pointer-events-none absolute inset-x-1 -bottom-[3px] h-0.5 rounded bg-primary"
                  aria-hidden="true"
                />
              )}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="pending-input-drag inline-flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/80 hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
                  title="Drag to reorder (or focus and use ↑/↓)"
                  aria-label={`Reorder: position ${index + 1} of ${queueItems.length}`}
                  disabled={!canReorder}
                  onPointerDown={() => {
                    gripPressed.current = true;
                  }}
                  onPointerUp={() => {
                    gripPressed.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      moveBy(element.id, e.key === "ArrowUp" ? -1 : 1);
                    }
                  }}
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
                    disabled={disableSteerAction}
                    title={isGenerating ? "Interrupt & send" : "Send next"}
                    aria-label={isGenerating ? "Interrupt & send" : "Send next"}
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
