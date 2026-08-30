import { type FormEvent, useEffect, useRef, useReducer } from "react";
import type { Rectangle } from "electron";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { createBrowserClient } from "#api/BrowserClient";
import { BrowserPlaceholder } from "./BrowserPlaceholder";
import type { YoBrowserStatus } from "@argos/shared/types/browser";
import { useSidepanelStore } from "#/stores/ui/sidepanel";
import { useSessionStore } from "#/stores/ui/session";
interface BrowserPanelProps {
  sessionId: string | null;
}
const STABLE_RECT_SAMPLE_MS = 48;
const STABLE_RECT_TIMEOUT_MS = 1500;
const roundBounds = (bounds: Rectangle): Rectangle => ({
  x: Math.round(bounds.x),
  y: Math.round(bounds.y),
  width: Math.round(bounds.width),
  height: Math.round(bounds.height),
});
const areBoundsEqual = (left: Rectangle | null, right: Rectangle): boolean =>
  left !== null &&
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};
const emptyBrowserStatus = (): YoBrowserStatus => ({
  initialized: false,
  page: null,
  canGoBack: false,
  canGoForward: false,
  visible: false,
  loading: false,
});
type BrowserPanelState = {
  browserStatus: YoBrowserStatus;
  urlInput: string;
  canGoBack: boolean;
  canGoForward: boolean;
  showPlaceholder: boolean;
};
type BrowserPanelAction =
  | { type: "RESET" }
  | { type: "APPLY_STATUS"; status: YoBrowserStatus }
  | { type: "SET_URL_INPUT"; value: string };
