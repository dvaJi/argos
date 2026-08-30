import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { createBrowserClient } from "#api/BrowserClient";
import { BrowserPanel } from "./BrowserPanel";
import { WorkspacePanel } from "./WorkspacePanel";
import { DiffsPanel } from "./DiffsPanel";
import { TerminalPanel } from "./TerminalPanel";
import { WORKSPACE_EVENTS } from "#/events";
import { openBrowser, useSidepanelStore } from "#/stores/ui/sidepanel";
interface ChatSidePanelProps {
  sessionId: string | null;
  workspacePath: string | null;
}
const PANEL_MOTION_MS = 220;
const FULLSCREEN_MOTION_MS = 180;
const CHAT_SIDE_PANEL_STYLES = `
        .chat-side-panel-shell {
          contain: layout style paint;
          transition-duration: var(--dc-motion-default);
          transition-property: width;
          transition-timing-function: var(--dc-ease-out-express);
        }
        .chat-side-panel-surface {
          backface-visibility: hidden;
          transform: translateZ(0);
          transition-duration: var(--dc-motion-default);
          transition-property: transform, opacity, box-shadow, border-radius;
          transition-timing-function: var(--dc-ease-out-express);
          will-change: transform, opacity;
        }
        .chat-side-panel-surface--fullscreen-enter {
          animation: workspace-panel-fullscreen-enter 180ms var(--dc-ease-out-express);
        }
        .chat-side-panel-surface--fullscreen-exit {
          animation: workspace-panel-fullscreen-exit 180ms var(--dc-ease-out-express);
        }
        .chat-side-panel-shell--resizing .chat-side-panel-surface {
          transition: none;
        }
        .chat-side-panel-shell--resizing {
          transition: none;
        }
        @keyframes workspace-panel-fullscreen-enter {
          from { opacity: 0.94; transform: translateZ(0) scale(0.985); }
          to { opacity: 1; transform: translateZ(0) scale(1); }
        }
        @keyframes workspace-panel-fullscreen-exit {
          from { opacity: 0.96; transform: translateZ(0) scale(1.01); }
          to { opacity: 1; transform: translateZ(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-side-panel-shell { transition: none; }
          .chat-side-panel-surface { transition: none; }
          .chat-side-panel-surface--fullscreen-enter,
          .chat-side-panel-surface--fullscreen-exit { animation: none; }
        }
      `;
