/* eslint-disable @typescript-eslint/no-explicit-any */
import { eventBus } from "#/eventbus";
import { WINDOW_EVENTS, CONFIG_EVENTS, SYSTEM_EVENTS, TAB_EVENTS } from "#/events";
import { is } from "@electron-toolkit/utils";
import { ITabPresenter, TabCreateOptions, IWindowPresenter, TabData } from "@argos/shared/presenter";
import {
  BrowserWindow,
  WebContentsView,
  nativeImage,
  webContents as electronWebContents,
  type WebPreferences,
} from "electron";
import contextMenu from "#/contextMenuHelper";
import { addWatermarkToNativeImage } from "#/lib/watermark";
import { stitchImagesVertically } from "#/lib/scrollCapture";
import { openExternalUrl } from "#/lib/externalUrl";
import { resolveUiUrl } from "#/lib/daemonUi";
import { getPreloadPath } from "#/lib/paths";
import { presenter } from "./";
import { getYoBrowserSession } from "./browser/yoBrowserSession";

const tabContextMenuLabels = {
  copy: "Copy",
  paste: "Paste",
  cut: "Cut",
  selectAll: "Select All",
  undo: "Undo",
  redo: "Redo",
  saveImage: "Save Image...",
  copyImage: "Copy Image",
  translate: "Translate",
  askAI: "Ask AI",
} as const;

export class TabPresenter implements ITabPresenter {
  // Global tab instance storage
  private tabs: Map<number, WebContentsView> = new Map();

  // Tab state storage
  private tabState: Map<number, TabData> = new Map();

  // Map of window ID to its list of tab IDs
  private windowTabs: Map<number, number[]> = new Map();

  // Map of tab ID to its owning window ID
  private tabWindowMap: Map<number, number> = new Map();

  // Context-menu disposers for each tab
  private tabContextMenuDisposers: Map<number, () => void> = new Map();

  // Map of WebContents ID to Tab ID (for IPC source identification)
  private webContentsToTabId: Map<number, number> = new Map();

  private windowTypes: Map<number, "chat" | "browser"> = new Map();
  private chromeHeights: Map<number, number> = new Map();
  private static readonly DEFAULT_CHROME_HEIGHT = 60;
  private static readonly DEFAULT_WINDOW_TYPE: "chat" | "browser" = "chat";

  private windowPresenter: IWindowPresenter; // Window presenter instance

  constructor(windowPresenter: IWindowPresenter) {
    this.windowPresenter = windowPresenter; // Injected window presenter
    this.initBusHandlers();
  }

  setWindowType(windowId: number, type: "chat" | "browser"): void {
    this.windowTypes.set(windowId, type);
  }

  getWindowType(windowId: number): "chat" | "browser" {
    return this.windowTypes.get(windowId) ?? TabPresenter.DEFAULT_WINDOW_TYPE;
  }

  updateChromeHeight(windowId: number, height: number): void {
    const safeHeight = Math.max(0, Math.floor(height));
    this.chromeHeights.set(windowId, safeHeight);
    const window = BrowserWindow.fromId(windowId);
    if (!window || window.isDestroyed()) return;
    const tabs = this.windowTabs.get(windowId) || [];
    tabs.forEach((tabId) => {
      const view = this.tabs.get(tabId);
      if (view) {
        this.updateViewBounds(window, view);
      }
    });
  }

  private onWindowSizeChange(windowId: number) {
    const views = this.windowTabs.get(windowId);
    const window = BrowserWindow.fromId(windowId);
    if (window && !window.isDestroyed()) {
      views?.forEach((view) => {
        const tabView = this.tabs.get(view);
        if (tabView) {
          this.updateViewBounds(window, tabView);
        }
      });
    }
  }
  // Initialize EventBus handlers
  private initBusHandlers(): void {
    // Window resized: update view bounds
    eventBus.on(WINDOW_EVENTS.WINDOW_RESIZE, (windowId: number) => this.onWindowSizeChange(windowId));
    eventBus.on(WINDOW_EVENTS.WINDOW_MAXIMIZED, (windowId: number) => {
      setTimeout(() => {
        this.onWindowSizeChange(windowId);
      }, 100);
    });
    eventBus.on(WINDOW_EVENTS.WINDOW_UNMAXIMIZED, (windowId: number) => {
      setTimeout(() => {
        this.onWindowSizeChange(windowId);
      }, 100);
    });

    // Window closed: detach contained views
    eventBus.on(WINDOW_EVENTS.WINDOW_CLOSED, (windowId: number) => {
      const views = this.windowTabs.get(windowId);
      const window = BrowserWindow.fromId(windowId);
      if (window) {
        views?.forEach((viewId) => {
          const view = this.tabs.get(viewId);
          if (view) {
            this.detachViewFromWindow(window, view);
          }
          const conversationId = presenter.getActiveConversationIdSync(viewId);
          if (conversationId) {
            void presenter.cleanupConversationRuntimeArtifacts(conversationId);
          }
        });
      }
      this.windowTabs.delete(windowId);
      this.windowTypes.delete(windowId);
      this.chromeHeights.delete(windowId);
    });

    // Language setting changed: update context menus for all tabs
    eventBus.on(CONFIG_EVENTS.SETTING_CHANGED, async (key) => {
      if (key === "language") {
        // Update the context menu for all active tabs
        for (const [tabId] of this.tabWindowMap.entries()) {
          await this.setupTabContextMenu(tabId);
        }
      }
    });

    // System theme updated: notify all tabs
    eventBus.on(SYSTEM_EVENTS.SYSTEM_THEME_UPDATED, (isDark: boolean) => {
      // Broadcast theme update to all tabs
      for (const [, view] of this.tabs.entries()) {
        if (!view.webContents.isDestroyed()) {
          view.webContents.send("system-theme-updated", isDark);
        }
      }
    });
  }