const createInitialBrowserPanelState = (): BrowserPanelState => ({
  browserStatus: emptyBrowserStatus(),
  urlInput: "",
  canGoBack: false,
  canGoForward: false,
  showPlaceholder: true,
});
const browserPanelReducer = (state: BrowserPanelState, action: BrowserPanelAction): BrowserPanelState => {
  switch (action.type) {
    case "RESET":
      return {
        browserStatus: emptyBrowserStatus(),
        urlInput: "",
        canGoBack: false,
        canGoForward: false,
        showPlaceholder: true,
      };
    case "APPLY_STATUS": {
      const url = action.status.page?.url || "about:blank";
      return {
        browserStatus: action.status,
        urlInput: url === "about:blank" ? "" : url,
        canGoBack: action.status.canGoBack,
        canGoForward: action.status.canGoForward,
        showPlaceholder: !action.status.initialized || url === "about:blank",
      };
    }
    case "SET_URL_INPUT":
      return { ...state, urlInput: action.value };
  }
};
export function BrowserPanel({ sessionId }: BrowserPanelProps) {
  const sidepanelStore = useSidepanelStore();
  const sessionStore = useSessionStore();
  const browserClient = createBrowserClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [browser, dispatchBrowser] = useReducer(browserPanelReducer, undefined, createInitialBrowserPanelState);
  const lastSyncedBounds = useRef<Rectangle | null>(null);
  const pendingBrowserDestroySessionIds = useRef(new Set<string>());
  const visibilityRunId = useRef(0);
  const stopOpenRequestedListener = useRef<(() => void) | null>(null);
  const stopStatusChangedListener = useRef<(() => void) | null>(null);
  const pendingBoundsSyncFrame = useRef<number | null>(null);
  const currentSessionId = sessionId?.trim() || "";
  const isBrowserPanelVisible = sidepanelStore.open && sidepanelStore.activeTab === "browser";
  const getSessionUiStatus = (sid: string) => sessionStore.sessions.find((s) => s.id === sid)?.status ?? null;
  const callBrowserAction = async <T,>(action: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      console.error(`[BrowserPanel] ${action} failed`, error);
      return null;
    }
  };
  const resetBrowserState = () => {
    dispatchBrowser({ type: "RESET" });
  };
  const applyBrowserStatus = (status: YoBrowserStatus) => {
    dispatchBrowser({ type: "APPLY_STATUS", status });
  };
  const captureContainerBounds = (): Rectangle | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  };
  const canSyncVisibleBounds = () =>
    Boolean(currentSessionId && browser.browserStatus.initialized && isBrowserPanelVisible);
  const waitForStableRect = async (runId: number): Promise<Rectangle | null> => {
    let previousKey = "";
    let stableCount = 0;
    const deadline = Date.now() + STABLE_RECT_TIMEOUT_MS;
    while (runId === visibilityRunId.current && isBrowserPanelVisible) {
      const rect = captureContainerBounds();
      if (rect && rect.width > 0 && rect.height > 0) {
        const key = `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
        stableCount = key === previousKey ? stableCount + 1 : 1;
        previousKey = key;
        if (stableCount >= 2) return rect;
      } else {
        previousKey = "";
        stableCount = 0;
      }
      if (Date.now() >= deadline) {
        console.warn("[BrowserPanel] stable rect wait timed out");
        return null;
      }
      await wait(STABLE_RECT_SAMPLE_MS);
    }
    return null;
  };
  const loadState = async (sid: string = currentSessionId) => {
    if (!sid) {
      resetBrowserState();
      return;
    }
    const status = await callBrowserAction("getStatus", () => browserClient.getStatus(sid));
    if (sid !== currentSessionId) return;
    if (!status) {
      resetBrowserState();
      return;
    }
    applyBrowserStatus(status);
  };
  const syncVisibleBounds = async () => {
    if (!canSyncVisibleBounds()) return;
    const sid = currentSessionId;
    const capturedBounds = captureContainerBounds();
    const rect = capturedBounds ? roundBounds(capturedBounds) : null;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    if (areBoundsEqual(lastSyncedBounds.current, rect)) return;
    lastSyncedBounds.current = rect;
    await callBrowserAction("updateCurrentWindowBounds", () =>
      browserClient.updateCurrentWindowBounds(sid, rect, true),
    );
  };
  const scheduleVisibleBoundsSync = () => {
    if (!canSyncVisibleBounds() || pendingBoundsSyncFrame.current !== null) return;
    pendingBoundsSyncFrame.current = window.requestAnimationFrame(() => {
      pendingBoundsSyncFrame.current = null;
      void syncVisibleBounds();
    });
  };
  const cancelScheduledBoundsSync = () => {
    if (pendingBoundsSyncFrame.current === null) return;
    window.cancelAnimationFrame(pendingBoundsSyncFrame.current);
    pendingBoundsSyncFrame.current = null;
  };
  const hideEmbedded = async (sid: string = currentSessionId) => {
    visibilityRunId.current += 1;
    cancelScheduledBoundsSync();
    if (!sid) return;
    const hiddenBounds = lastSyncedBounds.current ??
      captureContainerBounds() ?? {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
    await callBrowserAction("updateCurrentWindowBounds(hidden)", () =>
      browserClient.updateCurrentWindowBounds(sid, hiddenBounds, false),
    );
    await callBrowserAction("detach", () => browserClient.detach(sid));
  };
  const ensureVisibleAttachment = async () => {
    if (!currentSessionId || !browser.browserStatus.initialized || !isBrowserPanelVisible) return;
    const runId = ++visibilityRunId.current;
    await new Promise((r) => setTimeout(r, 0));
    const stableRect = await waitForStableRect(runId);
    if (stableRect == null || runId !== visibilityRunId.current || !isBrowserPanelVisible) return;
    const attached = await callBrowserAction("attachCurrentWindow", () =>
      browserClient.attachCurrentWindow(currentSessionId),
    );
    if (!attached || runId !== visibilityRunId.current) return;
    const visibleBounds = roundBounds(stableRect);
    lastSyncedBounds.current = visibleBounds;
    await callBrowserAction("updateCurrentWindowBounds(visible)", () =>
      browserClient.updateCurrentWindowBounds(currentSessionId, visibleBounds, true),
    );
    await loadState(currentSessionId);
  };
  const handleStatusChanged = async (payload: { sessionId: string; status: YoBrowserStatus | null }) => {
    if (payload.sessionId !== currentSessionId) return;
    await loadState(currentSessionId);
  };
  const handleOpenRequested = async (payload: { sessionId: string; url: string }) => {
    if (payload.sessionId !== currentSessionId) return;
    if (payload.url) dispatchBrowser({ type: "SET_URL_INPUT", value: payload.url });
    await loadState(currentSessionId);
    if (isBrowserPanelVisible) await ensureVisibleAttachment();
  };
  const flushPendingSessionDestroys = async () => {
    await Promise.all(
      Array.from(pendingBrowserDestroySessionIds.current).map(async (sid) => {
        if (getSessionUiStatus(sid) === "working") return;
        pendingBrowserDestroySessionIds.current.delete(sid);
        await callBrowserAction("destroy", () => browserClient.destroy(sid));
      }),
    );
  };
  const navigate = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentSessionId) return;
    const nextUrl = normalizeUrl(browser.urlInput);
    if (!nextUrl) return;
    const result = await callBrowserAction("loadUrl", () => browserClient.loadUrl(currentSessionId, nextUrl));
    if (result === null) return;
    applyBrowserStatus(result);
    await loadState(currentSessionId);
  };
  const goBack = async () => {
    if (!currentSessionId || !browser.browserStatus.initialized) return;
    await callBrowserAction("goBack", () => browserClient.goBack(currentSessionId));
    await loadState(currentSessionId);
  };
  const goForward = async () => {
    if (!currentSessionId || !browser.browserStatus.initialized) return;
    await callBrowserAction("goForward", () => browserClient.goForward(currentSessionId));
    await loadState(currentSessionId);
  };
  const reloadPage = async () => {
    if (!currentSessionId || !browser.browserStatus.initialized) return;
    await callBrowserAction("reload", () => browserClient.reload(currentSessionId));
    await loadState(currentSessionId);
  };

  // Latest-value refs so the lifecycle effects below can keep their original,
  // narrow trigger conditions while always invoking the freshest callbacks.
  const loadStateRef = useRef(loadState);
  const ensureVisibleAttachmentRef = useRef(ensureVisibleAttachment);
  const hideEmbeddedRef = useRef(hideEmbedded);
  const resetBrowserStateRef = useRef(resetBrowserState);
  const flushPendingSessionDestroysRef = useRef(flushPendingSessionDestroys);
  const scheduleVisibleBoundsSyncRef = useRef(scheduleVisibleBoundsSync);
  const cancelScheduledBoundsSyncRef = useRef(cancelScheduledBoundsSync);
  const handleOpenRequestedRef = useRef(handleOpenRequested);
  const handleStatusChangedRef = useRef(handleStatusChanged);
  const currentSessionIdRef = useRef(currentSessionId);
  const isBrowserPanelVisibleRef = useRef(isBrowserPanelVisible);
  useEffect(() => {
    loadStateRef.current = loadState;
    ensureVisibleAttachmentRef.current = ensureVisibleAttachment;
    hideEmbeddedRef.current = hideEmbedded;
    resetBrowserStateRef.current = resetBrowserState;
    flushPendingSessionDestroysRef.current = flushPendingSessionDestroys;
    scheduleVisibleBoundsSyncRef.current = scheduleVisibleBoundsSync;
    cancelScheduledBoundsSyncRef.current = cancelScheduledBoundsSync;
    handleOpenRequestedRef.current = handleOpenRequested;
    handleStatusChangedRef.current = handleStatusChanged;
    currentSessionIdRef.current = currentSessionId;
    isBrowserPanelVisibleRef.current = isBrowserPanelVisible;
  }, [
    loadState,
    ensureVisibleAttachment,
    hideEmbedded,
    resetBrowserState,
    flushPendingSessionDestroys,
    scheduleVisibleBoundsSync,
    cancelScheduledBoundsSync,
    handleOpenRequested,
    handleStatusChanged,
    currentSessionId,
    isBrowserPanelVisible,
  ]);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => scheduleVisibleBoundsSync());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [scheduleVisibleBoundsSync]);
  useEffect(() => {
    if (isBrowserPanelVisible) {
      void loadStateRef.current(currentSessionIdRef.current);
      void ensureVisibleAttachmentRef.current();
    } else {
      void hideEmbeddedRef.current(currentSessionIdRef.current);
    }
  }, [isBrowserPanelVisible]);
  useEffect(() => {
    if (sessionId) {
      void loadStateRef.current(sessionId);
      if (isBrowserPanelVisibleRef.current) void ensureVisibleAttachmentRef.current();
    } else {
      resetBrowserStateRef.current();
    }
  }, [sessionId]);
  useEffect(() => {
    void flushPendingSessionDestroys();
    if (currentSessionId) void loadStateRef.current(currentSessionId);
  }, [flushPendingSessionDestroys, currentSessionId]);
  useEffect(() => {
    const onResize = () => scheduleVisibleBoundsSyncRef.current();
    window.addEventListener("resize", onResize);
    stopOpenRequestedListener.current = browserClient.onOpenRequestedForCurrentWindow((payload) =>
      handleOpenRequestedRef.current(payload),
    );
    stopStatusChangedListener.current = browserClient.onStatusChanged((payload) =>
      handleStatusChangedRef.current(payload),
    );
    if (currentSessionIdRef.current) void loadStateRef.current(currentSessionIdRef.current);
    if (isBrowserPanelVisibleRef.current) void ensureVisibleAttachmentRef.current();
    return () => {
      window.removeEventListener("resize", onResize);
      cancelScheduledBoundsSyncRef.current();
      void hideEmbeddedRef.current(currentSessionIdRef.current);
      stopOpenRequestedListener.current?.();
      stopOpenRequestedListener.current = null;
      stopStatusChangedListener.current?.();
      stopStatusChangedListener.current = null;
    };
  }, [browserClient]);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <BrowserToolbar
        canGoBack={browser.canGoBack}
        canGoForward={browser.canGoForward}
        onGoBack={goBack}
        onGoForward={goForward}
        onReload={reloadPage}
        url={browser.urlInput}
        onUrlChange={(value) => dispatchBrowser({ type: "SET_URL_INPUT", value })}
        onSubmit={navigate}
      />
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {browser.showPlaceholder && (
          <div className="absolute inset-0">
            <BrowserPlaceholder />
          </div>
        )}
      </div>
    </div>
  );
}

const BrowserToolbar = ({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onReload,
  url,
  onUrlChange,
  onSubmit,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  url: string;
  onUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) => (
  <div className="flex h-11 items-center gap-2 border-b px-3">
    <Button
      variant="outline"
      size="icon"
      className="h-7 w-7"
      aria-label="Back"
      disabled={!canGoBack}
      onClick={onGoBack}
    >
      <Icon icon="lucide:arrow-left" className="h-4 w-4" />
    </Button>
    <Button
      variant="outline"
      size="icon"
      className="h-7 w-7"
      aria-label="Forward"
      disabled={!canGoForward}
      onClick={onGoForward}
    >
      <Icon icon="lucide:arrow-right" className="h-4 w-4" />
    </Button>
    <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Reload" onClick={onReload}>
      <Icon icon="lucide:refresh-ccw" className="h-4 w-4" />
    </Button>
    <form className="flex min-w-0 flex-1" onSubmit={onSubmit}>
      <Input
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        aria-label="Address"
        className="h-7 text-xs"
        placeholder="Enter URL..."
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
      />
    </form>
  </div>
);