export function ChatSidePanel({ sessionId, workspacePath }: ChatSidePanelProps) {
  const sidepanelStore = useSidepanelStore();
  // Module-level store action; stable across renders so callbacks depending on
  // it stay referentially stable.
  const setWidth = sidepanelStore.setWidth;
  const browserClient = createBrowserClient();
  const stopBrowserOpenRequestedListener = useRef<(() => void) | null>(null);
  const resizeStartRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);
  const pendingResizeWidth = useRef<number | null>(null);
  const resizeFrame = useRef<number | null>(null);
  const panelMotionTimer = useRef<number | null>(null);
  const panelMotionFrame = useRef<number | null>(null);
  const fullscreenMotionTimer = useRef<number | null>(null);
  const shouldShow = sidepanelStore.open && Boolean(sessionId);
  const [layoutWidth, setLayoutWidth] = useState(shouldShow ? sidepanelStore.width : 0);
  const [panelVisible, setPanelVisible] = useState(shouldShow);
  const [isResizing, setIsResizing] = useState(false);
  const [isWorkspaceFullscreen, setIsWorkspaceFullscreen] = useState(false);
  const [fullscreenMotionState, setFullscreenMotionState] = useState<"expanding" | "collapsing" | null>(null);

  // Render-phase adjustments replacing the previous setState-in-effect
  // lifecycle effects: reset transition state when the panel hides, the tab
  // leaves "workspace", or the session goes away, and keep the layout width in
  // sync with the store while the panel is shown or still fading out.
  const [wasShown, setWasShown] = useState(shouldShow);
  if (wasShown !== shouldShow) {
    setWasShown(shouldShow);
    if (!shouldShow) {
      setIsWorkspaceFullscreen(false);
      setFullscreenMotionState(null);
      setPanelVisible(false);
    }
  }
  const [prevActiveTab, setPrevActiveTab] = useState(sidepanelStore.activeTab);
  if (prevActiveTab !== sidepanelStore.activeTab) {
    setPrevActiveTab(sidepanelStore.activeTab);
    if (sidepanelStore.activeTab !== "workspace") {
      setIsWorkspaceFullscreen(false);
      setFullscreenMotionState(null);
    }
  }
  const [prevSessionId, setPrevSessionId] = useState(sessionId);
  if (prevSessionId !== sessionId) {
    setPrevSessionId(sessionId);
    if (!sessionId) {
      setIsWorkspaceFullscreen(false);
      setFullscreenMotionState(null);
    }
  }
  if ((shouldShow || layoutWidth > 0) && layoutWidth !== sidepanelStore.width) {
    setLayoutWidth(sidepanelStore.width);
  }
  const isWorkspaceFullscreenActive = isWorkspaceFullscreen && shouldShow && sidepanelStore.activeTab === "workspace";
  const shellStyle = {
    width: isWorkspaceFullscreenActive ? "100%" : `${layoutWidth}px`,
  };
  const handleBrowserOpenRequested = (payload: { sessionId: string }) => {
    if (!sessionId || payload.sessionId !== sessionId) return;
    openBrowser();
  };
  const clearPanelMotionHandles = () => {
    if (panelMotionTimer.current !== null) {
      window.clearTimeout(panelMotionTimer.current);
      panelMotionTimer.current = null;
    }
    if (panelMotionFrame.current !== null) {
      window.cancelAnimationFrame(panelMotionFrame.current);
      panelMotionFrame.current = null;
    }
  };
  const clearFullscreenMotionHandle = () => {
    if (fullscreenMotionTimer.current !== null) {
      window.clearTimeout(fullscreenMotionTimer.current);
      fullscreenMotionTimer.current = null;
    }
    setFullscreenMotionState(null);
  };
  const applyPendingResize = () => {
    resizeFrame.current = null;
    if (pendingResizeWidth.current === null) return;
    setWidth(pendingResizeWidth.current);
    pendingResizeWidth.current = null;
  };
  const stopResizeTracking = () => {
    if (resizeFrame.current !== null) {
      window.cancelAnimationFrame(resizeFrame.current);
      resizeFrame.current = null;
    }
    if (pendingResizeWidth.current !== null) {
      setWidth(pendingResizeWidth.current);
      pendingResizeWidth.current = null;
    }
  };
  const toggleWorkspaceFullscreen = () => {
    if (!shouldShow || sidepanelStore.activeTab !== "workspace") return;
    clearFullscreenMotionHandle();
    setFullscreenMotionState(isWorkspaceFullscreen ? "collapsing" : "expanding");
    fullscreenMotionTimer.current = window.setTimeout(() => {
      fullscreenMotionTimer.current = null;
      setFullscreenMotionState(null);
    }, FULLSCREEN_MOTION_MS);
    setIsWorkspaceFullscreen(!isWorkspaceFullscreen);
  };
  const handleWorkspaceInsertFileReference = (filePath: string) => {
    const sid = sessionId?.trim();
    const targetPath = filePath.trim();
    if (!sid || !targetPath) return;
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_EVENTS.INSERT_REFERENCE_REQUESTED, {
        detail: {
          sessionId: sid,
          filePath: targetPath,
        },
      }),
    );
  };
  const startResize = (event: MouseEvent) => {
    event.preventDefault();
    if (isWorkspaceFullscreenActive) return;
    stopResizeTracking();
    resizeStartRef.current = {
      startX: event.clientX,
      startWidth: sidepanelStore.width,
    };
    setIsResizing(true);
  };
  useEffect(() => {
    if (!isResizing) return;
    const start = resizeStartRef.current;
    if (!start) return;
    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      pendingResizeWidth.current = start.startWidth - (moveEvent.clientX - start.startX);
      if (resizeFrame.current === null) {
        resizeFrame.current = window.requestAnimationFrame(applyPendingResize);
      }
    };
    const onMouseUp = (_evt: globalThis.MouseEvent) => {
      setIsResizing(false);
    };
    window.addEventListener("mousemove", onMouseMove, {
      passive: true,
    });
    window.addEventListener("mouseup", onMouseUp, {
      once: true,
    });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      stopResizeTracking();
      setIsResizing(false);
    };
  }, [isResizing, applyPendingResize, stopResizeTracking]);

  // Panel show/hide motion. State transitions happen in the render-phase
  // adjustments above; this effect only manages timers/rAF handles (async
  // setState only).
  useEffect(() => {
    clearPanelMotionHandles();
    stopResizeTracking();
    if (shouldShow) {
      panelMotionFrame.current = window.requestAnimationFrame(() => {
        panelMotionFrame.current = null;
        setPanelVisible(true);
      });
    } else {
      if (fullscreenMotionTimer.current !== null) {
        window.clearTimeout(fullscreenMotionTimer.current);
        fullscreenMotionTimer.current = null;
      }
      panelMotionTimer.current = window.setTimeout(() => {
        panelMotionTimer.current = null;
        if (!shouldShow) setLayoutWidth(0);
      }, PANEL_MOTION_MS);
    }
  }, [shouldShow, clearPanelMotionHandles, stopResizeTracking]);
  useEffect(() => {
    stopBrowserOpenRequestedListener.current =
      browserClient.onOpenRequestedForCurrentWindow(handleBrowserOpenRequested);
    return () => {
      clearPanelMotionHandles();
      clearFullscreenMotionHandle();
      stopResizeTracking();
      stopBrowserOpenRequestedListener.current?.();
      stopBrowserOpenRequestedListener.current = null;
    };
  }, [
    browserClient,
    handleBrowserOpenRequested,
    clearPanelMotionHandles,
    clearFullscreenMotionHandle,
    stopResizeTracking,
  ]);
  return (
    <div
      data-testid="chat-side-panel-shell"
      className={`chat-side-panel-shell h-full min-h-0 overflow-hidden ${isWorkspaceFullscreenActive ? "absolute inset-0 z-30 w-full" : "relative shrink-0"} ${isResizing ? "chat-side-panel-shell--resizing" : ""}`}
      style={shellStyle}
      data-workspace-fullscreen={String(isWorkspaceFullscreenActive)}
    >
      {sessionId && (
        <aside
          className={`chat-side-panel-surface absolute inset-y-0 flex h-full min-h-0 w-full origin-right flex-col bg-sidebar ${isWorkspaceFullscreenActive ? "inset-x-0 border shadow-xl" : "right-0 border-l shadow-lg"} ${panelVisible ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-3 opacity-0 shadow-none"} ${fullscreenMotionState === "expanding" ? "chat-side-panel-surface--fullscreen-enter" : fullscreenMotionState === "collapsing" ? "chat-side-panel-surface--fullscreen-exit" : ""}`}
        >
          {panelVisible && !isWorkspaceFullscreenActive && (
            <button
              data-testid="chat-side-panel-resize-handle"
              className="absolute inset-y-0 left-0 w-1 -translate-x-1/2 cursor-col-resize"
              type="button"
              aria-label="Resize panel"
              onMouseDown={startResize}
            />
          )}

          <div className="flex h-11 items-center justify-between border-b px-3">
            <ChatSidePanelTabBar
              activeTab={sidepanelStore.activeTab}
              onOpenWorkspace={() => sidepanelStore.openWorkspace(sessionId)}
              onOpenDiffs={() => sidepanelStore.openDiffs()}
              onOpenBrowser={() => sidepanelStore.openBrowser()}
              onOpenTerminal={() => sidepanelStore.openTerminal()}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => sidepanelStore.closePanel()}>
              <Icon icon="lucide:x" className="h-4 w-4" />
            </Button>
          </div>

          {sidepanelStore.activeTab === "workspace" ? (
            <WorkspacePanel
              sessionId={sessionId}
              workspacePath={workspacePath}
              isFullscreen={isWorkspaceFullscreenActive}
              onToggleFullscreen={toggleWorkspaceFullscreen}
              onInsertFileReference={handleWorkspaceInsertFileReference}
            />
          ) : sidepanelStore.activeTab === "diffs" ? (
            <DiffsPanel sessionId={sessionId} workspacePath={workspacePath} />
          ) : sidepanelStore.activeTab === "terminal" ? (
            <TerminalPanel workspacePath={workspacePath} />
          ) : (
            <BrowserPanel sessionId={sessionId} />
          )}
        </aside>
      )}
      <style>{CHAT_SIDE_PANEL_STYLES}</style>
    </div>
  );
}