  /**
   * Create a new tab and add it to the given window.
   */
  async createTab(windowId: number, url: string, options: TabCreateOptions = {}): Promise<number | null> {
    console.log("createTab", windowId, url, options);
    const window = BrowserWindow.fromId(windowId);
    if (!window) return null;
    if (!this.windowTypes.has(windowId)) {
      this.windowTypes.set(windowId, TabPresenter.DEFAULT_WINDOW_TYPE);
    }
    const windowType = this.getWindowType(windowId);
    const isLocalUrl = url.startsWith("local://");

    if (windowType === "browser" && isLocalUrl) {
      console.warn(`Browser window ${windowId} cannot open local tab: ${url}`);
      return null;
    }

    if (windowType === "chat" && !isLocalUrl && !options.allowNonLocal) {
      console.warn(`Chat window ${windowId} cannot open external tab without explicit opt-in: ${url}`);
      return null;
    }

    if (!this.chromeHeights.has(windowId)) {
      this.chromeHeights.set(windowId, TabPresenter.DEFAULT_CHROME_HEIGHT);
    }

    const webPreferences: WebPreferences = {
      sandbox: false,
      devTools: is.dev,
    };

    // For browser windows, do not inject preload (for security)
    // For chat windows, inject preload
    if (windowType !== "browser") {
      webPreferences.preload = getPreloadPath("index.mjs");
    }

    if (windowType === "browser") {
      webPreferences.session = getYoBrowserSession();
    }

    // Create a new WebContentsView
    const view = new WebContentsView({
      webPreferences,
    });

    view.setBorderRadius(0);
    view.setBackgroundColor("#00ffffff");

    // Load content
    if (url.startsWith("local://")) {
      const viewType = url.replace("local://", "");
      view.webContents.loadURL(resolveUiUrl(`/#/${viewType}`));
    } else {
      view.webContents.loadURL(url);
    }

    // Open DevTools automatically in dev mode
    if (is.dev) {
      view.webContents.openDevTools({ mode: "detach" });
    }

    // Store tab info
    const tabId = view.webContents.id;
    this.tabs.set(tabId, view);
    this.tabState.set(tabId, {
      id: tabId,
      title: url,
      isActive: options.active ?? true,
      url: url,
      closable: true,
      position: options?.position ?? 0,
    });

    // Map WebContents ID to Tab ID
    this.webContentsToTabId.set(view.webContents.id, tabId);

    // Update window-tab mapping
    if (!this.windowTabs.has(windowId)) {
      this.windowTabs.set(windowId, []);
    }

    const tabs = this.windowTabs.get(windowId)!;
    const insertIndex = options.position !== undefined ? options.position : tabs.length;
    tabs.splice(insertIndex, 0, tabId);

    this.tabWindowMap.set(tabId, windowId);

    // Add to the window
    this.attachViewToWindow(window, view);

    // If activation requested, mark as the active tab
    if (options.active ?? true) {
      await this.activateTab(tabId);
    }

    // Set up the context menu after creating the tab
    await this.setupTabContextMenu(tabId);

    // Listen for tab-related events
    this.setupWebContentsListeners(view.webContents, tabId, windowId);

    // Notify the renderer to refresh the tab list
    await this.notifyWindowTabsUpdate(windowId);

    return tabId;
  }

  /**
   * Close a tab.
   */
  async closeTab(tabId: number): Promise<boolean> {
    return await this.destroyTab(tabId);
  }

