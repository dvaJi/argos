/**
 * SplashWindowManager - Manages splash screen display during application initialization
 */

import { BrowserWindow, nativeImage } from "electron";
import { eventBus } from "../../eventbus";
import { LIFECYCLE_EVENTS, WINDOW_EVENTS } from "#/events";
import { ISplashWindowManager } from "@argos/shared/presenter";
import { is } from "@electron-toolkit/utils";
import { getDaemonUiBase, getDevServerBase } from "#/lib/daemonUi";
import icon from "../../../../resources/icon.png?asset"; // App icon (macOS/Linux)
import iconWin from "../../../../resources/icon.ico?asset"; // App icon (Windows)
import { LifecyclePhase } from "@argos/shared/lifecycle";
import { ErrorOccurredEventData, HookExecutedEventData, HookFailedEventData, ProgressUpdatedEventData } from "./types";
import { releasePresenterCallErrorStateForWebContents } from "../presenterCallErrorHandler";
import { activateAppOnMac } from "#/lib/activateApp";
import { getPreloadPath } from "#/lib/paths";

type SplashActivityStatus = "running" | "completed" | "failed";

interface SplashActivityItem {
  key: string;
  name: string;
  status: SplashActivityStatus;
  updatedAt: number;
}

interface SplashUpdatePayload {
  activities: Array<Pick<SplashActivityItem, "key" | "name" | "status">>;
}

type WindowCreatedPayload =
  | number
  | {
      windowId?: number;
      isMainWindow?: boolean;
      windowType?: string;
    };

const MAX_SPLASH_ACTIVITIES = 3;
const SPLASH_SHOW_DELAY_MS = 200;

export class SplashWindowManager implements ISplashWindowManager {
  private splashWindow: BrowserWindow | null = null;
  private activities = new Map<string, SplashActivityItem>();
  private splashReadyToShow = false;
  private splashDidFinishLoad = false;
  private splashShowDelayElapsed = false;
  private suppressSplashShow = false;
  private forceShowWhenLoaded = false;
  private splashLoadCanceled = false;
  private splashShowDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onHookExecuted = (data: HookExecutedEventData) => {
    if (!this.isStartupPhase(data.phase)) {
      return;
    }

    this.upsertActivity(data.phase, data.name, "running");
  };
  private readonly onHookCompleted = (data: HookExecutedEventData) => {
    if (!this.isStartupPhase(data.phase)) {
      return;
    }

    this.upsertActivity(data.phase, data.name, "completed");
  };
  private readonly onHookFailed = (data: HookFailedEventData) => {
    if (!this.isStartupPhase(data.phase)) {
      return;
    }

    this.upsertActivity(data.phase, data.name, "failed");
  };
  private readonly onErrorOccurred = (data: ErrorOccurredEventData) => {
    if (!this.isStartupPhase(data.phase)) {
      return;
    }

    this.activities.set(`error:${data.phase}`, {
      key: `error:${data.phase}`,
      name: "startup-error",
      status: "failed",
      updatedAt: Date.now(),
    });
    this.pruneActivities();
    this.emitState();
  };
  private readonly onMainWindowCreated = (payload?: WindowCreatedPayload) => {
    if (!this.shouldSuppressForWindowCreated(payload) || this.isVisible()) {
      return;
    }

    this.suppressSplashShow = true;
    this.clearSplashShowDelayTimer();
    eventBus.off(WINDOW_EVENTS.WINDOW_CREATED, this.onMainWindowCreated);
    this.closeHiddenSplashWindow();
  };

  constructor() {
    this.setupLifecycleListeners();
  }

