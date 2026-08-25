import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "../../../../src/main/eventbus";
import { WINDOW_EVENTS } from "../../../../src/main/events";

const createdWindows = vi.hoisted(() => [] as MockBrowserWindow[]);
const mockIpcMain = vi.hoisted(() => ({
  on: vi.fn<(...args: any[]) => any>(),
}));
const splashLoadMocks = vi.hoisted(() => ({
  loadURL: undefined as ((url: string) => Promise<void>) | undefined,
  loadFile: undefined as ((filePath: string) => Promise<void>) | undefined,
}));

class MockBrowserWindow {
  private static nextWebContentsId = 1;
  public visible = false;
  public destroyed = false;
  public readonly show = vi.fn<(...args: any[]) => any>(() => {
    this.visible = true;
  });
  public readonly focus = vi.fn<(...args: any[]) => any>();
  public readonly close = vi.fn<(...args: any[]) => any>(() => {
    this.destroyed = true;
    this.emit("closed");
  });
  public readonly loadURL = vi.fn<(...args: any[]) => any>((url: string) => {
    return splashLoadMocks.loadURL?.(url) ?? Promise.resolve();
  });
  public readonly loadFile = vi.fn<(...args: any[]) => any>((filePath: string) => {
    return splashLoadMocks.loadFile?.(filePath) ?? Promise.resolve();
  });
  public readonly webContents = {
    id: MockBrowserWindow.nextWebContentsId++,
    on: vi.fn<(...args: any[]) => any>((event: string, handler: (...args: unknown[]) => void) => {
      this.addHandler(this.webContentsHandlers, event, handler);
    }),
    once: vi.fn<(...args: any[]) => any>((event: string, handler: (...args: unknown[]) => void) => {
      const wrappedHandler = (...args: unknown[]) => {
        this.removeHandler(this.webContentsHandlers, event, wrappedHandler);
        handler(...args);
      };
      this.addHandler(this.webContentsHandlers, event, wrappedHandler);
    }),
    send: vi.fn<(...args: any[]) => any>(),
    isDestroyed: vi.fn<(...args: any[]) => any>(() => this.destroyed),
  };

  private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  private readonly webContentsHandlers = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor() {
    createdWindows.push(this);
  }

  on(event: string, handler: (...args: unknown[]) => void) {
    this.addHandler(this.handlers, event, handler);
  }

  once(event: string, handler: (...args: unknown[]) => void) {
    const wrappedHandler = (...args: unknown[]) => {
      this.removeHandler(this.handlers, event, wrappedHandler);
      handler(...args);
    };
    this.addHandler(this.handlers, event, wrappedHandler);
  }

  emit(event: string, ...args: unknown[]) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      handler(...args);
    }
  }

  emitWebContents(event: string, ...args: unknown[]) {
    for (const handler of [...(this.webContentsHandlers.get(event) ?? [])]) {
      handler(...args);
    }
  }

  isDestroyed() {
    return this.destroyed;
  }

  isVisible() {
    return this.visible;
  }

  private addHandler(
    map: Map<string, Array<(...args: unknown[]) => void>>,
    event: string,
    handler: (...args: unknown[]) => void,
  ) {
    const handlers = map.get(event) ?? [];
    handlers.push(handler);
    map.set(event, handlers);
  }

  private removeHandler(
    map: Map<string, Array<(...args: unknown[]) => void>>,
    event: string,
    handler: (...args: unknown[]) => void,
  ) {
    const handlers = map.get(event) ?? [];
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
  }
}

vi.mock("electron", () => ({
  BrowserWindow: MockBrowserWindow,
  ipcMain: mockIpcMain,
  nativeImage: {
    createFromPath: vi.fn<(...args: any[]) => any>(() => ({})),
  },
}));

vi.mock("@electron-toolkit/utils", () => ({
  is: {
    dev: true,
  },
}));

vi.mock("#/lib/paths", () => ({
  getPreloadPath: vi.fn<(...args: any[]) => any>((name: string) => `/mock/preload/${name}`),
}));

const flushPromises = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
};