  /**
   * Close all tabs in a window.
   */
  async closeTabs(windowId: number): Promise<void> {
    const tabs = [...(this.windowTabs.get(windowId) ?? [])];
    tabs.forEach((t) => this.closeTab(t));
  }

  /**
   * Switch to a tab (activate it).
   */
  async switchTab(tabId: number): Promise<boolean> {
    return await this.activateTab(tabId);
  }

  /**
   * Get the tab instance.
   */
  async getTab(tabId: number): Promise<WebContentsView | undefined> {
    return this.tabs.get(tabId);
  }

  /**
   * Destroy a tab.
   */
  private async destroyTab(tabId: number): Promise<boolean> {
    // Clean up the context menu
    this.cleanupTabContextMenu(tabId);

    const view = this.tabs.get(tabId);
    if (!view) return false;

    const windowId = this.tabWindowMap.get(tabId);
    if (!windowId) return false;

    const window = BrowserWindow.fromId(windowId);
    if (window) {
      // Remove the view from the window
      this.detachViewFromWindow(window, view);
    }

    // Remove event listeners
    this.removeWebContentsListeners(view.webContents);

    // Remove from data structures
    this.tabs.delete(tabId);
    this.tabState.delete(tabId);
    this.tabWindowMap.delete(tabId);

    // Broadcast the tab closed event
    eventBus.sendToMain(TAB_EVENTS.CLOSED, tabId);

    // Clear the WebContents mapping
    if (view) {
      this.webContentsToTabId.delete(view.webContents.id);
    }

    if (this.windowTabs.has(windowId)) {
      const tabs = this.windowTabs.get(windowId)!;
      const index = tabs.indexOf(tabId);
      if (index !== -1) {
        tabs.splice(index, 1);

        // If other tabs remain and the closed one was active, activate a neighbor
        if (tabs.length > 0) {
          const newActiveIndex = Math.min(index, tabs.length - 1);
          await this.activateTab(tabs[newActiveIndex]);
        }
      }

      // Notify the renderer to refresh the tab list
      await this.notifyWindowTabsUpdate(windowId);
    }

    // Destroy the view
    view.webContents.close();
    // Note: view.destroy() is also an option depending on Electron version/behavior
    return true;
  }

  /**
   * Activate a tab.
   */
  private async activateTab(tabId: number): Promise<boolean> {
    const view = this.tabs.get(tabId);
    if (!view) return false;

    const windowId = this.tabWindowMap.get(tabId);
    if (!windowId) return false;

    const window = BrowserWindow.fromId(windowId);
    if (!window) return false;

    // Get all tabs in the window
    const tabs = this.windowTabs.get(windowId) || [];

    // Update active state for all tabs and toggle view visibility
    for (const id of tabs) {
      const state = this.tabState.get(id);
      const tabView = this.tabs.get(id);
      if (state && tabView) {
        state.isActive = id === tabId;
        tabView.setVisible(id === tabId); // Toggle view visibility based on active state
      }
    }

    // Ensure the active view is visible and brought to front
    this.bringViewToFront(window, view);

    // Notify the renderer to refresh the tab list
    await this.notifyWindowTabsUpdate(windowId);

    // Notify the renderer to switch the active tab
    window.webContents.send("setActiveTab", windowId, tabId);

    return true;
  }

  /**
   * Detach the tab from its current window (without destroying it).
   */
  async detachTab(tabId: number): Promise<boolean> {
    const view = this.tabs.get(tabId);
    if (!view) return false;

    const windowId = this.tabWindowMap.get(tabId);
    if (!windowId) return false;

    const window = BrowserWindow.fromId(windowId);
    if (window) {
      // Remove the view from the window
      this.detachViewFromWindow(window, view);
    }

    // Remove from the window's tab list
    if (this.windowTabs.has(windowId)) {
      const tabs = this.windowTabs.get(windowId)!;
      const index = tabs.indexOf(tabId);
      if (index !== -1) {
        tabs.splice(index, 1);
      }

      // Notify the renderer to refresh the tab list
      await this.notifyWindowTabsUpdate(windowId);

      // If other tabs remain in the window, activate one
      if (tabs.length > 0) {
        await this.activateTab(tabs[Math.min(index, tabs.length - 1)]);
      }
    }

    // Mark as detached
    this.tabWindowMap.delete(tabId);

    return true;
  }

