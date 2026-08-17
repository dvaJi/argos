import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FloatingWidgetSnapshot } from "@argos/shared/types/floating-widget";
import FloatingSessionItem from "./components/FloatingSessionItem";
import logoSrc from "../src/assets/logo.png";
import "./FloatingButton.css";

interface DragState {
  isDragging: boolean;
  isMouseDown: boolean;
  startX: number;
  startY: number;
  startScreenX: number;
  startScreenY: number;
  dragTimer: number | null;
  lastMoveTime: number;
}

interface FloatingButtonProps {
  theme: "dark" | "light";
}

const DRAG_DELAY = 180;
const DRAG_THRESHOLD = 4;
const CLOSE_MOTION_SETTLE_MS = 240;

const INITIAL_SNAPSHOT: FloatingWidgetSnapshot = {
  expanded: false,
  activeCount: 0,
  sessions: [],
};

export default function FloatingButton({ theme }: FloatingButtonProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [snapshot, setSnapshot] = useState<FloatingWidgetSnapshot>(INITIAL_SNAPSHOT);

  const dragStateRef = useRef<DragState>({
    isDragging: false,
    isMouseDown: false,
    startX: 0,
    startY: 0,
    startScreenX: 0,
    startScreenY: 0,
    dragTimer: null,
    lastMoveTime: 0,
  });

  const closingTimerRef = useRef<number | null>(null);

  const hasActiveTasks = snapshot.activeCount > 0;
  const activeCountDisplay = snapshot.activeCount > 99 ? "99+" : String(snapshot.activeCount);
  const sessionCountLabel = `${snapshot.sessions.length} sessions`;

  const clearDragTimer = useCallback(() => {
    const ds = dragStateRef.current;
    if (ds.dragTimer) {
      clearTimeout(ds.dragTimer);
      ds.dragTimer = null;
    }
  }, []);

  const clearClosingTimer = useCallback(() => {
    if (closingTimerRef.current) {
      clearTimeout(closingTimerRef.current);
      closingTimerRef.current = null;
    }
  }, []);

  const syncCloseMotionState = useCallback(
    (nextExpanded: boolean) => {
      if (nextExpanded) {
        clearClosingTimer();
        setIsClosing(false);
        return;
      }

      if (!snapshot.expanded) {
        return;
      }

      clearClosingTimer();
      setIsClosing(true);
      closingTimerRef.current = window.setTimeout(() => {
        setIsClosing(false);
        closingTimerRef.current = null;
      }, CLOSE_MOTION_SETTLE_MS);
    },
    [snapshot.expanded, clearClosingTimer],
  );

  const handleSnapshotUpdate = useCallback(
    (nextSnapshot: FloatingWidgetSnapshot) => {
      syncCloseMotionState(nextSnapshot.expanded);
      setSnapshot(nextSnapshot);
    },
    [syncCloseMotionState],
  );

  const setExpanded = useCallback(
    (expanded: boolean) => {
      syncCloseMotionState(expanded);
      setSnapshot((prev) => ({ ...prev, expanded }));
      window.floatingButtonAPI.setExpanded(expanded);
    },
    [syncCloseMotionState],
  );

  const toggleExpanded = useCallback(() => {
    setExpanded(!snapshot.expanded);
  }, [setExpanded, snapshot.expanded]);

  const setHovering = useCallback(
    (hovering: boolean) => {
      if (isHovering === hovering) return;
      setIsHovering(hovering);
      window.floatingButtonAPI.setHovering(hovering);
    },
    [isHovering],
  );

  const startDragging = useCallback(() => {
    const ds = dragStateRef.current;
    ds.isDragging = true;
    setIsDragging(true);
    window.floatingButtonAPI.onDragStart(ds.startScreenX, ds.startScreenY);
  }, []);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds.isMouseDown) return;

      const deltaX = Math.abs(event.clientX - ds.startX);
      const deltaY = Math.abs(event.clientY - ds.startY);

      if (!ds.isDragging && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
        clearDragTimer();
        startDragging();
      }

      if (ds.isDragging) {
        const now = Date.now();
        if (now - ds.lastMoveTime >= 16) {
          ds.lastMoveTime = now;
          window.floatingButtonAPI.onDragMove(event.screenX, event.screenY);
        }
      }
    },
    [clearDragTimer, startDragging],
  );

  const handleMouseUp = useCallback(
    function handleMouseUp(event: MouseEvent) {
      if (event.button !== 0) return;

      const ds = dragStateRef.current;
      const wasDragging = ds.isDragging;
      clearDragTimer();
      ds.isMouseDown = false;

      if (wasDragging) {
        ds.isDragging = false;
        setIsDragging(false);
        window.floatingButtonAPI.onDragEnd(event.screenX, event.screenY);
      } else {
        if (!snapshot.expanded) {
          setExpanded(true);
        }
      }

      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    },
    [clearDragTimer, handleMouseMove, setExpanded, snapshot.expanded],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-no-drag]")) return;

      event.preventDefault();

      const ds = dragStateRef.current;
      ds.isMouseDown = true;
      ds.startX = event.clientX;
      ds.startY = event.clientY;
      ds.startScreenX = event.screenX;
      ds.startScreenY = event.screenY;
      ds.lastMoveTime = Date.now();

      ds.dragTimer = window.setTimeout(() => {
        if (ds.isMouseDown) {
          startDragging();
        }
      }, DRAG_DELAY);

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [startDragging, handleMouseMove, handleMouseUp],
  );

  const handleMouseEnter = useCallback(() => {
    setHovering(true);
  }, [setHovering]);

  const handleMouseLeave = useCallback(() => {
    if (dragStateRef.current.isDragging) return;
    setHovering(false);
  }, [setHovering]);

  const handleRightClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      clearDragTimer();
      const ds = dragStateRef.current;
      ds.isMouseDown = false;
      ds.isDragging = false;
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      window.floatingButtonAPI.onRightClick();
    },
    [clearDragTimer, handleMouseMove, handleMouseUp],
  );

  const handleOpenSession = useCallback((sessionId: string) => {
    window.floatingButtonAPI.openSession(sessionId);
  }, []);

  const handleWindowBlur = useCallback(() => {
    if (snapshot.expanded) {
      setExpanded(false);
    }
  }, [setExpanded, snapshot.expanded]);

  useEffect(() => {
    window.floatingButtonAPI
      .getSnapshot()
      .then((s) => setSnapshot(s))
      .catch((error) => {
        console.warn("Failed to initialize floating widget snapshot:", error);
      });

    window.floatingButtonAPI.onSnapshotUpdate(handleSnapshotUpdate);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      clearDragTimer();
      clearClosingTimer();
      setHovering(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
      window.floatingButtonAPI.removeAllListeners();
    };
  }, [
    handleSnapshotUpdate,
    handleWindowBlur,
    clearDragTimer,
    clearClosingTimer,
    setHovering,
    handleMouseMove,
    handleMouseUp,
  ]);

  const collapsedClass = snapshot.expanded ? "collapsed-layer-hidden pointer-events-none" : "pointer-events-auto";
  const collapsedDragClass = isDragging ? "floating-shell-dragging" : "";
  const expandedClass = snapshot.expanded
    ? "floating-shell-expanded-active pointer-events-auto"
    : "floating-shell-expanded-hidden pointer-events-none";
  const expandedDragClass = isDragging ? "floating-shell-dragging" : "";
  const cursorClass = snapshot.expanded ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer";

  return (
    <div
      className={`widget-stage h-screen w-screen overflow-hidden bg-transparent ${theme === "dark" ? "dark" : ""}`}
      data-theme={theme}
      data-motion={isClosing ? "closing" : "idle"}
    >
      <div
        className={`relative h-full w-full select-none ${cursorClass}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onContextMenu={handleRightClick}
      >
        <div className="relative h-full w-full overflow-hidden">
          <div
            className={`collapsed-layer absolute inset-0 flex h-full w-full items-center justify-center overflow-hidden ${collapsedClass} ${collapsedDragClass}`}
          >
            <div
              className={`logo-orb logo-orb-hero relative isolate flex h-full w-full items-center justify-center overflow-hidden rounded-full ${hasActiveTasks ? "status-orb-busy" : "status-orb-idle"}`}
            >
              <div className="status-orb-face status-orb-logo absolute inset-0 flex items-center justify-center">
                <img src={logoSrc} alt="Task Overview" className="logo-orb-image status-orb-logo-image h-9 w-9" />
              </div>

              <div
                className="status-orb-face status-orb-active absolute inset-0 flex items-center justify-center"
                aria-label="active"
              >
                <div className="status-orb-orbit-shell flex h-[46px] w-[46px] items-center justify-center rounded-full">
                  <div className="relative flex h-8 w-8 items-center justify-center">
                    <span className="busy-orbit-ring status-orb-ring" />
                    <span className="busy-orbit-ring busy-orbit-ring-delayed status-orb-ring status-orb-ring-inner" />
                    <span className="status-orb-count-shell inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1">
                      <span
                        className={`status-orb-count text-[12px] font-bold leading-none tracking-[0.01em] ${activeCountDisplay.length > 1 ? "text-[10px]" : ""} ${activeCountDisplay.length > 2 ? "text-[8px] tracking-[0]" : ""}`}
                      >
                        {activeCountDisplay}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`floating-shell floating-shell-expanded absolute inset-0 flex h-full w-full flex-col overflow-hidden p-3 ${expandedClass} ${expandedDragClass}`}
          >
            <div className="panel-header relative z-[1] flex items-center justify-between gap-3 px-1 pb-3 pt-1">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center">
                  <img src={logoSrc} alt="Task Overview" className="h-6 w-6" />
                </div>

                <div className="min-w-0">
                  <p className="panel-title truncate text-[15px] font-semibold tracking-[0.01em]">Task Overview</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="panel-meta truncate text-[12px]">{sessionCountLabel}</p>
                    {hasActiveTasks && (
                      <span className="live-chip inline-flex items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold leading-none">
                        <span className="live-chip-dot size-1.5 rounded-full" />
                        {snapshot.activeCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                data-no-drag
                className="panel-close flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
                aria-label="Collapse floating sessions"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                }}
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>

            <div className="panel-list relative z-[1] min-h-0 flex-1 overflow-y-auto px-1 pb-1">
              {snapshot.sessions.length === 0 ? (
                <div className="empty-panel flex h-full min-h-[110px] items-center justify-center rounded-[12px] px-5 text-center text-sm">
                  No agent sessions yet
                </div>
              ) : (
                <div className="flex flex-col space-y-2">
                  {snapshot.sessions.map((session, index) => (
                    <div
                      key={session.id}
                      className="session-row"
                      style={{ "--session-index": Math.min(index, 6) } as CSSProperties}
                    >
                      <FloatingSessionItem session={session} theme={theme} onSelect={handleOpenSession} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
