import { BrowserWindow } from "electron";
import { eventBus } from "#/eventbus";
import { WINDOW_EVENTS } from "#/events";
import { publishArgosEvent } from "./publishArgosEvent";

let windowEventBridgeInitialized = false;

/**
 * Forwards Electron window lifecycle events to renderers as the typed
 * `window.state.changed` Argos event. This is a desktop-only event
 * (`window.` prefix), so the HybridBridge delivers it over IPC.
 *
 * All other desktop-main eventBus chatter is intentionally not translated
 * here: non-desktop-only typed events reach renderers through the daemon's
 * `/api/v1/events` stream instead.
 */
export function setupWindowEventBridge(): void {
  if (windowEventBridgeInitialized) {
    return;
  }

  windowEventBridgeInitialized = true;

  const resolveWindowId = (payload: unknown): number | null => {
    if (typeof payload === "number") {
      return payload;
    }

    if (
      payload &&
      typeof payload === "object" &&
      "windowId" in payload &&
      typeof (payload as { windowId?: unknown }).windowId === "number"
    ) {
      return (payload as { windowId: number }).windowId;
    }

    return null;
  };

  const publishWindowStateChanged = (payload: unknown, existsOverride?: boolean) => {
    const windowId = resolveWindowId(payload);
    const window = windowId != null ? BrowserWindow.fromId(windowId) : null;
    const exists = existsOverride ?? Boolean(window && !window.isDestroyed());

    publishArgosEvent("window.state.changed", {
      windowId,
      exists,
      isMaximized: exists ? window!.isMaximized() : false,
      isFullScreen: exists ? window!.isFullScreen() : false,
      isFocused: exists ? window!.isFocused() : false,
      version: Date.now(),
    });
  };

  eventBus.on(WINDOW_EVENTS.WINDOW_CREATED, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_FOCUSED, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_BLURRED, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_MAXIMIZED, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_UNMAXIMIZED, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_ENTER_FULL_SCREEN, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_LEAVE_FULL_SCREEN, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_CLOSED, (payload?: unknown) => {
    publishWindowStateChanged(payload, false);
  });
}