  /**
   * Attach the tab to the target window.
   */
  async attachTab(tabId: number, targetWindowId: number, index?: number): Promise<boolean> {
    const view = this.tabs.get(tabId);
    if (!view) return false;

    const window = BrowserWindow.fromId(targetWindowId);
    if (!window || window.isDestroyed()) return false;
    const state = this.tabState.get(tabId);
    if (!state) {
      console.warn(`attachTab: Tab ${tabId} state not found.`);
      return false;
    }
    const targetWindowType = this.getWindowType(targetWindowId);
    const isLocal = state.url?.startsWith("local://");

    if (targetWindowType === "browser" && isLocal) {
      console.warn(`Browser window ${targetWindowId} cannot attach local tab ${tabId}.`);
      return false;
    }
    if (targetWindowType === "chat" && !isLocal) {
      console.warn(`Chat window ${targetWindowId} cannot attach external tab ${tabId}.`);
      return false;
    }
    if (!this.chromeHeights.has(targetWindowId)) {
      this.chromeHeights.set(targetWindowId, TabPresenter.DEFAULT_CHROME_HEIGHT);
    }

    // Ensure the target window has a tab list
    if (!this.windowTabs.has(targetWindowId)) {
      this.windowTabs.set(targetWindowId, []);
    }

    // Add to the target window's tab list
    const tabs = this.windowTabs.get(targetWindowId)!;
    const insertIndex = index !== undefined ? index : tabs.length;
    tabs.splice(insertIndex, 0, tabId);

    // Update the tab's owning window
    this.tabWindowMap.set(tabId, targetWindowId);

    // Attach the view to the window
    this.attachViewToWindow(window, view);

    // Activate the tab
    await this.activateTab(tabId);

    // Notify the renderer to refresh the tab list
    await this.notifyWindowTabsUpdate(targetWindowId);

    return true;
  }

  /**
   * Move the tab from the source window to the target window.
   */
  async moveTab(tabId: number, targetWindowId: number, index?: number): Promise<boolean> {
    const windowId = this.tabWindowMap.get(tabId);
    const tabState = this.tabState.get(tabId);
    if (!tabState) {
      console.warn(`moveTab: Tab ${tabId} state not found.`);
      return false;
    }
    const targetWindowType = this.getWindowType(targetWindowId);
    const isLocal = tabState.url?.startsWith("local://");

    if (targetWindowType === "browser" && isLocal) {
      console.warn(`Browser window ${targetWindowId} cannot receive local tab ${tabId}.`);
      return false;
    }
    if (targetWindowType === "chat" && !isLocal) {
      console.warn(`Chat window ${targetWindowId} cannot receive external tab ${tabId}.`);
      return false;
    }

    // If already in the target window, only adjust the position
    if (windowId === targetWindowId) {
      if (index !== undefined && this.windowTabs.has(windowId)) {
        const tabs = this.windowTabs.get(windowId)!;
        const currentIndex = tabs.indexOf(tabId);
        if (currentIndex !== -1 && currentIndex !== index) {
          // Remove from the current position
          tabs.splice(currentIndex, 1);

          // Compute the new insertion index (accounting for the removal shift)
          const newIndex = index > currentIndex ? index - 1 : index;

          // Insert at the new position
          tabs.splice(newIndex, 0, tabId);
          // Notify the renderer to refresh the tab list
          await this.notifyWindowTabsUpdate(windowId);
          return true;
        }
      }
      return false;
    }

    // Detach from the source window
    const detached = await this.detachTab(tabId);
    if (!detached) return false;

    // Attach to the target window
    return await this.attachTab(tabId, targetWindowId, index);
  }

  /**
   * Get the ID of the currently active tab in the given window.
   * This method lives on TabPresenter because it owns the isActive state.
   * @param windowId Window ID.
   * @returns The active tab ID, or undefined if none is active or the window is invalid.
   */
  async getActiveTabId(windowId: number): Promise<number | undefined> {
    // Get the tab ID list for the window
    const tabsInWindow = this.windowTabs.get(windowId);
    if (!tabsInWindow) {
      console.warn(`TabPresenter: No tab list found for window ${windowId} when getting active tab ID.`);
      return undefined;
    }

    // Iterate the tab list and return the first tab marked active
    for (const tabId of tabsInWindow) {
      const state = this.tabState.get(tabId);
      // Check that state exists and isActive is true
      if (state?.isActive) {
        return tabId; // Return the active tab ID
      }
    }

    // No active tab found
    console.log(`TabPresenter: No active tab found for window ${windowId}.`);
    return undefined;
  }

  /**
   * Get all tab data for the window.
   */
  async getWindowTabsData(windowId: number): Promise<TabData[]> {
    const tabsInWindow = this.windowTabs.get(windowId) || [];
    return tabsInWindow.map((tabId) => {
      const state = this.tabState.get(tabId) || ({} as TabData);
      return state;
    });
  }