describe("SplashWindowManager display gating", () => {
  let manager: InstanceType<
    typeof import("../../../../src/main/presenter/lifecyclePresenter/SplashWindowManager").SplashWindowManager
  > | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    createdWindows.length = 0;
    mockIpcMain.on.mockClear();
    splashLoadMocks.loadURL = undefined;
    splashLoadMocks.loadFile = undefined;
    delete process.env.ARGOS_UI_DEV_SERVER_URL;
  });

  afterEach(async () => {
    if (manager) {
      const closePromise = manager.close();
      await vi.runAllTimersAsync();
      await closePromise;
      manager = null;
    }
    vi.useRealTimers();
    createdWindows.length = 0;
  });

  it("waits 200ms before showing the splash window", async () => {
    const { SplashWindowManager } =
      await import("../../../../src/main/presenter/lifecyclePresenter/SplashWindowManager");

    manager = new SplashWindowManager();
    await manager.create();

    const splashWindow = createdWindows[0];
    expect(splashWindow).toBeTruthy();

    splashWindow.emit("ready-to-show");
    expect(splashWindow.show).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(199);
    expect(splashWindow.show).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(splashWindow.show).toHaveBeenCalledTimes(1);
  });

  it("skips showing the splash window when the main window is created first", async () => {
    const { SplashWindowManager } =
      await import("../../../../src/main/presenter/lifecyclePresenter/SplashWindowManager");

    manager = new SplashWindowManager();
    await manager.create();

    const splashWindow = createdWindows[0];
    expect(splashWindow).toBeTruthy();

    splashWindow.emit("ready-to-show");
    eventBus.sendToMain(WINDOW_EVENTS.WINDOW_CREATED, {
      windowId: 1,
      isMainWindow: true,
    });
    await vi.advanceTimersByTimeAsync(200);

    expect(splashWindow.close).toHaveBeenCalledTimes(1);
    expect(splashWindow.show).not.toHaveBeenCalled();
    expect(manager.isVisible()).toBe(false);
  });

  it("does not suppress the splash when a non-main window is created first", async () => {
    const { SplashWindowManager } =
      await import("../../../../src/main/presenter/lifecyclePresenter/SplashWindowManager");

    manager = new SplashWindowManager();
    await manager.create();

    const splashWindow = createdWindows[0];
    expect(splashWindow).toBeTruthy();

    splashWindow.emit("ready-to-show");
    eventBus.sendToMain(WINDOW_EVENTS.WINDOW_CREATED, {
      windowId: 2,
      isMainWindow: false,
    });
    await vi.advanceTimersByTimeAsync(200);

    expect(splashWindow.close).not.toHaveBeenCalled();
    expect(splashWindow.show).toHaveBeenCalledTimes(1);
    expect(manager.isVisible()).toBe(true);
  });

  it("closes a hidden splash immediately without waiting for the 500ms transition delay", async () => {
    const { SplashWindowManager } =
      await import("../../../../src/main/presenter/lifecyclePresenter/SplashWindowManager");

    manager = new SplashWindowManager();
    await manager.create();

    const splashWindow = createdWindows[0];
    expect(splashWindow).toBeTruthy();

    const closePromise = manager.close();
    await Promise.resolve();

    expect(splashWindow.close).toHaveBeenCalledTimes(1);
    await closePromise;
  });

  it("falls back to an inline splash renderer when the dev page is unavailable", async () => {
    process.env.ARGOS_UI_DEV_SERVER_URL = "http://localhost:5180";
    splashLoadMocks.loadURL = vi.fn<(...args: any[]) => any>(async (url: string) => {
      if (url.startsWith("data:text/html")) {
        return;
      }
      throw new Error("dev renderer unavailable");
    });
    splashLoadMocks.loadFile = vi.fn<(...args: any[]) => any>(async () => {
      throw new Error("file renderer unavailable");
    });

    const { SplashWindowManager } =
      await import("../../../../src/main/presenter/lifecyclePresenter/SplashWindowManager");

    manager = new SplashWindowManager();
    await manager.create();
    await flushPromises();

    const splashWindow = createdWindows[0];
    expect(splashWindow).toBeTruthy();
    expect(splashWindow.loadURL).toHaveBeenNthCalledWith(1, "http://localhost:5180/splash/index.html");
    expect(splashWindow.loadURL).toHaveBeenNthCalledWith(2, "http://localhost:5180/splash/");
    expect(splashWindow.loadURL).toHaveBeenLastCalledWith(expect.stringMatching(/^data:text\/html/));
  });

  it("stops splash renderer fallback quietly after the hidden splash is suppressed", async () => {
    process.env.ARGOS_UI_DEV_SERVER_URL = "http://localhost:5180";
    const errorSpy = vi.spyOn<(...args: any[]) => any>(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});
    splashLoadMocks.loadURL = vi.fn<(...args: any[]) => any>(async () => {
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_CREATED, {
        windowId: 1,
        isMainWindow: true,
      });
      throw new Error("dev renderer unavailable");
    });
    splashLoadMocks.loadFile = vi.fn<(...args: any[]) => any>(async () => {
      throw new Error("file renderer unavailable");
    });

    try {
      const { SplashWindowManager } =
        await import("../../../../src/main/presenter/lifecyclePresenter/SplashWindowManager");

      manager = new SplashWindowManager();
      await manager.create();
      await flushPromises();

      const splashWindow = createdWindows[0];
      expect(splashWindow).toBeTruthy();
      expect(splashWindow.close).toHaveBeenCalledTimes(1);
      expect(splashWindow.loadURL).toHaveBeenCalledTimes(1);
      expect(splashWindow.loadFile).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalledWith("Failed to load splash window:", expect.anything());
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("[SplashWindow] Failed to load dev splash URL"),
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("bails out quietly when the window is destroyed mid-load (Object has been destroyed)", async () => {
    process.env.ARGOS_UI_DEV_SERVER_URL = "http://localhost:5180";
    const errorSpy = vi.spyOn<(...args: any[]) => any>(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});

    // Simulate the real async teardown race: the first loadURL is in-flight
    // when the main window appears and closes the hidden splash; the in-flight
    // load then rejects with Electron's "Object has been destroyed".
    splashLoadMocks.loadURL = vi.fn<(...args: any[]) => any>(async (url: string) => {
      if (!url.startsWith("data:text/html")) {
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_CREATED, {
          windowId: 1,
          isMainWindow: true,
        });
        throw new Error("Object has been destroyed");
      }
      return;
    });
    splashLoadMocks.loadFile = vi.fn<(...args: any[]) => any>(async () => {
      throw new Error("file renderer unavailable");
    });

    try {
      const { SplashWindowManager } =
        await import("../../../../src/main/presenter/lifecyclePresenter/SplashWindowManager");

      manager = new SplashWindowManager();
      await manager.create();
      await flushPromises();

      const splashWindow = createdWindows[0];
      expect(splashWindow).toBeTruthy();
      expect(splashWindow.close).toHaveBeenCalledTimes(1);
      // The first dev URL failed mid-load with the window destroyed; the
      // fallback chain bails out and does not attempt further loads.
      expect(splashWindow.loadURL).toHaveBeenCalledTimes(1);
      expect(splashWindow.loadFile).not.toHaveBeenCalled();
      // No "Failed to load splash window:" error, no "Failed to load ... splash"
      // warnings, no unhandled rejection from emitState.
      expect(errorSpy).not.toHaveBeenCalledWith("Failed to load splash window:", expect.anything());
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("[SplashWindow] Failed to load"),
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("does not throw when emitState runs on a window destroyed after the guards pass", async () => {
    process.env.ARGOS_UI_DEV_SERVER_URL = "http://localhost:5180";
    const errorSpy = vi.spyOn<(...args: any[]) => any>(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});

    let destroyedDuringSend = false;
    splashLoadMocks.loadURL = vi.fn<(...args: any[]) => any>(async (url: string) => {
      if (url.startsWith("data:text/html")) {
        return;
      }
      throw new Error("dev renderer unavailable");
    });
    splashLoadMocks.loadFile = vi.fn<(...args: any[]) => any>(async () => {
      throw new Error("file renderer unavailable");
    });

    try {
      const { SplashWindowManager } =
        await import("../../../../src/main/presenter/lifecyclePresenter/SplashWindowManager");

      manager = new SplashWindowManager();
      await manager.create();
      await flushPromises();

      const splashWindow = createdWindows[0];
      expect(splashWindow).toBeTruthy();

      // The inline fallback succeeded; now simulate the window dying between
      // the isDestroyed() guard and webContents.send().
      const originalSend = splashWindow.webContents.send;
      splashWindow.webContents.send = vi.fn<(...args: any[]) => any>(() => {
        splashWindow.destroyed = true;
        destroyedDuringSend = true;
        throw new Error("Object has been destroyed");
      });

      (manager as any).emitState();

      expect(destroyedDuringSend).toBe(true);
      expect(errorSpy).not.toHaveBeenCalledWith("Failed to emit splash state:", expect.anything());
      expect(warnSpy).not.toHaveBeenCalled();

      splashWindow.webContents.send = originalSend;
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