const ChatSidePanelTabBar = ({
  activeTab,
  onOpenWorkspace,
  onOpenDiffs,
  onOpenBrowser,
  onOpenTerminal,
}: {
  activeTab: string;
  onOpenWorkspace: () => void;
  onOpenDiffs: () => void;
  onOpenBrowser: () => void;
  onOpenTerminal: () => void;
}) => (
  <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
    <button
      className={`rounded-md px-2.5 py-1 text-xs transition-colors duration-200 ease-out ${activeTab === "workspace" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
      type="button"
      onClick={onOpenWorkspace}
    >
      Workspace
    </button>
    <button
      className={`rounded-md px-2.5 py-1 text-xs transition-colors duration-200 ease-out ${activeTab === "diffs" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
      type="button"
      onClick={onOpenDiffs}
    >
      Diffs
    </button>
    <button
      className={`rounded-md px-2.5 py-1 text-xs transition-colors duration-200 ease-out ${activeTab === "browser" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
      type="button"
      onClick={onOpenBrowser}
    >
      Browser
    </button>
    <button
      className={`rounded-md px-2.5 py-1 text-xs transition-colors duration-200 ease-out ${activeTab === "terminal" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
      type="button"
      onClick={onOpenTerminal}
    >
      Terminal
    </button>
  </div>
);