  /**
   * Get the Tab ID for a given WebContents ID.
   * @param webContentsId WebContents ID
   * @returns Tab ID, or undefined if not found.
   */
  getTabIdByWebContentsId(webContentsId: number): number | undefined {
    return this.webContentsToTabId.get(webContentsId);
  }

  /**
   * Get the window ID for a given WebContents ID.
   * @param webContentsId WebContents ID
   * @returns Window ID, or undefined if not found.
   */
  getWindowIdByWebContentsId(webContentsId: number): number | undefined {
    const tabId = this.getTabIdByWebContentsId(webContentsId);
    return tabId ? this.tabWindowMap.get(tabId) : undefined;
  }

  getTabWindowId(tabId: number): number | undefined {
    return this.tabWindowMap.get(tabId);
  }

  /**
   * Notify the renderer to refresh the tab list.
   */
  async notifyWindowTabsUpdate(windowId: number): Promise<void> {
    const window = BrowserWindow.fromId(windowId);
    if (!window || window.isDestroyed()) return;

    // Await the internal async call
    const tabListData = await this.getWindowTabsData(windowId);

    if (!window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
      // Sending IPC is typically synchronous
      window.webContents.send("update-window-tabs", windowId, tabListData);
    }
  }

  /**
   * Set up event listeners for a WebContents.
   */
  private setupWebContentsListeners(webContents: Electron.WebContents, tabId: number, windowId: number): void {
    // Handle external links
    webContents.setWindowOpenHandler(({ url }) => {
      openExternalUrl(url, "tab window");
      return { action: "deny" };
    });

    // Title changed
    webContents.on("page-title-updated", (_event, title) => {
      const state = this.tabState.get(tabId);
      if (state) {
        state.title = title || state.url || "Untitled";
        // Notify the renderer that the title was updated
        const window = BrowserWindow.fromId(windowId);
        if (window && !window.isDestroyed()) {
          window.webContents.send(TAB_EVENTS.TITLE_UPDATED, {
            tabId,
            title: state.title,
            windowId,
          });
        }
        this.notifyWindowTabsUpdate(windowId).catch(console.error); // Call async function, handle potential rejection
      }
    });

    // Check if this is the first tab in the window
    const isFirstTab = this.windowTabs.get(windowId)?.length === 1;
    const windowType = this.getWindowType(windowId);

    // Page finished loading
    if (isFirstTab) {
      // Once did-finish-load happens, emit first content loaded
      webContents.once("did-finish-load", () => {
        eventBus.sendToMain(WINDOW_EVENTS.FIRST_CONTENT_LOADED, windowId);
        // Only call focusActiveTab for chat windows, not browser windows
        // Browser windows should stay hidden when created via tool calls
        if (windowType !== "browser") {
          setTimeout(() => {
            const windowPresenter = presenter.windowPresenter as any;
            if (windowPresenter && typeof windowPresenter.focusActiveTab === "function") {
              windowPresenter.focusActiveTab(windowId, "initial");
            }
          }, 300);
        }
      });
    }

    // Favicon changed
    webContents.on("page-favicon-updated", (_event, favicons) => {
      if (favicons.length > 0) {
        const state = this.tabState.get(tabId);
        if (state) {
          if (state.icon !== favicons[0]) {
            console.log("page-favicon-updated", state.icon, favicons[0]);
            state.icon = favicons[0];
            this.notifyWindowTabsUpdate(windowId).catch(console.error); // Call async function, handle potential rejection
          }
        }
      }
    });

    // Navigation completed
    webContents.on("did-navigate", (_event, url) => {
      const state = this.tabState.get(tabId);
      if (state) {
        const isLocalTab = state.url?.startsWith("local://");
        if (!isLocalTab) {
          state.url = url;
          // Fall back to the URL as the title when there is none
          if (!state.title || state.title === "Untitled") {
            state.title = url;
            const window = BrowserWindow.fromId(windowId);
            if (window && !window.isDestroyed()) {
              window.webContents.send(TAB_EVENTS.TITLE_UPDATED, {
                tabId,
                title: state.title,
                windowId,
              });
            }
          }
          this.notifyWindowTabsUpdate(windowId).catch(console.error); // Call async function, handle potential rejection
        }
      }
    });
  }

  /**
   * Remove event listeners from a WebContents.
   */
  private removeWebContentsListeners(webContents: Electron.WebContents): void {
    webContents.removeAllListeners("page-title-updated");
    webContents.removeAllListeners("page-favicon-updated");
    webContents.removeAllListeners("did-navigate");
    webContents.removeAllListeners("did-finish-load");
    webContents.setWindowOpenHandler(() => ({ action: "allow" }));
  }

