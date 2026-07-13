// src\main\presenter\windowPresenter\index.ts
import { BrowserWindow, shell, nativeImage, ipcMain, screen, webContents as electronWebContents } from "electron";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import icon from "../../../../resources/icon.png?asset"; // App icon (macOS/Linux)
import iconWin from "../../../../resources/icon.ico?asset"; // App icon (Windows)
import { is } from "@electron-toolkit/utils"; // Electron utilities
import { IConfigPresenter, IWindowPresenter } from "@argos/shared/presenter"; // Window Presenter interface
import { resolveSettingsNavigationPath, type SettingsNavigationPayload } from "@argos/shared/settingsNavigation";
import { eventBus } from "#/eventbus"; // Event bus
import {
  CONFIG_EVENTS,
  DEEPLINK_EVENTS,
  SETTINGS_EVENTS,
  SHORTCUT_EVENTS,
  SYSTEM_EVENTS,
  WINDOW_EVENTS,
} from "#/events"; // System/Window/Config/Shortcut event constants
import { getSidecarHandle } from "#/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook"; // Local daemon sidecar port
import { getDevServerBase, resolveUiUrl, waitForDaemonPort } from "#/lib/daemonUi"; // UI URL resolution (dev server / daemon)
import { presenter } from "../"; // Global presenter registry
import { releasePresenterCallErrorStateForWebContents } from "../presenterCallErrorHandler";
import windowStateManager from "electron-window-state"; // Window state manager
// TrayPresenter is globally managed in main/index.ts, this Presenter is not responsible for its lifecycle
import { TabPresenter } from "../tabPresenter"; // TabPresenter type
import { FloatingChatWindow } from "./FloatingChatWindow"; // Floating chat window
import type { ProviderInstallPreview } from "@argos/shared/providerDeeplink";
import { StartupWorkloadCoordinator } from "../startupWorkloadCoordinator";
import { openExternalUrl } from "#/lib/externalUrl";
import { activateAppOnMac } from "#/lib/activateApp";

type PendingSettingsMessage = {
  channel: string;
  args: unknown[];
};

/**
 * Window Presenter, responsible for managing all BrowserWindow instances and their lifecycles.
 * Including creation, destruction, minimization, maximization, hiding, showing, focus management, and interaction with tabs.
 */
export class WindowPresenter implements IWindowPresenter {
  // Map managing all BrowserWindow instances, key is window ID
  windows: Map<number, BrowserWindow>;
  private configPresenter: IConfigPresenter;
  // Exit flag indicating if app is in the process of quitting (set by 'before-quit' hook)
  private isQuitting: boolean = false;
  // Current focused window ID (internal record)
  private focusedWindowId: number | null = null;
  // Main window ID
  private mainWindowId: number | null = null;
  private floatingChatWindow: FloatingChatWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private settingsWindowReady = false;
  private pendingSettingsMessages: PendingSettingsMessage[] = [];
  private pendingSettingsProviderInstalls: ProviderInstallPreview[] = [];
  private readonly startupWorkloadCoordinator?: StartupWorkloadCoordinator;

