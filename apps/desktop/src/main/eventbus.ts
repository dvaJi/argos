import { IWindowPresenter, ITabPresenter } from "@argos/shared/presenter";
import EventEmitter from "events";

export enum SendTarget {
  ALL_WINDOWS = "all_windows",
  DEFAULT_WINDOW = "default_window",
  DEFAULT_TAB = "default_tab",
}

export class EventBus extends EventEmitter {
  private windowPresenter: IWindowPresenter | null = null;

  constructor() {
    super();
  }
  /**
   * Emit an event only to the main process
   */
  sendToMain(eventName: string, ...args: unknown[]) {
    super.emit(eventName, ...args);
  }

  sendToWindow(eventName: string, windowId: number, ...args: unknown[]) {
    if (!this.windowPresenter) {
      console.warn("WindowPresenter not available, cannot send to window");
      return;
    }
    this.windowPresenter.sendToWindow(windowId, eventName, ...args);
  }
  /**
   * Emit an event to the renderer process
   * @param eventName Event name
   * @param target Dispatch target: all windows or the default window
   * @param args Event arguments
   */
  sendToRenderer(eventName: string, target: SendTarget = SendTarget.ALL_WINDOWS, ...args: unknown[]) {
    if (!this.windowPresenter) {
      console.warn("WindowPresenter not available, cannot send to renderer");
      return;
    }

    this.dispatchToRenderer(this.windowPresenter, eventName, target, ...args);
  }

  /**
   * Emit an event to the renderer process (if the window presenter is available)
   * @returns Whether the event was dispatched to the renderer
   */
  sendToRendererIfAvailable(
    eventName: string,
    target: SendTarget = SendTarget.ALL_WINDOWS,
    ...args: unknown[]
  ): boolean {
    if (!this.windowPresenter) {
      return false;
    }

    this.dispatchToRenderer(this.windowPresenter, eventName, target, ...args);
    return true;
  }

  private dispatchToRenderer(
    windowPresenter: IWindowPresenter,
    eventName: string,
    target: SendTarget = SendTarget.ALL_WINDOWS,
    ...args: unknown[]
  ) {
    switch (target) {
      case SendTarget.ALL_WINDOWS:
        windowPresenter.sendToAllWindows(eventName, ...args);
        break;
      case SendTarget.DEFAULT_WINDOW:
        windowPresenter.sendToDefaultWindow(eventName, true, ...args);
        break;
      case SendTarget.DEFAULT_TAB:
        windowPresenter.sendToDefaultTab(eventName, true, ...args);
        break;
      default:
        windowPresenter.sendToAllWindows(eventName, ...args);
    }
  }

  /**
   * Emit an event to both the main and renderer processes
   * @param eventName Event name
   * @param target Dispatch target
   * @param args Event arguments
   */
  send(eventName: string, target: SendTarget = SendTarget.ALL_WINDOWS, ...args: unknown[]) {
    // Dispatch to the main process
    this.sendToMain(eventName, ...args);

    // Dispatch to the renderer (silently skipped early in startup when no window exists)
    this.sendToRendererIfAvailable(eventName, target, ...args);
  }

  /**
   * Set the window presenter (used to dispatch messages to the renderer)
   */
  setWindowPresenter(windowPresenter: IWindowPresenter) {
    this.windowPresenter = windowPresenter;
  }

  /**
   * Set the tab presenter (kept for legacy BrowserView routing compatibility)
   */
  setTabPresenter(_tabPresenter: ITabPresenter) {
    // Intentionally kept as a compatibility hook for legacy initialization paths.
  }

  /**
   * Emit an event to a specific webContents
   * @param webContentsId webContents ID
   * @param eventName Event name
   * @param args Event arguments
   */
  sendToWebContents(webContentsId: number, eventName: string, ...args: unknown[]) {
    if (!this.windowPresenter) {
      console.warn("WindowPresenter not available, cannot send to specific webContents");
      return;
    }

    this.windowPresenter
      .sendToWebContents(webContentsId, eventName, ...args)
      .then((sent) => {
        if (!sent) {
          console.warn(`webContents ${webContentsId} not found or destroyed, cannot send event ${eventName}`);
        }
      })
      .catch((error) => {
        console.error(`Error sending event ${eventName} to webContents ${webContentsId}:`, error);
      });
  }

  /**
   * Deprecated alias for webContents routing.
   * @param windowId Window ID
   * @param eventName Event name
   * @param args Event arguments
   */
  sendToActiveTab(windowId: number, eventName: string, ...args: unknown[]) {
    if (!this.windowPresenter) {
      console.warn("WindowPresenter not available, cannot send to active window content");
      return;
    }

    this.windowPresenter
      .sendToActiveTab(windowId, eventName, ...args)
      .then((sent) => {
        if (!sent) {
          console.warn(`No active content found for window ${windowId}`);
        }
      })
      .catch((error) => {
        console.error(`Error getting active content for window ${windowId}:`, error);
      });
  }

  /**
   * Broadcast an event to multiple webContents
   * @param webContentsIds Array of webContents IDs
   * @param eventName Event name
   * @param args Event arguments
   */
  broadcastToWebContents(webContentsIds: number[], eventName: string, ...args: unknown[]) {
    webContentsIds.forEach((webContentsId) => this.sendToWebContents(webContentsId, eventName, ...args));
  }

  sendToTab(tabId: number, eventName: string, ...args: unknown[]) {
    this.sendToWebContents(tabId, eventName, ...args);
  }

  broadcastToTabs(tabIds: number[], eventName: string, ...args: unknown[]) {
    this.broadcastToWebContents(tabIds, eventName, ...args);
  }
}

// Create the global EventBus instance
export const eventBus = new EventBus();