  /**
   * Attach a view to a window.
   * Note: the real implementation may need to follow Electron's window layout strategy.
   */
  private attachViewToWindow(window: BrowserWindow, view: WebContentsView): void {
    // This must be implemented per the actual window structure
    // A simple implementation could be:
    window.contentView.addChildView(view);
    this.updateViewBounds(window, view);
  }

  /**
   * Detach a view from a window.
   */
  private detachViewFromWindow(window: BrowserWindow, view: WebContentsView): void {
    // This must be implemented per the actual window structure
    window.contentView.removeChildView(view);
  }

  /**
   * Bring a view to the front (activate it).
   */
  private bringViewToFront(window: BrowserWindow, view: WebContentsView): void {
    // Re-adding ensures it's on top in most view hierarchies
    window.contentView.addChildView(view);
    this.updateViewBounds(window, view);
    const windowType = this.getWindowType(window.id);
    const isVisible = window.isVisible();
    const isFocused = window.isFocused();

    // For browser windows, only focus if window is already focused
    // This prevents focus stealing when tools call activateTab() on hidden browser windows
    // For chat windows, focus if visible (normal behavior)
    const shouldFocus = windowType === "browser" ? isVisible && isFocused : isVisible;

    if (shouldFocus && !view.webContents.isDestroyed()) {
      view.webContents.focus();
    }
  }

  /**
   * Resize the view to fit the window.
   */
  private updateViewBounds(window: BrowserWindow, view: WebContentsView): void {
    if (window.isDestroyed()) return;
    // Get the window size
    const { width, height } = window.getContentBounds();

    // Use a fixed top offset depending on the window type
    // Chat mode: AppBar = 36px (h-9)
    // Browser mode: AppBar + BrowserToolbar = 36px + 48px = 84px (h-9 + h-12)
    const windowType = this.getWindowType(window.id);
    const topOffset = windowType === "browser" ? 84 : 36;
    const viewHeight = Math.max(0, height - topOffset);

    // Set the view bounds (leave room for the top tab bar)
    view.setBounds({
      x: 0,
      y: topOffset,
      width: width,
      height: viewHeight,
    });
  }

  /**
   * Set up the context menu for a tab.
   */
  private async setupTabContextMenu(tabId: number): Promise<void> {
    const view = this.tabs.get(tabId);
    if (!view || view.webContents.isDestroyed()) return;

    // If a handler already exists, dispose it first
    if (this.tabContextMenuDisposers.has(tabId)) {
      this.tabContextMenuDisposers.get(tabId)?.();
      this.tabContextMenuDisposers.delete(tabId);
    }

    const disposer = contextMenu({
      webContents: view.webContents,
      labels: tabContextMenuLabels,
      shouldShowMenu() {
        return true;
      },
    });

    this.tabContextMenuDisposers.set(tabId, disposer);
  }

  /**
   * Clean up a tab's context menu.
   */
  private cleanupTabContextMenu(tabId: number): void {
    if (this.tabContextMenuDisposers.has(tabId)) {
      this.tabContextMenuDisposers.get(tabId)?.();
      this.tabContextMenuDisposers.delete(tabId);
    }
  }

  // Clean up presenter resources
  public async destroy(): Promise<void> {
    // Clean up context menus for all tabs
    for (const [tabId] of this.tabContextMenuDisposers) {
      this.cleanupTabContextMenu(tabId);
    }
    this.tabContextMenuDisposers.clear();

    // Destroy all tabs
    // Use a `for...of` loop so every closeTab call is awaited
    for (const [tabId] of this.tabWindowMap.entries()) {
      console.log(`Destroying resources for tab: ${tabId}`);
      await this.closeTab(tabId);
    }

    // Clear all mappings
    this.tabWindowMap.clear();
    this.tabs.clear();
    this.tabState.clear();
    this.windowTabs.clear();
    this.webContentsToTabId.clear();
    this.windowTypes.clear();
    this.chromeHeights.clear();
  }

  /**
   * Reorder tabs within a window.
   */
  async reorderTabs(windowId: number, tabIds: number[]): Promise<boolean> {
    console.log("reorderTabs", windowId, tabIds);

    const windowTabs = this.windowTabs.get(windowId);
    if (!windowTabs) return false;

    for (const tabId of tabIds) {
      if (!windowTabs.includes(tabId)) {
        console.warn(`Tab ${tabId} does not belong to window ${windowId}`);
        return false;
      }
    }

    if (tabIds.length !== windowTabs.length) {
      console.warn("Tab count mismatch in reorder operation");
      return false;
    }

    this.windowTabs.set(windowId, [...tabIds]);

    tabIds.forEach((tabId, index) => {
      const tabState = this.tabState.get(tabId);
      if (tabState) {
        tabState.position = index;
      }
    });

    await this.notifyWindowTabsUpdate(windowId);

    return true;
  }