  constructor(configPresenter: IConfigPresenter, startupWorkloadCoordinator?: StartupWorkloadCoordinator) {
    this.windows = new Map();
    this.configPresenter = configPresenter;
    this.startupWorkloadCoordinator = startupWorkloadCoordinator;

    // Register IPC handlers for Renderer to call to get window and WebContents IDs
    ipcMain.on("get-window-id", (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      event.returnValue = window ? window.id : null;
    });

    ipcMain.on("get-web-contents-id", (event) => {
      event.returnValue = event.sender.id;
    });

    // Chrome height reporting from browser windows (TabPresenter uses this for view bounds)
    ipcMain.on("browser:chrome-height", (event, payload: { height?: number } | number) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || window.isDestroyed()) return;
      const height = typeof payload === "number" ? payload : payload?.height;
      if (typeof height !== "number" || Number.isNaN(height)) return;
      (presenter.tabPresenter as TabPresenter).updateChromeHeight(window.id, height);
    });

    ipcMain.on("close-floating-window", (event) => {
      // Check if sender is the floating chat window
      const webContentsId = event.sender.id;
      if (this.floatingChatWindow && this.floatingChatWindow.getWindow()?.webContents.id === webContentsId) {
        this.hideFloatingChatWindow();
      }
    });

    // Listen for shortcut event: create new window
    eventBus.on(SHORTCUT_EVENTS.CREATE_NEW_WINDOW, () => {
      console.log("Creating new app window via shortcut.");
      this.createAppWindow();
    });

    // Listen for shortcut event: navigate to settings in main window
    eventBus.on(SHORTCUT_EVENTS.GO_SETTINGS, async () => {
      try {
        await this.navigateToSettings();
      } catch (err) {
        console.error("Failed to navigate to settings via eventBus:", err);
      }
    });

    // Allow renderer to request navigating to settings via IPC
    ipcMain.on(SHORTCUT_EVENTS.GO_SETTINGS, async () => {
      try {
        await this.navigateToSettings();
      } catch (err) {
        console.error("Failed to open/focus settings window via IPC:", err);
      }
    });

    ipcMain.on(SETTINGS_EVENTS.READY, (event) => {
      this.handleSettingsWindowReady(event.sender.id);
    });

    // Listen for system theme updates and notify all window renderers
    eventBus.on(SYSTEM_EVENTS.SYSTEM_THEME_UPDATED, (isDark: boolean) => {
      console.log("System theme updated, notifying all windows.");
      this.windows.forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send("system-theme-updated", isDark);
        } else {
          console.warn(`Skipping theme update for destroyed window ${window.id}.`);
        }
      });
    });

    // Listen for content protection changes: update all windows and restart the app
    eventBus.on(CONFIG_EVENTS.CONTENT_PROTECTION_CHANGED, (enabled: boolean) => {
      console.log(`Content protection setting changed to ${enabled}, restarting application.`);
      this.windows.forEach((window) => {
        if (!window.isDestroyed()) {
          this.updateContentProtection(window, enabled);
        } else {
          console.warn(`Skipping content protection update for destroyed window ${window.id}.`);
        }
      });
      // Content protection changes usually require an app restart to fully take effect
      setTimeout(() => {
        presenter.devicePresenter.restartApp();
      }, 1000);
    });

    // Listen for the updater setting the app quitting state
    eventBus.on(WINDOW_EVENTS.SET_APPLICATION_QUITTING, (data: { isQuitting: boolean }) => {
      console.log(`WindowPresenter: Setting application quitting state to ${data.isQuitting}`);
      this.setApplicationQuitting(data.isQuitting);
    });
  }

  private setupManagedWindowOpenHandler(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(({ url }) => {
      openExternalUrl(url, "managed window");
      return { action: "deny" };
    });
  }

  /**
   * @deprecated Use navigateToSettings() instead. Settings is now a route in the main window.
   * Open Settings tab if not exists, otherwise focus existing one in the given window.
   * This method is kept for backward compatibility.
   */
  public async openOrFocusSettingsTab(_windowId: number): Promise<void> {
    console.warn("openOrFocusSettingsTab is deprecated. Use navigateToSettings() instead.");
    await this.navigateToSettings();
  }

  /**
   * Navigate the main window to the settings route.
   * If settings navigation payload is provided, sends it to the renderer.
   * Returns the main window ID.
   */
  public async navigateToSettings(navigation?: SettingsNavigationPayload): Promise<number | null> {
    const mainWindow = this.mainWindow;
    if (!mainWindow || mainWindow.isDestroyed()) {
      console.warn("Cannot navigate to settings: no valid main window found.");
      return null;
    }

    console.log("Navigating main window to settings.");
    mainWindow.show();
    mainWindow.focus();
    activateAppOnMac();

    if (navigation) {
      this.sendToWindow(mainWindow.id, SETTINGS_EVENTS.NAVIGATE, navigation);
    } else {
      this.sendToWindow(mainWindow.id, SETTINGS_EVENTS.NAVIGATE, {
        routeName: "settings-overview",
      });
    }

    return mainWindow.id;
  }

  /**
   * Get the current main window (prefer the focused window, otherwise the first valid one).
   */
  get mainWindow(): BrowserWindow | undefined {
    const focused = this.getFocusedWindow();
    if (focused && !focused.isDestroyed()) {
      return focused;
    }
    const allWindows = this.getAllWindows();
    return allWindows.length > 0 && !allWindows[0].isDestroyed() ? allWindows[0] : undefined;
  }

  /**
   * Preview a file. macOS uses Quick Look; other platforms open it with the system default app.
   * @param filePath File path.
   */
  previewFile(filePath: string): void {
    let targetWindow = this.getFocusedWindow();
    if (!targetWindow && this.floatingChatWindow && this.floatingChatWindow.isShowing()) {
      const floatingWindow = this.floatingChatWindow.getWindow();
      if (floatingWindow) {
        targetWindow = floatingWindow;
      }
    }
    if (!targetWindow) {
      targetWindow = this.mainWindow;
    }

    if (targetWindow && !targetWindow.isDestroyed()) {
      console.log(`Previewing file: ${filePath}`);
      if (process.platform === "darwin") {
        targetWindow.previewFile(filePath);
      } else {
        shell.openPath(filePath); // Open with the system default app
      }
    } else {
      console.warn("Cannot preview file, no valid window found.");
    }
  }

  /**
   * Minimize the window with the given ID.
   * @param windowId Window ID.
   */
  minimize(windowId: number): void {
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      console.log(`Minimizing window ${windowId}.`);
      window.minimize();
    } else {
      console.warn(`Failed to minimize window ${windowId}, window does not exist or is destroyed.`);
    }
  }

  /**
   * Maximize/restore the window with the given ID.
   * @param windowId Window ID.
   */
  maximize(windowId: number): void {
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      console.log(`Maximizing/unmaximizing window ${windowId}.`);
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
      // Trigger restore logic so the active tab bounds are updated
      this.handleWindowRestore(windowId).catch((error) => {
        console.error(`Error handling restore logic after maximizing/unmaximizing window ${windowId}:`, error);
      });
    } else {
      console.warn(`Failed to maximize/unmaximize window ${windowId}, window does not exist or is destroyed.`);
    }
  }

  /**
   * Request to close the window with the given ID. Triggers the window's 'close' event.
   * The actual close/hide behavior is decided by the 'close' event handler.
   * @param windowId Window ID.
   */
  close(windowId: number): void {
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      console.log(`Requesting to close window ${windowId}, calling window.close().`);
      window.close(); // Triggers the 'close' event
    } else {
      console.warn(`Failed to request close for window ${windowId}, window does not exist or is destroyed.`);
    }
  }

  /**
   * Close-window method defined by the IWindowPresenter interface.
   * Behavior is identical to close(windowId) and is decided by the 'close' event handler.
   * @param windowId Window ID.
   * @param forceClose Whether to force close (the current impl is driven by the isQuitting flag; this param is unused).
   */
  async closeWindow(windowId: number, forceClose: boolean = false): Promise<void> {
    console.log(`closeWindow(${windowId}, ${forceClose}) called.`);
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      window.close(); // Triggers the 'close' event
    } else {
      console.warn(`Failed to close window ${windowId} in closeWindow, window does not exist or is destroyed.`);
    }
    return Promise.resolve();
  }

  /**
   * Hide the window with the given ID. Exits fullscreen first when in fullscreen mode.
   * @param windowId Window ID.
   */
  hide(windowId: number): void {
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      console.log(`Hiding window ${windowId}.`);
      // Handle the black screen issue when hiding a fullscreen window
      if (window.isFullScreen()) {
        console.log(`Window ${windowId} is fullscreen, exiting fullscreen before hiding.`);
        // Wait for leave-full-screen before hiding after exiting fullscreen
        window.once("leave-full-screen", () => {
          console.log(`Window ${windowId} left fullscreen, proceeding with hide.`);
          if (!window.isDestroyed()) {
            window.hide();
          } else {
            console.warn(`Window ${windowId} was destroyed after leaving fullscreen, cannot hide.`);
          }
        });
        window.setFullScreen(false); // Request exiting fullscreen
      } else {
        console.log(`Window ${windowId} is not fullscreen, hiding directly.`);
        window.hide(); // Hide directly
      }
    } else {
      console.warn(`Failed to hide window ${windowId}, window does not exist or is destroyed.`);
    }
  }

  /**
   * Show the window with the given ID. With no ID, shows the focused window or the first window.
   * @param windowId Optional. The window ID to show.
   * @param shouldFocus Optional. Whether to take focus, defaults to true.
   */
  show(windowId?: number, shouldFocus: boolean = true): void {
    let targetWindow: BrowserWindow | undefined;
    if (windowId === undefined) {
      // No ID given: fall back to the focused window or the first window
      targetWindow = this.getFocusedWindow() || this.getAllWindows()[0];
      if (targetWindow && !targetWindow.isDestroyed()) {
        console.log(`Showing default window ${targetWindow.id}.`);
      } else {
        console.warn("No window found to show.");
        return;
      }
    } else {
      targetWindow = this.windows.get(windowId);
      if (targetWindow && !targetWindow.isDestroyed()) {
        console.log(`Showing window ${windowId}.`);
      } else {
        console.warn(`Failed to show window ${windowId}, window does not exist or is destroyed.`);
        return;
      }
    }

    targetWindow.show();
    if (shouldFocus) {
      targetWindow.focus(); // Bring to foreground
      activateAppOnMac();
    }
    // Trigger restore logic so the active tab is visible and positioned correctly
    this.handleWindowRestore(targetWindow.id).catch((error) => {
      console.error(`Error handling restore logic after showing window ${targetWindow!.id}:`, error);
    });
  }

  /**
   * Post-restore/show/resize handling logic.
   * @param windowId Window ID.
   */
  private async handleWindowRestore(windowId: number): Promise<void> {
    console.log(`Handling restore/show logic for window ${windowId}.`);
    const window = this.windows.get(windowId);
    if (!window || window.isDestroyed()) {
      console.warn(`Cannot handle restore/show logic for window ${windowId}, window does not exist or is destroyed.`);
      return;
    }
  }

  /**
   * Check whether the window with the given ID is maximized.
   * @param windowId Window ID.
   * @returns true if the window exists, is valid, and is maximized; otherwise false.
   */
  isMaximized(windowId: number): boolean {
    const window = this.windows.get(windowId);
    return window && !window.isDestroyed() ? window.isMaximized() : false;
  }

  /**
   * Check whether the window with the given ID currently has focus.
   * @param windowId Window ID.
   * @returns true if it is the focused window; otherwise false.
   */
  isMainWindowFocused(windowId: number): boolean {
    const focusedWindow = this.getFocusedWindow();
    return focusedWindow ? focusedWindow.id === windowId : false;
  }

  /**
   * Send a message to the main WebContents of all valid windows and the WebContents of all their tabs.
   * @param channel IPC channel name.
   * @param args Message arguments.
   */
  async sendToAllWindows(channel: string, ...args: unknown[]): Promise<void> {
    // Iterate a copy of the Map's values to avoid mutation during iteration
    for (const window of Array.from(this.windows.values())) {
      if (!window.isDestroyed()) {
        // Send to the window's main WebContents
        window.webContents.send(channel, ...args);

        // Send to the WebContents of every tab in the window (async)
        try {
          const tabPresenterInstance = presenter?.tabPresenter as TabPresenter | undefined;
          if (tabPresenterInstance) {
            const tabsData = await tabPresenterInstance.getWindowTabsData(window.id);
            if (tabsData && tabsData.length > 0) {
              for (const tabData of tabsData) {
                const tab = await tabPresenterInstance.getTab(tabData.id);
                if (tab && !tab.webContents.isDestroyed()) {
                  tab.webContents.send(channel, ...args);
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error sending message "${channel}" to tabs of window ${window.id}:`, error);
        }
      } else {
        console.warn(`Skipping sending message "${channel}" to destroyed window ${window.id}.`);
      }
    }

    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      try {
        this.settingsWindow.webContents.send(channel, ...args);
      } catch (error) {
        console.error(`Error sending message "${channel}" to settings window:`, error);
      }
    }

    if (this.floatingChatWindow && this.floatingChatWindow.isShowing()) {
      const floatingWindow = this.floatingChatWindow.getWindow();
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        try {
          floatingWindow.webContents.send(channel, ...args);
        } catch (error) {
          console.error(`Error sending message "${channel}" to floating chat window:`, error);
        }
      }
    }
  }

  /**
   * Send a message to the main WebContents of the window with the given ID and the WebContents of all its tabs.
   * @param windowId Target window ID.
   * @param channel IPC channel name.
   * @param args Message arguments.
   * @returns true if the message was attempted; otherwise false.
   */
  sendToWindow(windowId: number, channel: string, ...args: unknown[]): boolean {
    console.log(`Sending message "${channel}" to window ${windowId}.`);

    if (this.settingsWindow && !this.settingsWindow.isDestroyed() && this.settingsWindow.id === windowId) {
      if (this.tryNavigateSettingsWindowByUrl(channel, args)) {
        return true;
      }

      if (this.shouldQueueSettingsMessage(channel)) {
        this.pendingSettingsMessages.push({ channel, args });
        return true;
      }
      try {
        this.settingsWindow.webContents.send(channel, ...args);
        return true;
      } catch (error) {
        console.error(`Error sending message "${channel}" to settings window ${windowId}:`, error);
        return false;
      }
    }

    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      // Send to the window's main WebContents
      window.webContents.send(channel, ...args);

      // Send to the WebContents of every tab in the window (async)
      const tabPresenterInstance = presenter.tabPresenter as TabPresenter;
      tabPresenterInstance
        .getWindowTabsData(windowId)
        .then((tabsData) => {
          if (tabsData && tabsData.length > 0) {
            tabsData.forEach(async (tabData) => {
              const tab = await tabPresenterInstance.getTab(tabData.id);
              if (tab && !tab.webContents.isDestroyed()) {
                tab.webContents.send(channel, ...args);
              }
            });
          }
        })
        .catch((error) => {
          console.error(`Error sending message "${channel}" to tabs of window ${windowId}:`, error);
        });
      return true;
    } else {
      console.warn(`Failed to send message "${channel}" to window ${windowId}, window does not exist or is destroyed.`);
    }
    return false;
  }

  async sendToDefaultWindow(channel: string, switchToTarget: boolean = false, ...args: unknown[]): Promise<boolean> {
    const targetWindow = this.getFocusedWindow() || this.getAllWindows()[0];
    if (!targetWindow || targetWindow.isDestroyed() || targetWindow.webContents.isDestroyed()) {
      return false;
    }

    targetWindow.webContents.send(channel, ...args);

    if (switchToTarget) {
      targetWindow.show();
      targetWindow.focus();
      activateAppOnMac();
    }

    return true;
  }

  async sendToWebContents(webContentsId: number, channel: string, ...args: unknown[]): Promise<boolean> {
    const target = electronWebContents.fromId(webContentsId);
    if (!target || target.isDestroyed()) {
      return false;
    }

    target.send(channel, ...args);
    return true;
  }

  public async createAppWindow(options?: { initialRoute?: string; x?: number; y?: number }): Promise<number | null> {
    return await this.createManagedWindow({
      initialTab: {
        url:
          options?.initialRoute === "chat" || !options?.initialRoute
            ? "local://chat"
            : `local://${options.initialRoute}`,
      },
      windowType: "chat",
      x: options?.x,
      y: options?.y,
    });
  }

  public async createBrowserWindow(options?: { x?: number; y?: number }): Promise<number | null> {
    return await this.createManagedWindow({
      windowType: "chat",
      x: options?.x,
      y: options?.y,
    });
  }

  async createShellWindow(options?: {
    activateTabId?: number;
    initialTab?: {
      url: string;
      icon?: string;
    };
    windowType?: "chat" | "browser";
    forMovedTab?: boolean;
    x?: number;
    y?: number;
  }): Promise<number | null> {
    console.log("Creating window via deprecated createShellWindow wrapper.");
    return await this.createManagedWindow(options);
  }

  /**
   * Create a new managed window wrapper.
   * @param options Window config options, including the initial tab or an existing tab to activate.
   * @returns The created window ID, or null on failure.
   */
  private async createManagedWindow(options?: {
    activateTabId?: number; // Existing tab ID to associate and activate
    initialTab?: {
      // Options for the new tab to create with the window
      url: string;
      icon?: string;
    };
    windowType?: "chat" | "browser";
    forMovedTab?: boolean; // Force-show when the user drags a tab into a new window (even browser windows)
    x?: number; // Initial X coordinate
    y?: number; // Initial Y coordinate
  }): Promise<number | null> {
    // Pick the icon based on the platform
    const iconFile = nativeImage.createFromPath(process.platform === "win32" ? iconWin : icon);

    // Standalone browser shell has been removed. All managed windows now use chat shell sizing.
    const defaultWidth = 800;
    const defaultHeight = 620;

    // Restore position and size via the window state manager
    const managedWindowState = windowStateManager({
      defaultWidth,
      defaultHeight,
    });

    // Compute the initial position so the window stays fully on-screen
    const initialX =
      options?.x !== undefined
        ? options.x
        : this.validateWindowPosition(
            managedWindowState.x,
            managedWindowState.width,
            managedWindowState.y,
            managedWindowState.height,
          ).x;
    let initialY =
      options?.y !== undefined
        ? options?.y
        : this.validateWindowPosition(
            managedWindowState.x,
            managedWindowState.width,
            managedWindowState.y,
            managedWindowState.height,
          ).y;

    const appWindow = new BrowserWindow({
      width: managedWindowState.width,
      height: managedWindowState.height,
      x: initialX,
      y: initialY,
      show: false, // Hide until ready-to-show to avoid a white flash
      autoHideMenuBar: true, // Hide the menu bar
      icon: iconFile, // Window icon
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined, // macOS-style title bar
      transparent: process.platform === "darwin", // Transparent title bar on macOS
      vibrancy: process.platform === "darwin" ? "under-window" : undefined, // macOS vibrancy effect
      visualEffectState: process.platform === "darwin" ? "followWindow" : undefined,
      backgroundMaterial: process.platform === "win32" ? "mica" : undefined, // Windows 11 material effect
      backgroundColor: "#00ffffff", // Transparent background color
      maximizable: true, // Allow maximizing
      frame: process.platform === "darwin", // Frameless on macOS
      hasShadow: true, // macOS shadow
      trafficLightPosition: process.platform === "darwin" ? { x: 12, y: 10 } : undefined, // macOS traffic light position
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, "../preload/index.mjs"), // Preload script path
        sandbox: false, // Disable sandbox so preload can access Node.js APIs
        devTools: is.dev, // Enable DevTools in dev mode
      },
      roundedCorners: true, // Windows 11 rounded corners
    });

    if (!appWindow) {
      console.error("Failed to create application window.");
      return null;
    }

    const windowId = appWindow.id;
    const appWebContentsId = appWindow.webContents.id;
    this.windows.set(windowId, appWindow); // Store the window instance in the Map

    managedWindowState.manage(appWindow); // Start managing window state

    // electron-window-state only flushes to disk on the window's 'closed'
    // event. Under hide-to-tray the main window is hidden (not destroyed), so
    // 'closed' — and therefore the disk write — only fires on a full app quit,
    // meaning a crash/kill loses the last bounds. Flush explicitly on hide and
    // (debounced) on resize/move so size/position persist reliably.
    let boundsFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushWindowState = () => {
      if (!appWindow.isDestroyed()) {
        try {
          managedWindowState.saveState(appWindow);
        } catch {
          // ignore write errors
        }
      }
    };
    appWindow.on("resize", () => {
      if (boundsFlushTimer) clearTimeout(boundsFlushTimer);
      boundsFlushTimer = setTimeout(flushWindowState, 500);
    });
    appWindow.on("move", () => {
      if (boundsFlushTimer) clearTimeout(boundsFlushTimer);
      boundsFlushTimer = setTimeout(flushWindowState, 500);
    });
    appWindow.on("hide", flushWindowState);
    this.setupManagedWindowOpenHandler(appWindow);
    appWindow.webContents.on("destroyed", () => {
      releasePresenterCallErrorStateForWebContents(appWebContentsId);
    });

    // Apply content protection settings
    const contentProtectionEnabled = this.configPresenter.getContentProtectionEnabled();
    this.updateContentProtection(appWindow, contentProtectionEnabled);

    // Open DevTools automatically in dev mode
    if (is.dev) {
      appWindow.webContents.openDevTools();
    }

    // --- Window event listeners ---

    // Show the window once it is ready
    appWindow.on("ready-to-show", () => {
      console.log(`Window ${windowId} is ready to show.`);
      if (!appWindow.isDestroyed()) {
        appWindow.show();
        appWindow.focus();
        activateAppOnMac();
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_CREATED, {
          windowId,
          isMainWindow: windowId === this.mainWindowId,
        });
      } else {
        console.warn(`Window ${windowId} was destroyed before ready-to-show.`);
      }
    });

    // Window gained focus
    appWindow.on("focus", () => {
      console.log(`Window ${windowId} gained focus.`);
      this.focusedWindowId = windowId;
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_FOCUSED, windowId);
      if (!appWindow.isDestroyed()) {
        appWindow.webContents.send("window-focused", windowId);
      }
    });

    // Window lost focus
    appWindow.on("blur", () => {
      console.log(`Window ${windowId} lost focus.`);
      if (this.focusedWindowId === windowId) {
        this.focusedWindowId = null; // Only clear when the blurred window is the recorded focus window
      }
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_BLURRED, windowId);
      if (!appWindow.isDestroyed()) {
        appWindow.webContents.send("window-blurred", windowId);
      }
    });

    // Window maximized
    appWindow.on("maximize", () => {
      console.log(`Window ${windowId} maximized.`);
      if (!appWindow.isDestroyed()) {
        appWindow.webContents.send(WINDOW_EVENTS.WINDOW_MAXIMIZED);
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_MAXIMIZED, windowId);
        // Trigger restore logic to update tab bounds
        this.handleWindowRestore(windowId).catch((error) => {
          console.error(`Error handling restore logic after maximizing window ${windowId}:`, error);
        });
      }
    });

    // Window unmaximized
    appWindow.on("unmaximize", () => {
      console.log(`Window ${windowId} unmaximized.`);
      if (!appWindow.isDestroyed()) {
        appWindow.webContents.send(WINDOW_EVENTS.WINDOW_UNMAXIMIZED);
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_UNMAXIMIZED, windowId);
        // Trigger restore logic to update tab bounds
        this.handleWindowRestore(windowId).catch((error) => {
          console.error(`Error handling restore logic after unmaximizing window ${windowId}:`, error);
        });
      }
    });

    // Window restored from minimized (or shown explicitly via show())
    const handleRestore = async () => {
      console.log(`Window ${windowId} restored.`);
      this.handleWindowRestore(windowId).catch((error) => {
        console.error(`Error handling restore logic for window ${windowId}:`, error);
      });
      appWindow.webContents.send(WINDOW_EVENTS.WINDOW_UNMAXIMIZED);
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_RESTORED, windowId);
    };
    appWindow.on("restore", handleRestore);

    // Window entered fullscreen
    appWindow.on("enter-full-screen", () => {
      console.log(`Window ${windowId} entered fullscreen.`);
      if (!appWindow.isDestroyed()) {
        appWindow.webContents.send(WINDOW_EVENTS.WINDOW_ENTER_FULL_SCREEN);
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_ENTER_FULL_SCREEN, windowId);
        // Trigger restore logic to update tab bounds
        this.handleWindowRestore(windowId).catch((error) => {
          console.error(`Error handling restore logic after entering fullscreen for window ${windowId}:`, error);
        });
      }
    });

    // Window left fullscreen
    appWindow.on("leave-full-screen", () => {
      console.log(`Window ${windowId} left fullscreen.`);
      if (!appWindow.isDestroyed()) {
        appWindow.webContents.send(WINDOW_EVENTS.WINDOW_LEAVE_FULL_SCREEN);
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_LEAVE_FULL_SCREEN, windowId);
        // Trigger restore logic to update tab bounds
        this.handleWindowRestore(windowId).catch((error) => {
          console.error(`Error handling restore logic after leaving fullscreen for window ${windowId}:`, error);
        });
      }
    });

    // Window resized: notify TabPresenter to update all view bounds
    appWindow.on("resize", () => {
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_RESIZE, windowId);
    });

    // 'close' event: the user tried to close the window (clicked the close button, etc.).
    // This handler decides whether to hide the window or let it close/destroy.
    appWindow.on("close", (event) => {
      console.log(`Window ${windowId} close event. isQuitting: ${this.isQuitting}, Platform: ${process.platform}.`);

      // If the app is not in the process of quitting...
      if (!this.isQuitting) {
        // Hide-to-tray logic:
        // 1. For other windows, close directly
        // 2. For the main window, check the config to decide
        // shouldPreventDefault: true hides, false closes
        const shouldQuitOnClose = this.configPresenter.getCloseToQuit();
        const shouldPreventDefault = windowId === this.mainWindowId && !shouldQuitOnClose;

        if (shouldPreventDefault) {
          console.log(`Window ${windowId}: Preventing default close behavior, hiding instead.`);
          event.preventDefault(); // Prevent the default window close behavior

          // Handle the black screen issue when hiding a fullscreen window (same as hide())
          if (appWindow.isFullScreen()) {
            console.log(`Window ${windowId} is fullscreen, exiting fullscreen before hiding (close event).`);
            appWindow.once("leave-full-screen", () => {
              console.log(`Window ${windowId} left fullscreen, proceeding with hide (close event).`);
              if (!appWindow.isDestroyed()) {
                appWindow.hide();
              } else {
                console.warn(`Window ${windowId} was destroyed after leaving fullscreen, cannot hide (close event).`);
              }
            });
            appWindow.setFullScreen(false);
          } else {
            console.log(`Window ${windowId} is not fullscreen, hiding directly (close event).`);
            appWindow.hide();
          }
        } else {
          // Allow the default close behavior. This triggers the 'closed' event.
          console.log(
            `Window ${windowId}: Allowing default close behavior (app is quitting or macOS last window configured to quit).`,
          );
        }
      } else {
        // When isQuitting is true the app is quitting intentionally: allow the window to close normally
        console.log(`Window ${windowId}: isQuitting is true, allowing default close behavior.`);
      }
    });

    // 'closed' event: fired when the window is actually closed and destroyed (after 'close', if not prevented)
    appWindow.on("closed", () => {
      console.log(
        `Window ${windowId} closed event triggered. isQuitting: ${this.isQuitting}, Map size BEFORE delete: ${this.windows.size}`,
      );
      const windowIdBeingClosed = windowId; // Capture the ID

      // Remove the restore listener to avoid leaks (clean up other listeners as needed)
      appWindow.removeListener("restore", handleRestore);

      this.windows.delete(windowIdBeingClosed); // Remove from the Map
      managedWindowState.unmanage(); // Stop managing window state
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_CLOSED, windowIdBeingClosed);
      console.log(`Window ${windowIdBeingClosed} closed event handled. Map size AFTER delete: ${this.windows.size}`);

      // On non-macOS platforms, warn if the last window was closed while the app is not quitting.
      // Under the hide-to-tray logic, the 'closed' event should only fire when isQuitting is true.
      if (this.windows.size === 0 && process.platform !== "darwin") {
        console.log(`Last window closed on non-macOS platform.`);
        if (!this.isQuitting) {
          console.warn(
            `Warning: Last window on non-macOS platform triggered closed event, but app is not marked as quitting. This might indicate window destruction instead of hiding.`,
          );
        }
      }
    });

    // --- Load the UI from the local daemon (served web build) ---
    // The React UI lives in the standalone @argos/ui package and is served
    // over HTTP by the daemon sidecar. The desktop shell is just an
    // Electron window pointing at that URL (CodeNomad-style).
    void this.loadUiUrl(appWindow, "/#/chat");

    // DevTools no longer opens automatically; open it via the menu or a shortcut
    // In dev it auto-opens for easier debugging
    if (is.dev) {
      appWindow.webContents.openDevTools({ mode: "detach" });
    }

    console.log(`Window ${windowId} created successfully.`);

    if (this.mainWindowId == null) {
      this.mainWindowId = windowId; // First window becomes the main window
    }
    return windowId; // Return the new window's ID
  }

  /**
   * Load a UI route. In development this hits the @argos/ui Vite dev
   * server; in packaged builds it loads from the local daemon (which
   * serves the @argos/ui static build). Waits for the daemon port when
   * packaged so the window navigates once the backend is up.
   */
  private async loadUiUrl(window: BrowserWindow, route: string): Promise<void> {
    if (getDevServerBase()) {
      const url = resolveUiUrl(route);
      console.log(`[window] Loading UI route from dev server: ${url}`);
      try {
        await window.loadURL(url);
      } catch (error) {
        console.error(`[window] Failed to load UI route ${url}:`, error);
      }
      return;
    }

    const port = await waitForDaemonPort(30000);
    if (getSidecarHandle() && !port) {
      console.warn("[window] Daemon port unavailable after timeout");
    }
    const url = resolveUiUrl(route);
    console.log(`[window] Loading UI route from daemon: ${url}`);
    try {
      await window.loadURL(url);
    } catch (error) {
      console.error(`[window] Failed to load UI route ${url}:`, error);
    }
  }

  /**
   * Update content protection settings for the given window.
   * @param window BrowserWindow instance.
   * @param enabled Whether to enable content protection.
   */
  private updateContentProtection(window: BrowserWindow, enabled: boolean): void {
    if (window.isDestroyed()) {
      console.warn(`Attempted to update content protection settings on a destroyed window.`);
      return;
    }
    console.log(`Updating content protection for window ${window.id}: ${enabled}`);

    // setContentProtection blocks screenshots/screen recording
    window.setContentProtection(enabled);

    // setBackgroundThrottling throttles the frame rate of inactive windows.
    // Disable throttling when content protection is on so protection holds even when inactive.
    window.webContents.setBackgroundThrottling(!enabled); // Disable throttling when protection is on
    window.webContents.setFrameRate(60); // Set the frame rate
    window.setBackgroundColor("#00000000"); // Set a transparent background color

    // macOS-specific hiding (used for content protection)
    if (process.platform === "darwin") {
      window.setHiddenInMissionControl(enabled); // Hide from Mission Control
      window.setSkipTaskbar(enabled); // Hide from the Dock and Mission Control switcher
    }
  }

  /**
   * Get the currently focused BrowserWindow (reported by Electron and verified against the internal Map).
   * @returns The focused BrowserWindow, or undefined if there is no focus or the window is invalid.
   */
  getFocusedWindow(): BrowserWindow | undefined {
    const electronFocusedWindow = BrowserWindow.getFocusedWindow();

    if (electronFocusedWindow) {
      const windowId = electronFocusedWindow.id;
      console.log(this.windows);
      const ourWindow = this.windows.get(windowId);

      // Verify the Electron-reported window is managed by us and still valid
      if (ourWindow && !ourWindow.isDestroyed()) {
        this.focusedWindowId = windowId; // Update the internal record
        return ourWindow;
      } else if (this.settingsWindow) {
        if (windowId === this.settingsWindow.id) {
          return this.settingsWindow;
        } else {
          return;
        }
      } else {
        // The Electron-reported window is not in the Map or is destroyed
        console.warn(`Electron reported window ${windowId} focused, but it is not managed or is destroyed.`);
        this.focusedWindowId = null;
        return undefined;
      }
    } else {
      this.focusedWindowId = null; // Clear the internal record
      return undefined;
    }
  }

  /**
   * Get all valid (non-destroyed) BrowserWindow instances.
   * @returns Array of BrowserWindow instances.
   */
  getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values()).filter((window) => !window.isDestroyed());
  }

  /**
   * Get the active tab ID of the given window.
   * @param windowId Window ID.
   * @returns The active tab ID, or undefined if the window is invalid or has no active tab.
   */
  async getActiveTabId(windowId: number): Promise<number | undefined> {
    const window = this.windows.get(windowId);
    if (!window || window.isDestroyed()) {
      console.warn(`Cannot get active tab ID for window ${windowId}, window does not exist or is destroyed.`);
      return undefined;
    }
    const tabPresenterInstance = presenter.tabPresenter as TabPresenter;
    const tabsData = await tabPresenterInstance.getWindowTabsData(windowId);
    const activeTab = tabsData.find((tab) => tab.isActive);
    return activeTab?.id;
  }

  /**
   * Send an event to the active tab of the given window.
   * @param windowId Target window ID.
   * @param channel Event channel.
   * @param args Event arguments.
   * @returns true if the event was sent to a valid active tab; otherwise false.
   */
  async sendToActiveTab(windowId: number, channel: string, ...args: unknown[]): Promise<boolean> {
    console.log(`Sending event "${channel}" to active tab of window ${windowId}.`);
    const tabPresenterInstance = presenter.tabPresenter as TabPresenter;
    const activeTabId = await tabPresenterInstance.getActiveTabId(windowId);
    if (activeTabId) {
      const tab = await tabPresenterInstance.getTab(activeTabId);
      if (tab && !tab.webContents.isDestroyed()) {
        tab.webContents.send(channel, ...args);
        console.log(`  - Event sent to tab ${activeTabId}.`);
        return true;
      } else {
        console.warn(`  - Active tab ${activeTabId} does not exist or is destroyed, cannot send event.`);
      }
    } else {
      // Fallback: chat windows have no tabs, send directly to BrowserWindow webContents
      const targetWindow = BrowserWindow.fromId(windowId);
      if (targetWindow && !targetWindow.isDestroyed() && !targetWindow.webContents.isDestroyed()) {
        targetWindow.webContents.send(channel, ...args);
        console.log(`  - No active tab, sent event directly to window ${windowId} webContents.`);
        return true;
      }
      console.warn(`No active tab found in window ${windowId}, cannot send event "${channel}".`);
    }
    return false;
  }

  /**
   * Send a message to the "default" tab.
   * Priority: focused window's active tab > first window's active tab > first window's first tab.
   * @param channel Message channel.
   * @param switchToTarget Whether to switch to the target window/tab after sending. Defaults to false.
   * @param args Message arguments.
   * @returns true if the message was sent; otherwise false.
   */
  async sendToDefaultTab(channel: string, switchToTarget: boolean = false, ...args: unknown[]): Promise<boolean> {
    console.log(`Sending message "${channel}" to default tab. Switch to target: ${switchToTarget}.`);
    try {
      // Prefer the currently focused window
      let targetWindow = this.getFocusedWindow();
      let windowId: number | undefined;

      if (targetWindow) {
        windowId = targetWindow.id;
        console.log(`  - Using focused window ${windowId}`);
      } else {
        // With no focused window, use the first valid window
        const windows = this.getAllWindows();
        if (windows.length === 0) {
          console.warn("No window found to send message to.");
          return false;
        }
        targetWindow = windows[0];
        windowId = targetWindow.id;
        console.log(`  - No focused window, using first window ${windowId}`);
      }

      // Get all tabs of the target window
      const tabPresenterInstance = presenter.tabPresenter as TabPresenter;
      const tabsData = await tabPresenterInstance.getWindowTabsData(windowId);
      if (tabsData.length === 0) {
        // Fallback: chat windows have no tabs, send directly to BrowserWindow webContents
        if (targetWindow && !targetWindow.isDestroyed() && !targetWindow.webContents.isDestroyed()) {
          targetWindow.webContents.send(channel, ...args);
          console.log(`  - Window ${windowId} has no tabs, sent message directly to window webContents.`);
          if (switchToTarget) {
            targetWindow.show();
            targetWindow.focus();
          }
          return true;
        }
        console.warn(`Window ${windowId} has no tabs and window is unavailable.`);
        return false;
      }

      // Get the active tab, falling back to the first tab
      const targetTabData = tabsData.find((tab) => tab.isActive) || tabsData[0];
      const targetTab = await tabPresenterInstance.getTab(targetTabData.id);

      if (targetTab && !targetTab.webContents.isDestroyed()) {
        // Send the message to the target tab
        targetTab.webContents.send(channel, ...args);
        console.log(`  - Message sent to tab ${targetTabData.id} in window ${windowId}.`);

        // If requested, switch to the target window and tab
        if (switchToTarget) {
          try {
            // Activate the target window
            if (targetWindow && !targetWindow.isDestroyed()) {
              console.log(`  - Switching to window ${windowId}`);
              targetWindow.show(); // Ensure the window is visible
              targetWindow.focus(); // Bring the window to the foreground
            }

            // Switch if the target tab is not the active tab
            if (!targetTabData.isActive) {
              console.log(`  - Switching to tab ${targetTabData.id}`);
              await tabPresenterInstance.switchTab(targetTabData.id);
            }
            // switchTab already calls bringViewToFront to set focus; no extra call needed
          } catch (error) {
            console.error("Error switching to target window/tab:", error);
            // Continue, since the message was sent successfully
          }
        }

        return true; // Message sent successfully
      } else {
        console.warn(`Target tab ${targetTabData.id} in window ${windowId} is unavailable or destroyed.`);
        return false; // Target tab invalid
      }
    } catch (error) {
      console.error("Error sending message to default tab:", error);
      return false; // Error during the process
    }
  }

  public async createFloatingChatWindow(): Promise<void> {
    if (this.floatingChatWindow) {
      console.log("FloatingChatWindow already exists");
      return;
    }

    try {
      this.floatingChatWindow = new FloatingChatWindow();
      await this.floatingChatWindow.create();
      console.log("FloatingChatWindow created successfully");
    } catch (error) {
      console.error("Failed to create FloatingChatWindow:", error);
      this.floatingChatWindow = null;
      throw error;
    }
  }

  public async showFloatingChatWindow(floatingButtonPosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<void> {
    if (!this.floatingChatWindow) {
      await this.createFloatingChatWindow();
    }

    if (this.floatingChatWindow) {
      this.floatingChatWindow.show(floatingButtonPosition);
      console.log("FloatingChatWindow shown");
    }
  }

  public hideFloatingChatWindow(): void {
    if (this.floatingChatWindow) {
      this.floatingChatWindow.hide();
      console.log("FloatingChatWindow hidden");
    }
  }

  public async toggleFloatingChatWindow(floatingButtonPosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<void> {
    if (!this.floatingChatWindow) {
      await this.createFloatingChatWindow();
    }

    if (this.floatingChatWindow) {
      this.floatingChatWindow.toggle(floatingButtonPosition);
      console.log("FloatingChatWindow toggled");
    }
  }

  public destroyFloatingChatWindow(): void {
    if (this.floatingChatWindow) {
      this.floatingChatWindow.destroy();
      this.floatingChatWindow = null;
      console.log("FloatingChatWindow destroyed");
    }
  }

  public isFloatingChatWindowVisible(): boolean {
    return this.floatingChatWindow?.isShowing() || false;
  }

  public getFloatingChatWindow(): FloatingChatWindow | null {
    return this.floatingChatWindow;
  }

  /**
   * @deprecated Use navigateToSettings() instead. Settings is now a route in the main window.
   * Create or show Settings Window (singleton pattern)
   */
  public async createSettingsWindow(navigation?: SettingsNavigationPayload): Promise<number | null> {
    console.warn("createSettingsWindow is deprecated. Use navigateToSettings() instead.");
    return this.navigateToSettings(navigation);
  }

  /**
   * Open or focus Settings Window (replaces openOrFocusSettingsTab)
   */
  public async openOrFocusSettingsWindow(): Promise<void> {
    await this.navigateToSettings();
  }

  public getSettingsWindowId(): number | null {
    return this.mainWindowId;
  }

  public focusMainWindow(): boolean {
    if (this.mainWindowId == null) {
      return false;
    }

    const mainWindow = BrowserWindow.fromId(this.mainWindowId);
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
      return false;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
    activateAppOnMac();
    return true;
  }

  public setPendingSettingsProviderInstall(preview: ProviderInstallPreview): void {
    this.pendingSettingsProviderInstalls.push(this.clonePendingSettingsProviderInstall(preview));
  }

  public consumePendingSettingsProviderInstall(): ProviderInstallPreview | null {
    const preview = this.pendingSettingsProviderInstalls.shift();
    if (!preview) {
      return null;
    }

    return this.clonePendingSettingsProviderInstall(preview);
  }

  /**
   * Close Settings Window if it exists
   */
  public closeSettingsWindow(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      console.log("Closing settings window.");
      const windowId = this.settingsWindow.id;
      this.windows.delete(windowId);
      this.settingsWindow.close();
    }

    this.resetSettingsWindowState(true);
  }

  /**
   * Check if Settings Window is open
   */
  public isSettingsWindowOpen(): boolean {
    return this.settingsWindow !== null && !this.settingsWindow.isDestroyed();
  }

  private shouldQueueSettingsMessage(channel: string): boolean {
    return !this.settingsWindowReady && (channel.startsWith("settings:") || channel === DEEPLINK_EVENTS.MCP_INSTALL);
  }

  private handleSettingsWindowReady(senderWebContentsId: number): void {
    if (
      !this.settingsWindow ||
      this.settingsWindow.isDestroyed() ||
      this.settingsWindow.webContents.isDestroyed() ||
      this.settingsWindow.webContents.id !== senderWebContentsId
    ) {
      return;
    }

    this.settingsWindowReady = true;
    console.info(`[Startup][Settings][Main] SETTINGS_EVENTS.READY windowId=${this.settingsWindow.id}`);
    this.startupWorkloadCoordinator?.replayTarget("settings");
    this.flushPendingSettingsMessages();
  }

  private handleSettingsWindowNavigationStart(windowId: number, isMainFrame: boolean, isSameDocument: boolean): void {
    if (!isMainFrame || isSameDocument || this.settingsWindow?.id !== windowId) {
      return;
    }

    this.settingsWindowReady = false;
  }

  private tryNavigateSettingsWindowByUrl(channel: string, args: unknown[]): boolean {
    if (
      channel !== SETTINGS_EVENTS.NAVIGATE ||
      !this.settingsWindow ||
      this.settingsWindow.isDestroyed() ||
      this.settingsWindow.webContents.isDestroyed()
    ) {
      return false;
    }

    const navigation = this.toSettingsNavigationPayload(args[0]);
    if (!navigation || navigation.routeName !== "settings-provider") {
      return false;
    }

    const targetUrl = this.getSettingsWindowTargetUrl(navigation);
    const currentUrl = this.settingsWindow.webContents.getURL();

    if (currentUrl === targetUrl && this.settingsWindowReady) {
      return false;
    }

    this.pendingSettingsMessages.push({ channel, args: [navigation] });
    console.log(`Reloading settings window to target URL: ${targetUrl}`);
    console.info("[Startup][Settings][Main] loadURL start", targetUrl);
    this.handleSettingsWindowNavigationStart(this.settingsWindow.id, true, false);
    void this.settingsWindow.webContents
      .loadURL(targetUrl)
      .then(() => {
        if (!this.settingsWindow || this.settingsWindow.isDestroyed()) {
          return;
        }

        console.info(`[Startup][Settings][Main] loadURL end windowId=${this.settingsWindow.id} target=${targetUrl}`);
      })
      .catch((error) => {
        console.error(`Failed to reload settings window for navigation: ${targetUrl}`, error);
      });
    return true;
  }

  private toSettingsNavigationPayload(raw: unknown): SettingsNavigationPayload | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const candidate = raw as {
      routeName?: unknown;
      params?: unknown;
      section?: unknown;
    };

    if (typeof candidate.routeName !== "string") {
      return null;
    }

    const params =
      candidate.params && typeof candidate.params === "object"
        ? Object.entries(candidate.params as Record<string, unknown>).reduce<Record<string, string>>(
            (acc, [key, value]) => {
              if (typeof value === "string" && value.trim().length > 0) {
                acc[key] = value;
              }
              return acc;
            },
            {},
          )
        : undefined;

    return {
      routeName: candidate.routeName as SettingsNavigationPayload["routeName"],
      params: params && Object.keys(params).length > 0 ? params : undefined,
      section: typeof candidate.section === "string" ? candidate.section : undefined,
    };
  }

  private getSettingsWindowTargetUrl(navigation?: SettingsNavigationPayload): string {
    const initialNavigationPath = navigation
      ? resolveSettingsNavigationPath(navigation.routeName, navigation.params, process.platform, process.arch)
      : null;

    // dev → @argos/ui Vite dev server; packaged → local daemon (served web build).
    const settingsUrl = resolveUiUrl("/settings/index.html");
    return initialNavigationPath ? `${settingsUrl}#${initialNavigationPath}` : settingsUrl;
  }

  private flushPendingSettingsMessages(): void {
    if (
      !this.settingsWindow ||
      this.settingsWindow.isDestroyed() ||
      this.settingsWindow.webContents.isDestroyed() ||
      !this.settingsWindowReady ||
      this.pendingSettingsMessages.length === 0
    ) {
      return;
    }

    const pending = [...this.pendingSettingsMessages];
    this.pendingSettingsMessages = [];
    pending.forEach(({ channel, args }) => {
      try {
        this.settingsWindow?.webContents.send(channel, ...args);
      } catch (error) {
        console.error(`Error flushing settings message "${channel}":`, error);
      }
    });
  }

  private clonePendingSettingsProviderInstall(preview: ProviderInstallPreview): ProviderInstallPreview {
    return { ...preview };
  }

  private resetSettingsWindowState(clearQueue = false): void {
    this.settingsWindowReady = false;
    if (clearQueue) {
      this.pendingSettingsMessages = [];
      this.clearPendingSettingsProviderInstalls();
    }
  }

  private clearPendingSettingsProviderInstalls(): void {
    this.pendingSettingsProviderInstalls.forEach((preview) => {
      preview.apiKey = "";
    });
    this.pendingSettingsProviderInstalls = [];
  }

  public isApplicationQuitting(): boolean {
    return this.isQuitting;
  }

  public setApplicationQuitting(isQuitting: boolean): void {
    this.isQuitting = isQuitting;
  }

  private validateWindowPosition(x: number, width: number, y: number, height: number): { x: number; y: number } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    const isXValid = x >= workArea.x && x + width <= workArea.x + workArea.width;
    const isYValid = y >= workArea.y && y + height <= workArea.y + workArea.height;
    if (!isXValid || !isYValid) {
      console.log(
        `Window position out of bounds (x: ${x}, y: ${y}, width: ${width}, height: ${height}), centering window`,
      );
      return {
        x: workArea.x + Math.max(0, (workArea.width - width) / 2),
        y: workArea.y + Math.max(0, (workArea.height - height) / 2),
      };
    }
    return { x, y };
  }
}