  /**
   * Create and display the splash window
   */
  async create(): Promise<void> {
    if (this.splashWindow) {
      return;
    }

    this.splashReadyToShow = false;
    this.splashDidFinishLoad = false;
    this.splashShowDelayElapsed = false;
    this.suppressSplashShow = false;
    this.forceShowWhenLoaded = false;
    this.splashLoadCanceled = false;
    this.clearSplashShowDelayTimer();
    eventBus.on(WINDOW_EVENTS.WINDOW_CREATED, this.onMainWindowCreated);

    this.splashShowDelayTimer = setTimeout(() => {
      this.splashShowDelayElapsed = true;
      this.maybeShowSplash();
    }, SPLASH_SHOW_DELAY_MS);

    const iconFile = nativeImage.createFromPath(process.platform === "win32" ? iconWin : icon);

    try {
      this.splashWindow = new BrowserWindow({
        width: 420,
        height: 280,
        icon: iconFile,
        resizable: false,
        movable: false,
        frame: false,
        alwaysOnTop: true,
        center: true,
        show: false, // Hide initially; wait for ready-to-show to avoid a white flash
        autoHideMenuBar: true,
        skipTaskbar: true,
        backgroundColor: "#0B0E14",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: getPreloadPath("splash.mjs"),
          sandbox: false,
          devTools: is.dev,
        },
      });
      const splashWebContentsId = this.splashWindow.webContents.id;

      this.splashWindow.on("ready-to-show", () => {
        this.splashReadyToShow = true;
        this.maybeShowSplash();
      });

      this.splashWindow.webContents.on("destroyed", () => {
        releasePresenterCallErrorStateForWebContents(splashWebContentsId);
      });

      this.splashWindow.webContents.on("did-finish-load", () => {
        this.markSplashLoaded();
      });

      void this.loadSplashRenderer().catch((error) => {
        if (!this.shouldContinueSplashLoad()) {
          return;
        }
        console.error("Failed to load splash window:", error);
        this.markSplashLoaded();
      });

      // Handle window closed event6
      this.splashWindow.on("closed", () => {
        this.clearSplashShowDelayTimer();
        this.splashWindow = null;
        this.splashDidFinishLoad = false;
        this.forceShowWhenLoaded = false;
        this.splashLoadCanceled = true;
      });

      if (this.suppressSplashShow) {
        this.closeHiddenSplashWindow();
      }
    } catch (error) {
      eventBus.off(WINDOW_EVENTS.WINDOW_CREATED, this.onMainWindowCreated);
      this.clearSplashShowDelayTimer();
      console.error("Failed to create splash window:", error);
      throw error;
    }
  }

  /**
   * Update progress based on lifecycle phase
   */
  updateProgress(phase: LifecyclePhase, progress: number): void {
    if (!this.splashWindow || this.splashWindow.isDestroyed()) {
      return;
    }

    const phaseMessages = {
      [LifecyclePhase.INIT]: "Initializing application...",
      [LifecyclePhase.BEFORE_START]: "Preparing startup...",
      [LifecyclePhase.READY]: "Loading components...",
      [LifecyclePhase.AFTER_START]: "Finalizing startup...",
    };

    const message = phaseMessages[phase] || "Loading...";
    const clamped = Math.max(0, Math.min(100, progress));

    // Emit progress event to both main and renderer processes
    eventBus.sendToMain(LIFECYCLE_EVENTS.PROGRESS_UPDATED, {
      phase,
      progress: clamped,
      message,
    } as ProgressUpdatedEventData);
  }

  /**
   * Close the splash window
   */
  async close(): Promise<void> {
    eventBus.off(LIFECYCLE_EVENTS.HOOK_EXECUTED, this.onHookExecuted);
    eventBus.off(LIFECYCLE_EVENTS.HOOK_COMPLETED, this.onHookCompleted);
    eventBus.off(LIFECYCLE_EVENTS.HOOK_FAILED, this.onHookFailed);
    eventBus.off(LIFECYCLE_EVENTS.ERROR_OCCURRED, this.onErrorOccurred);
    eventBus.off(WINDOW_EVENTS.WINDOW_CREATED, this.onMainWindowCreated);

    this.activities.clear();
    this.forceShowWhenLoaded = false;
    this.splashLoadCanceled = true;
    this.emitState();
    this.clearSplashShowDelayTimer();

    if (!this.splashWindow || this.splashWindow.isDestroyed()) {
      return;
    }

    try {
      if (this.splashWindow.isVisible()) {
        // Add a small delay for smooth transition when the splash is actually visible.
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      this.splashWindow.close();
      this.splashWindow = null;
    } catch (error) {
      console.error("Failed to close splash window:", error);
    }
  }

  /**
   * Check if splash window is currently visible
   */
  isVisible(): boolean {
    return this.splashWindow !== null && !this.splashWindow.isDestroyed() && this.splashWindow.isVisible();
  }

  private setupLifecycleListeners(): void {
    eventBus.on(LIFECYCLE_EVENTS.HOOK_EXECUTED, this.onHookExecuted);
    eventBus.on(LIFECYCLE_EVENTS.HOOK_COMPLETED, this.onHookCompleted);
    eventBus.on(LIFECYCLE_EVENTS.HOOK_FAILED, this.onHookFailed);
    eventBus.on(LIFECYCLE_EVENTS.ERROR_OCCURRED, this.onErrorOccurred);
  }

  private isStartupPhase(phase: LifecyclePhase | null): phase is LifecyclePhase {
    return phase !== null && phase !== LifecyclePhase.BEFORE_QUIT;
  }

  private upsertActivity(phase: LifecyclePhase, hookName: string, status: SplashActivityStatus): void {
    const key = `${phase}:${hookName}`;

    this.activities.set(key, {
      key,
      name: hookName,
      status,
      updatedAt: Date.now(),
    });

    this.pruneActivities();
    this.emitState();
  }

  private pruneActivities(): void {
    const sorted = Array.from(this.activities.values()).sort((a, b) => b.updatedAt - a.updatedAt);

    this.activities = new Map(sorted.slice(0, MAX_SPLASH_ACTIVITIES).map((activity) => [activity.key, activity]));
  }

  private emitState(): void {
    const splashWindow = this.splashWindow;
    if (!splashWindow || splashWindow.isDestroyed() || splashWindow.webContents.isDestroyed()) {
      return;
    }

    const payload: SplashUpdatePayload = {
      activities: Array.from(this.activities.values())
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(({ key, name, status }) => ({
          key,
          name,
          status,
        })),
    };

    try {
      splashWindow.webContents.send("splash-update", payload);
    } catch (error) {
      // The window can be torn down between the destroyed checks and the send
      // (e.g. the main window is created while the splash renderer is loading).
      if (!(error instanceof Error && error.message.includes("Object has been destroyed"))) {
        console.error("Failed to emit splash state:", error);
      }
    }
  }

  private maybeShowSplash(): void {
    if (
      !this.splashWindow ||
      this.splashWindow.isDestroyed() ||
      this.suppressSplashShow ||
      !this.splashReadyToShow ||
      !this.splashShowDelayElapsed
    ) {
      return;
    }

    this.showSplashWindow();
  }

  private showSplashWindow(): void {
    if (!this.splashWindow || this.splashWindow.isDestroyed()) {
      return;
    }
    this.splashWindow.show();
    this.splashWindow.focus();
    activateAppOnMac();
  }

  private markSplashLoaded(): void {
    if (this.splashDidFinishLoad || !this.shouldContinueSplashLoad()) {
      return;
    }
    this.splashDidFinishLoad = true;
    this.emitState();
    if (this.forceShowWhenLoaded) {
      this.showSplashWindow();
    }
  }

  private async loadSplashRenderer(): Promise<void> {
    if (!this.splashWindow || this.splashWindow.isDestroyed()) {
      return;
    }

    const rendererUrl = getDevServerBase();

    if (is.dev && rendererUrl) {
      const devUrls = [
        new URL("/splash/index.html", rendererUrl).toString(),
        new URL("/splash/", rendererUrl).toString(),
      ];
      for (const devUrl of devUrls) {
        if (await this.tryLoadSplashUrl(devUrl, "dev splash URL", { quiet: true })) {
          return;
        }
        if (!this.shouldContinueSplashLoad()) {
          return;
        }
      }
    }

    if (
      await this.tryLoadSplashUrl(`${getDaemonUiBase()}/splash/index.html`, "daemon splash", {
        quiet: is.dev,
      })
    ) {
      return;
    }
    if (!this.shouldContinueSplashLoad()) {
      return;
    }

    if (await this.tryLoadSplashUrl(this.buildInlineFallbackSplashUrl(), "inline fallback splash")) {
      return;
    }

    throw new Error("Unable to load any splash renderer");
  }

  private shouldContinueSplashLoad(): boolean {
    return Boolean(
      this.splashWindow &&
      !this.splashWindow.isDestroyed() &&
      !this.splashLoadCanceled &&
      (!this.suppressSplashShow || this.forceShowWhenLoaded),
    );
  }

  private async tryLoadSplashUrl(url: string, source: string, options: { quiet?: boolean } = {}): Promise<boolean> {
    if (!this.shouldContinueSplashLoad()) {
      return false;
    }

    try {
      await this.splashWindow!.loadURL(url);
      if (!this.shouldContinueSplashLoad()) {
        return false;
      }
      this.markSplashLoaded();
      return true;
    } catch (error) {
      // The window can be torn down mid-load (e.g. the main window appears and
      // closes the hidden splash). Bail out quietly instead of falling through
      // to further renderer attempts that would also fail.
      const isDestroyedError = error instanceof Error && error.message.includes("Object has been destroyed");
      if (!this.shouldContinueSplashLoad() || isDestroyedError) {
        return false;
      }
      if (!options.quiet) {
        console.warn(`[SplashWindow] Failed to load ${source} (${url}); falling back:`, error);
      }
      return false;
    }
  }

  private buildInlineFallbackSplashUrl(): string {
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Argos</title>
    <style>
      * { box-sizing: border-box; }
      :root {
        --splash-bg: #0B0E14;
        --splash-ink: #FFFFFF;
        --splash-ink-dim: rgba(255,255,255,0.62);
        --splash-ink-faint: rgba(255,255,255,0.32);
        --splash-accent: #22B8FF;
        --splash-border: rgba(255,255,255,0.10);
        --splash-border-strong: rgba(255,255,255,0.18);
        color-scheme: dark;
      }
      @media (prefers-color-scheme: light) {
        :root {
          --splash-bg: #F5F6F8;
          --splash-ink: #0E1623;
          --splash-ink-dim: #414C60;
          --splash-ink-faint: #6B7585;
          --splash-accent: #0072B5;
          --splash-border: rgba(14,22,35,0.08);
          --splash-border-strong: rgba(14,22,35,0.16);
          color-scheme: light;
        }
      }
      html, body {
        width: 100%; height: 100%; margin: 0;
        background: var(--splash-bg); color: var(--splash-ink);
        overflow: hidden;
        font-family: "Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .shell {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
      }
      .stage {
        display: flex; flex-direction: column; align-items: center; gap: 16px;
        width: 100%; max-width: 340px;
      }
      .wordmark {
        font-family: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
        font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;
        color: var(--splash-ink-dim); margin: 0;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="stage">
        <h1 class="wordmark">Argos</h1>
        <p style="color: var(--splash-ink-dim); font-size: 13px;">Starting Argos…</p>
      </div>
    </div>
  </body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }

  private clearSplashShowDelayTimer(): void {
    if (this.splashShowDelayTimer) {
      clearTimeout(this.splashShowDelayTimer);
      this.splashShowDelayTimer = null;
    }
  }

  private shouldSuppressForWindowCreated(payload?: WindowCreatedPayload): boolean {
    if (!payload || typeof payload === "number") {
      return false;
    }

    return payload.isMainWindow === true || payload.windowType === "main";
  }

  private closeHiddenSplashWindow(): void {
    if (!this.splashWindow || this.splashWindow.isDestroyed() || this.splashWindow.isVisible()) {
      return;
    }

    try {
      this.splashWindow.close();
    } catch (error) {
      console.error("Failed to close hidden splash window:", error);
    }
  }
}