  // Move a tab to a new window
  async moveTabToNewWindow(tabId: number, screenX?: number, screenY?: number): Promise<boolean> {
    const tabInfo = this.tabState.get(tabId);
    const originalWindowId = this.tabWindowMap.get(tabId);

    if (!tabInfo || originalWindowId === undefined) {
      console.error(`moveTabToNewWindow: Tab ${tabId} not found or no window associated.`);
      return false;
    }

    // 1. Detach the tab from the current window
    const detached = await this.detachTab(tabId);
    if (!detached) {
      console.error(`moveTabToNewWindow: Failed to detach tab ${tabId} from window ${originalWindowId}.`);
      // Consider reattaching here on failure if that's the desired fallback
      // await this.attachTab(tabId, originalWindowId);
      return false;
    }

    // 2. Create a new window
    const sourceWindowType = this.getWindowType(originalWindowId);
    const newWindowOptions: Record<string, any> = {
      forMovedTab: true,
      windowType: sourceWindowType,
    };
    if (screenX !== undefined && screenY !== undefined) {
      newWindowOptions.x = screenX;
      newWindowOptions.y = screenY;
    }

    const newWindowId =
      sourceWindowType === "browser"
        ? await this.windowPresenter.createBrowserWindow({
            x: newWindowOptions.x,
            y: newWindowOptions.y,
          })
        : await this.windowPresenter.createAppWindow({
            initialRoute: "chat",
            x: newWindowOptions.x,
            y: newWindowOptions.y,
          });

    if (newWindowId === null) {
      console.error("moveTabToNewWindow: Failed to create a new window.");
      // Reattach to original window if new window creation fails
      await this.attachTab(tabId, originalWindowId);
      return false;
    }

    // 3. Attach the tab to the new window
    const attached = await this.attachTab(tabId, newWindowId);
    if (!attached) {
      console.error(`moveTabToNewWindow: Failed to attach tab ${tabId} to new window ${newWindowId}.`);
      // Reattach to original window if attaching fails
      await this.attachTab(tabId, originalWindowId);
      // Optionally close the empty new window here:
      // const newBrowserWindow = BrowserWindow.fromId(newWindowId);
      // if (newBrowserWindow && !newBrowserWindow.isDestroyed()) newBrowserWindow.close();
      return false;
    }

    // console.log(`Tab ${tabId} moved from window ${originalWindowId} to new window ${newWindowId}`); // Kept concise log
    // Notify the original window to refresh its tab list
    await this.notifyWindowTabsUpdate(originalWindowId);
    // Notify the new window to refresh its tab list
    await this.notifyWindowTabsUpdate(newWindowId);

    return true;
  }

  /**
   * Capture a simple screenshot of a region of a tab.
   * @param tabId Tab ID.
   * @param rect Capture region.
   * @returns Base64 image data, or null on failure.
   */
  async captureTabArea(
    tabId: number,
    rect: { x: number; y: number; width: number; height: number },
  ): Promise<string | null> {
    try {
      let targetWebContents: Electron.WebContents | null = null;

      const tabView = this.tabs.get(tabId);
      if (tabView && !tabView.webContents.isDestroyed()) {
        targetWebContents = tabView.webContents;
      } else {
        const directWebContents = electronWebContents.fromId(tabId);
        if (directWebContents && !directWebContents.isDestroyed()) {
          targetWebContents = directWebContents;
        }
      }

      // Fallback: some callers may pass windowId. Capture active tab in that window.
      if (!targetWebContents) {
        const window = BrowserWindow.fromId(tabId);
        if (window && !window.isDestroyed()) {
          const activeTabId = await this.getActiveTabId(window.id);
          if (activeTabId) {
            const activeView = this.tabs.get(activeTabId);
            if (activeView && !activeView.webContents.isDestroyed()) {
              targetWebContents = activeView.webContents;
            }
          }

          if (!targetWebContents && !window.webContents.isDestroyed()) {
            targetWebContents = window.webContents;
          }
        }
      }

      if (!targetWebContents || targetWebContents.isDestroyed()) {
        console.error(`captureTabArea: Tab ${tabId} not found or destroyed`);
        return null;
      }

      // Capture via Electron's capturePage API
      const image = await targetWebContents.capturePage(rect);

      if (image.isEmpty()) {
        console.error("Capture tab area: Captured image is empty");
        return null;
      }

      // Convert to base64 format
      const base64Data = image.toDataURL();
      return base64Data;
    } catch (error) {
      console.error("Capture tab area error:", error);
      return null;
    }
  }

