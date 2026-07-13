import { type FormEvent, useEffect, useRef, useState, useMemo, useCallback } from "react";
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

export function BrowserPanel({ sessionId }: BrowserPanelProps) {
  const sidepanelStore = useSidepanelStore();
  const sessionStore = useSessionStore();
  const browserClient = useMemo(() => createBrowserClient(), []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [browserStatus, setBrowserStatus] = useState<YoBrowserStatus>({
    initialized: false,
    page: null,
    canGoBack: false,
    canGoForward: false,
    visible: false,
    loading: false,
  });
  const [urlInput, setUrlInput] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(true);

  const lastSyncedBounds = useRef<Rectangle | null>(null);
  const pendingBrowserDestroySessionIds = useRef(new Set<string>());
  const visibilityRunId = useRef(0);
  const stopOpenRequestedListener = useRef<(() => void) | null>(null);
  const stopStatusChangedListener = useRef<(() => void) | null>(null);
  const pendingBoundsSyncFrame = useRef<number | null>(null);

  const currentSessionId = useMemo(() => sessionId?.trim() || "", [sessionId]);
  const isBrowserPanelVisible = useMemo(
    () => sidepanelStore.open && sidepanelStore.activeTab === "browser",
    [sidepanelStore.open, sidepanelStore.activeTab],
  );

  const getSessionUiStatus = useCallback(
    (sid: string) => sessionStore.sessions.find((s) => s.id === sid)?.status ?? null,
    [sessionStore.sessions],
  );

  const callBrowserAction = useCallback(async <T,>(action: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      console.error(`[BrowserPanel] ${action} failed`, error);
      return null;
    }
  }, []);

  const resetBrowserState = useCallback(() => {
    setBrowserStatus({
      initialized: false,
      page: null,
      canGoBack: false,
      canGoForward: false,
      visible: false,
      loading: false,
    });
    setUrlInput("about:blank");
    setUrlInput("");
    setCanGoBack(false);
    setCanGoForward(false);
    setShowPlaceholder(true);
  }, []);

  const applyBrowserStatus = useCallback((status: YoBrowserStatus) => {
    setBrowserStatus(status);
    const url = status.page?.url || "about:blank";
    setUrlInput(url);
    setUrlInput(url === "about:blank" ? "" : url);
    setCanGoBack(status.canGoBack);
    setCanGoForward(status.canGoForward);
    setShowPlaceholder(!status.initialized || url === "about:blank");
  }, []);

  const captureContainerBounds = useCallback((): Rectangle | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }, []);

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

  const canSyncVisibleBounds = useCallback(
    () => Boolean(currentSessionId && browserStatus.initialized && isBrowserPanelVisible),
    [currentSessionId, browserStatus.initialized, isBrowserPanelVisible],
  );

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const waitForStableRect = useCallback(
    async (runId: number): Promise<Rectangle | null> => {
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
    },
    [isBrowserPanelVisible, captureContainerBounds],
  );

  const loadState = useCallback(
    async (sid: string = currentSessionId) => {
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
    },
    [currentSessionId, browserClient, callBrowserAction, resetBrowserState, applyBrowserStatus],
  );

  const syncVisibleBounds = useCallback(async () => {
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
  }, [canSyncVisibleBounds, currentSessionId, captureContainerBounds, browserClient, callBrowserAction]);

  const scheduleVisibleBoundsSync = useCallback(() => {
    if (!canSyncVisibleBounds() || pendingBoundsSyncFrame.current !== null) return;
    pendingBoundsSyncFrame.current = window.requestAnimationFrame(() => {
      pendingBoundsSyncFrame.current = null;
      void syncVisibleBounds();
    });
  }, [canSyncVisibleBounds, syncVisibleBounds]);

  const cancelScheduledBoundsSync = useCallback(() => {
    if (pendingBoundsSyncFrame.current === null) return;
    window.cancelAnimationFrame(pendingBoundsSyncFrame.current);
    pendingBoundsSyncFrame.current = null;
  }, []);

  const hideEmbedded = useCallback(
    async (sid: string = currentSessionId) => {
      visibilityRunId.current += 1;
      cancelScheduledBoundsSync();
      if (!sid) return;
      const hiddenBounds = lastSyncedBounds.current ?? captureContainerBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
      await callBrowserAction("updateCurrentWindowBounds(hidden)", () =>
        browserClient.updateCurrentWindowBounds(sid, hiddenBounds, false),
      );
      await callBrowserAction("detach", () => browserClient.detach(sid));
    },
    [currentSessionId, cancelScheduledBoundsSync, captureContainerBounds, browserClient, callBrowserAction],
  );

  const ensureVisibleAttachment = useCallback(async () => {
    if (!currentSessionId || !browserStatus.initialized || !isBrowserPanelVisible) return;
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
  }, [
    currentSessionId,
    browserStatus.initialized,
    isBrowserPanelVisible,
    waitForStableRect,
    browserClient,
    callBrowserAction,
    loadState,
  ]);

  const handleStatusChanged = useCallback(
    async (payload: { sessionId: string; status: YoBrowserStatus | null }) => {
      if (payload.sessionId !== currentSessionId) return;
      await loadState(currentSessionId);
    },
    [currentSessionId, loadState],
  );

  const handleOpenRequested = useCallback(
    async (payload: { sessionId: string; url: string }) => {
      if (payload.sessionId !== currentSessionId) return;
      if (payload.url) setUrlInput(payload.url);
      await loadState(currentSessionId);
      if (isBrowserPanelVisible) await ensureVisibleAttachment();
    },
    [currentSessionId, loadState, isBrowserPanelVisible, ensureVisibleAttachment],
  );

  const normalizeUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const navigate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!currentSessionId) return;
      const nextUrl = normalizeUrl(urlInput);
      if (!nextUrl) return;
      const result = await callBrowserAction("loadUrl", () => browserClient.loadUrl(currentSessionId, nextUrl));
      if (result === null) return;
      applyBrowserStatus(result);
      await loadState(currentSessionId);
    },
    [currentSessionId, urlInput, browserClient, callBrowserAction, applyBrowserStatus, loadState],
  );

  const goBack = useCallback(async () => {
    if (!currentSessionId || !browserStatus.initialized) return;
    await callBrowserAction("goBack", () => browserClient.goBack(currentSessionId));
    await loadState(currentSessionId);
  }, [currentSessionId, browserStatus.initialized, browserClient, callBrowserAction, loadState]);

  const goForward = useCallback(async () => {
    if (!currentSessionId || !browserStatus.initialized) return;
    await callBrowserAction("goForward", () => browserClient.goForward(currentSessionId));
    await loadState(currentSessionId);
  }, [currentSessionId, browserStatus.initialized, browserClient, callBrowserAction, loadState]);

  const reloadPage = useCallback(async () => {
    if (!currentSessionId || !browserStatus.initialized) return;
    await callBrowserAction("reload", () => browserClient.reload(currentSessionId));
    await loadState(currentSessionId);
  }, [currentSessionId, browserStatus.initialized, browserClient, callBrowserAction, loadState]);

  const flushPendingSessionDestroys = useCallback(async () => {
    for (const sid of Array.from(pendingBrowserDestroySessionIds.current)) {
      if (getSessionUiStatus(sid) === "working") continue;
      pendingBrowserDestroySessionIds.current.delete(sid);
      await callBrowserAction("destroy", () => browserClient.destroy(sid));
    }
  }, [getSessionUiStatus, browserClient, callBrowserAction]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => scheduleVisibleBoundsSync());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [scheduleVisibleBoundsSync]);

  useEffect(() => {
    if (isBrowserPanelVisible) {
      void loadState(currentSessionId);
      void ensureVisibleAttachment();
    } else {
      void hideEmbedded(currentSessionId);
    }
  }, [isBrowserPanelVisible]);

  useEffect(() => {
    if (sessionId) {
      void loadState(sessionId);
      if (isBrowserPanelVisible) void ensureVisibleAttachment();
    } else {
      resetBrowserState();
    }
  }, [sessionId]);

  useEffect(() => {
    void flushPendingSessionDestroys();
    if (currentSessionId) void loadState(currentSessionId);
  }, [sessionStore.sessions]);

  useEffect(() => {
    window.addEventListener("resize", scheduleVisibleBoundsSync);
    stopOpenRequestedListener.current = browserClient.onOpenRequestedForCurrentWindow(handleOpenRequested);
    stopStatusChangedListener.current = browserClient.onStatusChanged(handleStatusChanged);

    if (currentSessionId) void loadState(currentSessionId);
    if (isBrowserPanelVisible) void ensureVisibleAttachment();

    return () => {
      window.removeEventListener("resize", scheduleVisibleBoundsSync);
      cancelScheduledBoundsSync();
      void hideEmbedded(currentSessionId);
      stopOpenRequestedListener.current?.();
      stopOpenRequestedListener.current = null;
      stopStatusChangedListener.current?.();
      stopStatusChangedListener.current = null;
    };
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-11 items-center gap-2 border-b px-3">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          aria-label="Back"
          disabled={!canGoBack}
          onClick={goBack}
        >
          <Icon icon="lucide:arrow-left" className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          aria-label="Forward"
          disabled={!canGoForward}
          onClick={goForward}
        >
          <Icon icon="lucide:arrow-right" className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Reload" onClick={reloadPage}>
          <Icon icon="lucide:refresh-ccw" className="h-4 w-4" />
        </Button>
        <form className="flex min-w-0 flex-1" onSubmit={navigate}>
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            aria-label="Address"
            className="h-7 text-xs"
            placeholder="Enter URL..."
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      </div>
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {showPlaceholder && (
          <div className="absolute inset-0">
            <BrowserPlaceholder />
          </div>
        )}
      </div>
    </div>
  );
}