  /**
   * Handle the renderer's tab-ready event.
   * @param tabId Tab ID.
   */
  async onRendererTabReady(tabId: number): Promise<void> {
    console.log(`Tab ${tabId} renderer ready`);
    // Notify other modules via the EventBus
    eventBus.sendToMain(TAB_EVENTS.RENDERER_TAB_READY, tabId);
  }

  /**
   * Handle the renderer's tab-activated event.
   * @param threadId Session ID.
   */
  async onRendererTabActivated(threadId: string): Promise<void> {
    console.log(`Thread ${threadId} activated in renderer`);
    // Notify other modules via the EventBus
    eventBus.sendToMain(TAB_EVENTS.RENDERER_TAB_ACTIVATED, threadId);
  }

  /**
   * Stitch multiple screenshots into a tall image and add a watermark.
   * @param imageDataList Array of base64 image data.
   * @param options Watermark options.
   * @returns Base64 image data after stitching and watermarking, or null on failure.
   */
  async stitchImagesWithWatermark(
    imageDataList: string[],
    options: {
      isDark?: boolean;
      version?: string;
      texts?: {
        brand?: string;
        time?: string;
        tip?: string;
        model?: string;
        provider?: string;
      };
    } = {},
  ): Promise<string | null> {
    try {
      if (imageDataList.length === 0) {
        console.error("stitchImagesWithWatermark: No images provided");
        return null;
      }

      // With a single image, add the watermark directly
      if (imageDataList.length === 1) {
        const nativeImageInstance = nativeImage.createFromDataURL(imageDataList[0]);
        const watermarkedImage = await addWatermarkToNativeImage(nativeImageInstance, options);
        return watermarkedImage.toDataURL();
      }

      // Convert base64 images to NativeImage, then to Buffer
      const imageBuffers = imageDataList.map((data) => {
        const image = nativeImage.createFromDataURL(data);
        return image.toPNG();
      });

      // Stitch the images
      const stitchedImage = await stitchImagesVertically(imageBuffers);

      // Add the watermark
      const watermarkedImage = await addWatermarkToNativeImage(stitchedImage, options);

      // Convert to base64 format
      const base64Data = watermarkedImage.toDataURL();

      console.log(`Successfully stitched ${imageDataList.length} images with watermark`);
      return base64Data;
    } catch (error) {
      console.error("Stitch images with watermark error:", error);
      return null;
    }
  }

  /**
   * Check whether a tab is the last tab in its window.
   */
  async isLastTabInWindow(tabId: number): Promise<boolean> {
    const windowId = this.tabWindowMap.get(tabId);
    if (windowId === undefined) return false;
    const tabsInWindow = this.windowTabs.get(windowId) || [];
    return tabsInWindow.length === 1;
  }

  /**
   * Reset the given tab to a blank page (new session page).
   */
  async resetTabToBlank(tabId: number): Promise<void> {
    const view = this.tabs.get(tabId);
    if (view && !view.webContents.isDestroyed()) {
      const url = "local://chat";
      view.webContents.loadURL(resolveUiUrl("/#/chat"));
      // Update the tab state
      const state = this.tabState.get(tabId);
      if (state) {
        state.title = "New Chat";
        state.url = url;
        const windowId = this.tabWindowMap.get(tabId);
        if (windowId) {
          await this.notifyWindowTabsUpdate(windowId);
        }
      }
    }
  }

  registerFloatingWindow(webContentsId: number, webContents: Electron.WebContents): void {
    try {
      console.log(`TabPresenter: Registering floating window as virtual tab, ID: ${webContentsId}`);
      if (this.tabs.has(webContentsId)) {
        console.warn(`TabPresenter: Tab ${webContentsId} already exists, skipping registration`);
        return;
      }
      const virtualView = {
        webContents: webContents,
        setVisible: () => {},
        setBounds: () => {},
        getBounds: () => ({ x: 0, y: 0, width: 400, height: 600 }),
      } as any;
      this.webContentsToTabId.set(webContentsId, webContentsId);
      this.tabs.set(webContentsId, virtualView);
      console.log(`TabPresenter: Virtual tab registered successfully for floating window ${webContentsId}`);
    } catch (error) {
      console.error("TabPresenter: Failed to register floating window:", error);
    }
  }

  unregisterFloatingWindow(webContentsId: number): void {
    try {
      console.log(`TabPresenter: Unregistering floating window virtual tab, ID: ${webContentsId}`);
      this.webContentsToTabId.delete(webContentsId);
      this.tabs.delete(webContentsId);
      console.log(`TabPresenter: Virtual tab unregistered successfully for floating window ${webContentsId}`);
    } catch (error) {
      console.error("TabPresenter: Failed to unregister floating window:", error);
    }
  }
}
