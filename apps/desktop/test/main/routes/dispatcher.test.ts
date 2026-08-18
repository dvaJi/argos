import type {
  IAgentSessionPresenter,
  IConfigPresenter,
  IDevicePresenter,
  IFilePresenter,
  ILlmProviderPresenter,
  IProjectPresenter,
  ITabPresenter,
  IWindowPresenter,
  IYoBrowserPresenter,
} from "@argos/shared/presenter";
import { createMainKernelRouteRuntime, dispatchArgosRoute } from "#/routes";

type MockWindow = {
  id: number;
  maximized: boolean;
  fullScreen: boolean;
  focused: boolean;
  destroyed: boolean;
  webContents: {
    id: number;
  };
  isDestroyed: () => boolean;
  isMaximized: () => boolean;
  isFullScreen: () => boolean;
};

const { browserWindowState } = vi.hoisted(() => {
  const windows = new Map<number, MockWindow>();

  const createWindow = (
    id: number,
    webContentsId: number,
    overrides: Partial<Pick<MockWindow, "maximized" | "fullScreen" | "focused" | "destroyed">> = {},
  ): MockWindow => {
    const window: MockWindow = {
      id,
      maximized: false,
      fullScreen: false,
      focused: true,
      destroyed: false,
      webContents: {
        id: webContentsId,
      },
      isDestroyed: () => window.destroyed,
      isMaximized: () => window.maximized,
      isFullScreen: () => window.fullScreen,
    };

    Object.assign(window, overrides);
    return window;
  };

  return {
    browserWindowState: {
      windows,
      reset() {
        windows.clear();
        windows.set(7, createWindow(7, 42, { focused: true }));
        windows.set(3, createWindow(3, 88, { focused: true }));
        windows.set(19, createWindow(19, 444, { focused: false }));
      },
    },
  };
});

vi.mock("electron", () => ({
  BrowserWindow: {
    fromId: (windowId: number) => browserWindowState.windows.get(windowId) ?? null,
    fromWebContents: (webContents: { id: number }) =>
      [...browserWindowState.windows.values()].find((window) => window.webContents.id === webContents.id) ?? null,
  },
}));

// Daemon-owned routes (workspace.*, sessions.*, …) delegate through
// invokeDaemonRoute. Fixture outputs are registered per test; unregistered
// routes fall through to the real proxy (daemon_not_running), matching the
// pre-delegation behavior of these suites.
const daemonRouteMocks = vi.hoisted(() => ({
  outputs: new Map<string, unknown>(),
  invokeDaemonRoute: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("#/routes/daemonRouteProxy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/routes/daemonRouteProxy")>();
  const invokeDaemonRoute = vi.fn(async (route: string, input: unknown) => {
    if (daemonRouteMocks.outputs.has(route)) {
      return daemonRouteMocks.outputs.get(route);
    }
    return actual.invokeDaemonRoute(route, input);
  });
  daemonRouteMocks.invokeDaemonRoute = invokeDaemonRoute;
  return { ...actual, invokeDaemonRoute };
});

function createRuntime() {
  browserWindowState.reset();

  const settings = {
    fontSizeLevel: 2,
    fontFamily: "JetBrains Mono",
    codeFontFamily: "Fira Code",
    artifactsEffectEnabled: false,
    autoScrollEnabled: true,
    autoCompactionEnabled: true,
    autoCompactionTriggerThreshold: 80,
    autoCompactionRetainRecentPairs: 2,
    contentProtectionEnabled: false,
    privacyModeEnabled: false,
    notificationsEnabled: true,
    launchAtLoginEnabled: false,
    traceDebugEnabled: false,
    copyWithCotEnabled: true,
    loggingEnabled: false,
  };
  const knowledgeConfigs = [
    {
      id: "knowledge-1",
      description: "Local docs",
      embedding: {
        providerId: "openai",
        modelId: "text-embedding-3-small",
      },
      dimensions: 1536,
      normalized: true,
      fragmentsNumber: 6,
      enabled: true,
    },
  ];

  const preparedFile = {
    name: "demo.txt",
    path: "/workspace/demo.txt",
    type: "text",
    mimeType: "text/plain",
    content: "demo",
  };

  const workspacePreview = {
    path: "/workspace/src/app.ts",
    relativePath: "src/app.ts",
    name: "app.ts",
    mimeType: "text/plain",
    kind: "text" as const,
    content: "export const answer = 42",
    language: "ts",
    metadata: {
      fileName: "app.ts",
      fileSize: 21,
      fileCreated: new Date("2024-01-01T00:00:00.000Z"),
      fileModified: new Date("2024-01-02T00:00:00.000Z"),
    },
  };

  const browserStatus = {
    initialized: true,
    page: {
      id: "page-1",
      url: "https://example.com",
      title: "Example",
      status: "ready" as const,
      createdAt: 1,
      updatedAt: 2,
    },
    canGoBack: false,
    canGoForward: true,
    visible: true,
    loading: false,
  };

  const configPresenter = {
    getSetting: vi.fn<(...args: any[]) => any>((key: keyof typeof settings) => settings[key]),
    setSetting: vi.fn<(...args: any[]) => any>((key: keyof typeof settings, value: unknown) => {
      (settings as Record<string, unknown>)[key] = value;
    }),
    getFontFamily: vi.fn<(...args: any[]) => any>(() => settings.fontFamily),
    setFontFamily: vi.fn<(...args: any[]) => any>((value?: string | null) => {
      settings.fontFamily = value ?? "";
    }),
    getCodeFontFamily: vi.fn<(...args: any[]) => any>(() => settings.codeFontFamily),
    setCodeFontFamily: vi.fn<(...args: any[]) => any>((value?: string | null) => {
      settings.codeFontFamily = value ?? "";
    }),
    getAutoScrollEnabled: vi.fn<(...args: any[]) => any>(() => settings.autoScrollEnabled),
    setAutoScrollEnabled: vi.fn<(...args: any[]) => any>((value: boolean) => {
      settings.autoScrollEnabled = value;
    }),
    getAutoCompactionEnabled: vi.fn<(...args: any[]) => any>(() => settings.autoCompactionEnabled),
    setAutoCompactionEnabled: vi.fn<(...args: any[]) => any>((value: boolean) => {
      settings.autoCompactionEnabled = value;
    }),
    getAutoCompactionTriggerThreshold: vi.fn<(...args: any[]) => any>(() => settings.autoCompactionTriggerThreshold),
    setAutoCompactionTriggerThreshold: vi.fn<(...args: any[]) => any>((value: number) => {
      settings.autoCompactionTriggerThreshold = value;
    }),
    getAutoCompactionRetainRecentPairs: vi.fn<(...args: any[]) => any>(() => settings.autoCompactionRetainRecentPairs),
    setAutoCompactionRetainRecentPairs: vi.fn<(...args: any[]) => any>((value: number) => {
      settings.autoCompactionRetainRecentPairs = value;
    }),
    getContentProtectionEnabled: vi.fn<(...args: any[]) => any>(() => settings.contentProtectionEnabled),
    setContentProtectionEnabled: vi.fn<(...args: any[]) => any>((value: boolean) => {
      settings.contentProtectionEnabled = value;
    }),
    getPrivacyModeEnabled: vi.fn<(...args: any[]) => any>(() => settings.privacyModeEnabled),
    setPrivacyModeEnabled: vi.fn<(...args: any[]) => any>((value: boolean) => {
      settings.privacyModeEnabled = value;
    }),
    getNotificationsEnabled: vi.fn<(...args: any[]) => any>(() => settings.notificationsEnabled),
    setNotificationsEnabled: vi.fn<(...args: any[]) => any>((value: boolean) => {
      settings.notificationsEnabled = value;
    }),
    getLaunchAtLoginEnabled: vi.fn<(...args: any[]) => any>(() => settings.launchAtLoginEnabled),
    setLaunchAtLoginEnabled: vi.fn<(...args: any[]) => any>((value: boolean) => {
      settings.launchAtLoginEnabled = value;
    }),
    getSystemFonts: vi.fn<(...args: any[]) => any>().mockResolvedValue(["Inter", "JetBrains Mono"]),
    getProviderModels: vi.fn<(...args: any[]) => any>(() => [
      {
        id: "gpt-5.4",
        name: "GPT-5.4",
        group: "default",
        providerId: "openai",
      },
    ]),
    getCustomModels: vi.fn<(...args: any[]) => any>(() => []),
    getAgentType: vi.fn<(...args: any[]) => any>(async (agentId: string) => (agentId === "argos" ? "argos" : null)),
    getCopyWithCotEnabled: vi.fn<(...args: any[]) => any>(() => settings.copyWithCotEnabled),
    setCopyWithCotEnabled: vi.fn<(...args: any[]) => any>((value: boolean) => {
      settings.copyWithCotEnabled = value;
    }),
    getLoggingEnabled: vi.fn<(...args: any[]) => any>(() => settings.loggingEnabled),
    setLoggingEnabled: vi.fn<(...args: any[]) => any>((value: boolean) => {
      settings.loggingEnabled = value;
    }),
    setTraceDebugEnabled: vi.fn<(...args: any[]) => any>((value: boolean) => {
      settings.traceDebugEnabled = value;
    }),
    getKnowledgeConfigs: vi.fn<(...args: any[]) => any>(() => knowledgeConfigs),
    setKnowledgeConfigs: vi.fn<(...args: any[]) => any>((configs: typeof knowledgeConfigs) => {
      knowledgeConfigs.splice(0, knowledgeConfigs.length, ...configs);
    }),
  } as unknown as IConfigPresenter;

  const agentSessionPresenter = {
    createSession: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      id: "session-1",
      agentId: "argos",
      title: "New Chat",
      projectDir: "/workspace",
      isPinned: false,
      isDraft: false,
      sessionKind: "regular",
      parentSessionId: null,
      subagentEnabled: false,
      subagentMeta: null,
      createdAt: 1,
      updatedAt: 2,
      status: "idle",
      providerId: "openai",
      modelId: "gpt-5.4",
    }),
    getSession: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      id: "session-1",
      agentId: "argos",
      title: "Restored",
      projectDir: "/workspace",
      isPinned: false,
      isDraft: false,
      sessionKind: "regular",
      parentSessionId: null,
      subagentEnabled: false,
      subagentMeta: null,
      createdAt: 1,
      updatedAt: 2,
      status: "idle",
      providerId: "openai",
      modelId: "gpt-5.4",
    }),
    getMessages: vi.fn<(...args: any[]) => any>().mockResolvedValue([
      {
        id: "message-1",
        sessionId: "session-1",
        orderSeq: 1,
        role: "user",
        content: '{"text":"hello"}',
        status: "sent",
        isContextEdge: 0,
        metadata: "{}",
        createdAt: 1,
        updatedAt: 1,
      },
    ]),
    getSessionList: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    getActiveSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    activateSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    deactivateSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    getSessionGenerationSettings: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      systemPrompt: "",
      temperature: 0.7,
      contextLength: 32000,
      maxTokens: 4096,
      timeout: 5000,
    }),
    updateSessionGenerationSettings: vi
      .fn<(...args: any[]) => any>()
      .mockImplementation(async (_sessionId: string, settings: { timeout?: number }) => ({
        systemPrompt: "",
        temperature: 0.7,
        contextLength: 32000,
        maxTokens: 4096,
        timeout: settings.timeout ?? 5000,
      })),
    sendMessage: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      requestId: "message-2",
      messageId: "message-2",
    }),
    steerActiveTurn: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    compactSession: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      compacted: true,
      state: {
        status: "compacted",
        cursorOrderSeq: 5,
        summaryUpdatedAt: 123,
      },
    }),
    cancelGeneration: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    getMessage: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      id: "message-1",
      sessionId: "session-1",
    }),
    respondToolInteraction: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      resumed: true,
    }),
    clearSessionPermissions: vi.fn<(...args: any[]) => any>(),
  } as unknown as IAgentSessionPresenter;

  const llmProviderPresenter = {
    check: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      isOk: true,
      errorMsg: null,
    }),
  } as unknown as ILlmProviderPresenter;

  const windowPresenter = {
    createSettingsWindow: vi.fn<(...args: any[]) => any>().mockResolvedValue(9),
    navigateToSettings: vi.fn<(...args: any[]) => any>().mockResolvedValue(9),
    previewFile: vi.fn<(...args: any[]) => any>(),
    minimize: vi.fn<(...args: any[]) => any>((windowId: number) => {
      const window = browserWindowState.windows.get(windowId);
      if (window) {
        window.focused = false;
      }
    }),
    maximize: vi.fn<(...args: any[]) => any>((windowId: number) => {
      const window = browserWindowState.windows.get(windowId);
      if (window) {
        window.maximized = !window.maximized;
      }
    }),
    close: vi.fn<(...args: any[]) => any>((windowId: number) => {
      const window = browserWindowState.windows.get(windowId);
      if (window) {
        window.destroyed = true;
      }
    }),
    hide: vi.fn<(...args: any[]) => any>((windowId: number) => {
      const window = browserWindowState.windows.get(windowId);
      if (window) {
        window.focused = false;
      }
    }),
    isMainWindowFocused: vi.fn<(...args: any[]) => any>(
      (windowId: number) => browserWindowState.windows.get(windowId)?.focused ?? false,
    ),
    getFloatingChatWindow: vi.fn<(...args: any[]) => any>(() => ({
      getWindow: () => browserWindowState.windows.get(19) ?? null,
    })),
  } as unknown as IWindowPresenter & {
    getFloatingChatWindow: () => {
      getWindow: () => MockWindow | null;
    };
  };

  const devicePresenter = {
    getAppVersion: vi.fn<(...args: any[]) => any>().mockResolvedValue("1.2.3"),
    getDeviceInfo: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      platform: "win32",
      arch: "x64",
      cpuModel: "AMD Ryzen",
      totalMemory: 32,
      osVersion: "Windows 11",
      osVersionMetadata: [{ name: "23H2", build: 22631 }],
    }),
    selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      canceled: false,
      filePaths: ["C:/workspace"],
    }),
    restartApp: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    sanitizeSvgContent: vi.fn<(...args: any[]) => any>().mockResolvedValue("<svg />"),
  } as unknown as IDevicePresenter;

  const projectPresenter = {
    getRecentProjects: vi.fn<(...args: any[]) => any>().mockResolvedValue([
      {
        path: "C:/workspace",
        name: "workspace",
        icon: null,
        lastAccessedAt: 123,
      },
    ]),
    getEnvironments: vi.fn<(...args: any[]) => any>().mockResolvedValue([
      {
        path: "C:/workspace",
        name: "workspace",
        sessionCount: 2,
        lastUsedAt: 456,
        isTemp: false,
        exists: true,
      },
    ]),
    openDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue("C:/selected-workspace"),
  } as unknown as IProjectPresenter;

  const filePresenter = {
    getMimeType: vi.fn<(...args: any[]) => any>().mockResolvedValue("text/plain"),
    prepareFile: vi.fn<(...args: any[]) => any>().mockResolvedValue(preparedFile),
    prepareDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      name: "workspace",
      path: "/workspace",
      type: "directory",
    }),
    readFile: vi.fn<(...args: any[]) => any>().mockResolvedValue("hello world"),
    isDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
    writeImageBase64: vi.fn<(...args: any[]) => any>().mockResolvedValue("/tmp/capture.png"),
  } as unknown as IFilePresenter;

  const workspaceShell = {
    revealFileInFolder: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    openFile: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  };

  // Daemon-owned workspace routes resolve from the invokeDaemonRoute fixture map.
  daemonRouteMocks.outputs.clear();
  daemonRouteMocks.outputs.set("workspace.register", { registered: true });
  daemonRouteMocks.outputs.set("workspace.unregister", { unregistered: true });
  daemonRouteMocks.outputs.set("workspace.watch", { watching: true });
  daemonRouteMocks.outputs.set("workspace.unwatch", { watching: false });
  daemonRouteMocks.outputs.set("workspace.readDirectory", {
    nodes: [
      {
        name: "src",
        path: "/workspace/src",
        isDirectory: true,
      },
    ],
  });
  daemonRouteMocks.outputs.set("workspace.readFilePreview", { preview: workspacePreview });
  daemonRouteMocks.outputs.set("workspace.getGitStatus", {
    state: {
      workspacePath: "/workspace",
      branch: "main",
      ahead: 0,
      behind: 0,
      changes: [],
    },
  });
  daemonRouteMocks.outputs.set("workspace.getGitDiff", {
    diff: {
      workspacePath: "/workspace",
      filePath: "/workspace/src/app.ts",
      relativePath: "src/app.ts",
      staged: "",
      unstaged: "diff --git a/src/app.ts b/src/app.ts",
    },
  });
  daemonRouteMocks.outputs.set("workspace.resolveMarkdownLinkedFile", {
    resolution: {
      path: "/workspace/docs/guide.md",
      name: "guide.md",
      relativePath: "docs/guide.md",
      workspaceRoot: "/workspace",
    },
  });
  daemonRouteMocks.outputs.set("workspace.searchFiles", {
    nodes: [
      {
        name: "app.ts",
        path: "/workspace/src/app.ts",
        isDirectory: false,
      },
    ],
  });

  const yoBrowserPresenter = {
    getBrowserStatus: vi.fn<(...args: any[]) => any>().mockResolvedValue(browserStatus),
    loadUrl: vi.fn<(...args: any[]) => any>(
      async (sessionId: string, url: string, timeoutMs?: number, hostWindowId?: number) => ({
        ...browserStatus,
        page: {
          ...browserStatus.page,
          id: `${sessionId}-${hostWindowId ?? "none"}`,
          url,
          updatedAt: timeoutMs ?? 2,
        },
      }),
    ),
    attachSessionBrowser: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
    updateSessionBrowserBounds: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    detachSessionBrowser: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    destroySessionBrowser: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    goBack: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    goForward: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    reload: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  } as unknown as IYoBrowserPresenter;

  const tabPresenter = {
    onRendererTabReady: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    onRendererTabActivated: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    captureTabArea: vi.fn<(...args: any[]) => any>().mockResolvedValue("data:image/png;base64,capture"),
    stitchImagesWithWatermark: vi.fn<(...args: any[]) => any>().mockResolvedValue("data:image/png;base64,stitched"),
  } as unknown as ITabPresenter;

  return {
    settings,
    runtime: createMainKernelRouteRuntime({
      configPresenter,
      llmProviderPresenter,
      agentSessionPresenter,
      windowPresenter,
      devicePresenter,
      projectPresenter,
      filePresenter,
      workspaceShell,
      yoBrowserPresenter,
      tabPresenter,
      scheduledTasks: {
        setSessionCreator: vi.fn<(...args: any[]) => any>(),
        start: vi.fn<(...args: any[]) => any>(),
        stop: vi.fn<(...args: any[]) => any>(),
        list: vi.fn<(...args: any[]) => any>().mockReturnValue({ tasks: [] }),
        upsert: vi.fn<(...args: any[]) => any>(),
        delete: vi.fn<(...args: any[]) => any>(),
        toggle: vi.fn<(...args: any[]) => any>(),
        fireNow: vi.fn<(...args: any[]) => any>(),
      } as any,
    }),
    configPresenter,
    llmProviderPresenter,
    agentSessionPresenter,
    windowPresenter,
    devicePresenter,
    projectPresenter,
    filePresenter,
    workspaceShell,
    yoBrowserPresenter,
    tabPresenter,
  };
}

describe("dispatchArgosRoute", () => {
  it("reads a typed settings snapshot", async () => {
    const { runtime } = createRuntime();

    const result = await dispatchArgosRoute(
      runtime,
      "settings.getSnapshot",
      {
        keys: ["fontSizeLevel", "fontFamily"],
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    expect(result).toEqual({
      version: expect.any(Number),
      values: {
        fontSizeLevel: 2,
        fontFamily: "JetBrains Mono",
      },
    });
  });

  it("lists system fonts through the settings handler adapter", async () => {
    const { runtime, configPresenter } = createRuntime();

    const result = await dispatchArgosRoute(
      runtime,
      "settings.listSystemFonts",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    expect(configPresenter.getSystemFonts).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      fonts: ["Inter", "JetBrains Mono"],
    });
  });

  it("applies typed settings updates through presenter adapters", async () => {
    const { runtime, configPresenter, settings } = createRuntime();

    const result = await dispatchArgosRoute(
      runtime,
      "settings.update",
      {
        changes: [
          { key: "fontSizeLevel", value: 4 },
          { key: "privacyModeEnabled", value: true },
        ],
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    expect(configPresenter.setSetting).toHaveBeenCalledWith("fontSizeLevel", 4);
    expect(configPresenter.setPrivacyModeEnabled).toHaveBeenCalledWith(true);
    expect(settings.fontSizeLevel).toBe(4);
    expect(settings.privacyModeEnabled).toBe(true);
    expect(result).toEqual({
      version: expect.any(Number),
      changedKeys: ["fontSizeLevel", "privacyModeEnabled"],
      values: {
        fontSizeLevel: 4,
        privacyModeEnabled: true,
      },
    });
  });

  it("dispatches built-in knowledge config routes through ConfigPresenter", async () => {
    const { runtime, configPresenter } = createRuntime();
    const nextConfigs = [
      {
        id: "knowledge-2",
        description: "Updated local docs",
        embedding: {
          providerId: "openai",
          modelId: "text-embedding-3-small",
        },
        rerank: {
          providerId: "openai",
          modelId: "rerank-model",
        },
        dimensions: 1536,
        normalized: true,
        chunkSize: 800,
        chunkOverlap: 120,
        fragmentsNumber: 8,
        separators: ["\n\n", "\n"],
        enabled: false,
      },
    ];

    const getResult = await dispatchArgosRoute(
      runtime,
      "config.getKnowledgeConfigs",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const setResult = await dispatchArgosRoute(
      runtime,
      "config.setKnowledgeConfigs",
      {
        configs: nextConfigs,
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    expect(getResult).toEqual({
      configs: [
        expect.objectContaining({
          id: "knowledge-1",
        }),
      ],
    });
    expect(configPresenter.setKnowledgeConfigs).toHaveBeenCalledWith(nextConfigs);
    expect(setResult).toEqual({
      configs: nextConfigs,
    });
  });

  it("dispatches session and chat routes with renderer context", async () => {
    const { runtime, agentSessionPresenter } = createRuntime();

    const createResult = await dispatchArgosRoute(
      runtime,
      "sessions.create",
      {
        agentId: "argos",
        message: "hello world",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(agentSessionPresenter.createSession).toHaveBeenCalledWith(
      {
        agentId: "argos",
        message: "hello world",
      },
      88,
    );
    expect(createResult).toEqual({
      session: expect.objectContaining({
        id: "session-1",
      }),
    });

    await dispatchArgosRoute(
      runtime,
      "chat.sendMessage",
      {
        sessionId: "session-1",
        content: "follow up",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(agentSessionPresenter.sendMessage).toHaveBeenCalledWith("session-1", "follow up");

    await dispatchArgosRoute(
      runtime,
      "chat.steerActiveTurn",
      {
        sessionId: "session-1",
        content: "refine the active answer",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(agentSessionPresenter.steerActiveTurn).toHaveBeenCalledWith("session-1", "refine the active answer");

    const compactResult = await dispatchArgosRoute(
      runtime,
      "sessions.compact",
      {
        sessionId: "session-1",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(agentSessionPresenter.compactSession).toHaveBeenCalledWith("session-1");
    expect(compactResult).toEqual({
      compacted: true,
      state: {
        status: "compacted",
        cursorOrderSeq: 5,
        summaryUpdatedAt: 123,
      },
    });
  });

  it("dispatches session generation settings routes without dropping timeout", async () => {
    const { runtime, agentSessionPresenter } = createRuntime();

    const updateResult = await dispatchArgosRoute(
      runtime,
      "sessions.updateGenerationSettings",
      {
        sessionId: "session-1",
        settings: {
          timeout: 5000,
        },
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    const getResult = await dispatchArgosRoute(
      runtime,
      "sessions.getGenerationSettings",
      {
        sessionId: "session-1",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(agentSessionPresenter.updateSessionGenerationSettings).toHaveBeenCalledWith("session-1", {
      timeout: 5000,
    });
    expect(updateResult).toEqual({
      settings: {
        systemPrompt: "",
        temperature: 0.7,
        contextLength: 32000,
        maxTokens: 4096,
        timeout: 5000,
      },
    });
    expect(agentSessionPresenter.getSessionGenerationSettings).toHaveBeenCalledWith("session-1");
    expect(getResult).toEqual({
      settings: {
        systemPrompt: "",
        temperature: 0.7,
        contextLength: 32000,
        maxTokens: 4096,
        timeout: 5000,
      },
    });
  });

  it("dispatches provider query and tool interaction routes through typed services", async () => {
    const { runtime, configPresenter, llmProviderPresenter, agentSessionPresenter } = createRuntime();

    const modelsResult = await dispatchArgosRoute(
      runtime,
      "providers.listModels",
      {
        providerId: "openai",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    const checkResult = await dispatchArgosRoute(
      runtime,
      "providers.testConnection",
      {
        providerId: "openai",
        modelId: "gpt-5.4",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    const interactionResult = await dispatchArgosRoute(
      runtime,
      "chat.respondToolInteraction",
      {
        sessionId: "session-1",
        messageId: "message-1",
        toolCallId: "tool-1",
        response: {
          kind: "permission",
          granted: true,
        },
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(configPresenter.getProviderModels).toHaveBeenCalledWith("openai");
    expect(llmProviderPresenter.check).toHaveBeenCalledWith("openai", "gpt-5.4");
    expect(agentSessionPresenter.respondToolInteraction).toHaveBeenCalledWith("session-1", "message-1", "tool-1", {
      kind: "permission",
      granted: true,
    });
    expect(modelsResult).toEqual({
      providerModels: [
        {
          id: "gpt-5.4",
          name: "GPT-5.4",
          group: "default",
          providerId: "openai",
        },
      ],
      customModels: [],
    });
    expect(checkResult).toEqual({
      isOk: true,
      errorMsg: null,
    });
    expect(interactionResult).toEqual({
      accepted: true,
      resumed: true,
    });
  });

  it("activates, deactivates, and reads the active session through typed routes", async () => {
    const { runtime, agentSessionPresenter } = createRuntime();
    (agentSessionPresenter.getActiveSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "session-1",
      agentId: "argos",
      title: "Restored",
      projectDir: "/workspace",
      isPinned: false,
      isDraft: false,
      sessionKind: "regular",
      parentSessionId: null,
      subagentEnabled: false,
      subagentMeta: null,
      createdAt: 1,
      updatedAt: 2,
      status: "idle",
      providerId: "openai",
      modelId: "gpt-5.4",
    });

    const activateResult = await dispatchArgosRoute(
      runtime,
      "sessions.activate",
      {
        sessionId: "session-1",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    const deactivateResult = await dispatchArgosRoute(
      runtime,
      "sessions.deactivate",
      {},
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    const activeResult = await dispatchArgosRoute(
      runtime,
      "sessions.getActive",
      {},
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(agentSessionPresenter.activateSession).toHaveBeenCalledWith(88, "session-1");
    expect(agentSessionPresenter.deactivateSession).toHaveBeenCalledWith(88);
    expect(agentSessionPresenter.getActiveSession).toHaveBeenCalledWith(88);
    expect(activateResult).toEqual({ activated: true });
    expect(deactivateResult).toEqual({ deactivated: true });
    expect(activeResult).toEqual({
      session: expect.objectContaining({
        id: "session-1",
      }),
    });
  });

  it("resolves stopStream by requestId when sessionId is omitted", async () => {
    const { runtime, agentSessionPresenter } = createRuntime();

    const result = await dispatchArgosRoute(
      runtime,
      "chat.stopStream",
      {
        requestId: "message-1",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(agentSessionPresenter.getMessage).toHaveBeenCalledWith("message-1");
    expect(agentSessionPresenter.cancelGeneration).toHaveBeenCalledWith("session-1");
    expect(result).toEqual({ stopped: true });
  });

  it("dispatches phase3 window routes with current window state", async () => {
    const { runtime, windowPresenter } = createRuntime();

    const initialState = await dispatchArgosRoute(
      runtime,
      "window.getCurrentState",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    const minimizedState = await dispatchArgosRoute(
      runtime,
      "window.minimizeCurrent",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    const maximizedState = await dispatchArgosRoute(
      runtime,
      "window.toggleMaximizeCurrent",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    const previewResult = await dispatchArgosRoute(
      runtime,
      "window.previewFile",
      {
        filePath: "C:/workspace/README.md",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    const closeFloatingResult = await dispatchArgosRoute(
      runtime,
      "window.closeFloatingCurrent",
      {},
      {
        webContentsId: 444,
        windowId: 7,
      },
    );

    const closeResult = await dispatchArgosRoute(
      runtime,
      "window.closeCurrent",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    expect(initialState).toEqual({
      state: {
        windowId: 7,
        exists: true,
        isMaximized: false,
        isFullScreen: false,
        isFocused: true,
      },
    });
    expect(windowPresenter.minimize).toHaveBeenCalledWith(7);
    expect(minimizedState).toEqual({
      state: {
        windowId: 7,
        exists: true,
        isMaximized: false,
        isFullScreen: false,
        isFocused: false,
      },
    });
    expect(windowPresenter.maximize).toHaveBeenCalledWith(7);
    expect(maximizedState).toEqual({
      state: {
        windowId: 7,
        exists: true,
        isMaximized: true,
        isFullScreen: false,
        isFocused: false,
      },
    });
    expect(windowPresenter.previewFile).toHaveBeenCalledWith("C:/workspace/README.md");
    expect(previewResult).toEqual({ previewed: true });
    expect(windowPresenter.hide).toHaveBeenCalledWith(19);
    expect(closeFloatingResult).toEqual({ closed: true });
    expect(windowPresenter.close).toHaveBeenCalledWith(7);
    expect(closeResult).toEqual({ closed: true });
  });

  it("dispatches phase3 device, project, file, and workspace routes", async () => {
    const { runtime, devicePresenter, projectPresenter, filePresenter, workspaceShell } = createRuntime();

    const appVersion = await dispatchArgosRoute(
      runtime,
      "device.getAppVersion",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const deviceInfo = await dispatchArgosRoute(
      runtime,
      "device.getInfo",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const directorySelection = await dispatchArgosRoute(
      runtime,
      "device.selectDirectory",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const restartResult = await dispatchArgosRoute(
      runtime,
      "device.restartApp",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const sanitizeResult = await dispatchArgosRoute(
      runtime,
      "device.sanitizeSvg",
      {
        svgContent: '<svg unsafe="1" />',
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    const recentProjects = await dispatchArgosRoute(
      runtime,
      "project.listRecent",
      {
        limit: 5,
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const environments = await dispatchArgosRoute(
      runtime,
      "project.listEnvironments",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const openDirectoryResult = await dispatchArgosRoute(
      runtime,
      "project.openDirectory",
      {
        path: "C:/workspace",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const selectedDirectory = await dispatchArgosRoute(
      runtime,
      "project.selectDirectory",
      {},
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    const mimeType = await dispatchArgosRoute(
      runtime,
      "file.getMimeType",
      {
        path: "/workspace/demo.txt",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const preparedFile = await dispatchArgosRoute(
      runtime,
      "file.prepareFile",
      {
        path: "/workspace/demo.txt",
        mimeType: "text/plain",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const preparedDirectory = await dispatchArgosRoute(
      runtime,
      "file.prepareDirectory",
      {
        path: "/workspace",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const readFile = await dispatchArgosRoute(
      runtime,
      "file.readFile",
      {
        path: "/workspace/demo.txt",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const isDirectory = await dispatchArgosRoute(
      runtime,
      "file.isDirectory",
      {
        path: "/workspace",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const imagePath = await dispatchArgosRoute(
      runtime,
      "file.writeImageBase64",
      {
        name: "capture.png",
        content: "data:image/png;base64,abc",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    const registerWorkspace = await dispatchArgosRoute(
      runtime,
      "workspace.register",
      {
        workspacePath: "/workspace",
        mode: "workspace",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const registerWorkdir = await dispatchArgosRoute(
      runtime,
      "workspace.register",
      {
        workspacePath: "/workspace",
        mode: "workdir",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const readDirectory = await dispatchArgosRoute(
      runtime,
      "workspace.readDirectory",
      {
        path: "/workspace",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const preview = await dispatchArgosRoute(
      runtime,
      "workspace.readFilePreview",
      {
        path: "/workspace/src/app.ts",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const gitStatus = await dispatchArgosRoute(
      runtime,
      "workspace.getGitStatus",
      {
        workspacePath: "/workspace",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const gitDiff = await dispatchArgosRoute(
      runtime,
      "workspace.getGitDiff",
      {
        workspacePath: "/workspace",
        filePath: "/workspace/src/app.ts",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const resolution = await dispatchArgosRoute(
      runtime,
      "workspace.resolveMarkdownLinkedFile",
      {
        workspacePath: "/workspace",
        href: "./docs/guide.md",
        sourceFilePath: "/workspace/README.md",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const searchResult = await dispatchArgosRoute(
      runtime,
      "workspace.searchFiles",
      {
        workspacePath: "/workspace",
        query: "app",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const openFileResult = await dispatchArgosRoute(
      runtime,
      "workspace.openFile",
      {
        path: "/workspace/src/app.ts",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const revealResult = await dispatchArgosRoute(
      runtime,
      "workspace.revealFileInFolder",
      {
        path: "/workspace/src/app.ts",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const unwatchResult = await dispatchArgosRoute(
      runtime,
      "workspace.unwatch",
      {
        workspacePath: "/workspace",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );
    const unregisterResult = await dispatchArgosRoute(
      runtime,
      "workspace.unregister",
      {
        workspacePath: "/workspace",
        mode: "workspace",
      },
      {
        webContentsId: 42,
        windowId: 7,
      },
    );

    expect(devicePresenter.getAppVersion).toHaveBeenCalledTimes(1);
    expect(appVersion).toEqual({ version: "1.2.3" });
    expect(deviceInfo).toEqual({
      info: {
        platform: "win32",
        arch: "x64",
        cpuModel: "AMD Ryzen",
        totalMemory: 32,
        osVersion: "Windows 11",
        osVersionMetadata: [{ name: "23H2", build: 22631 }],
      },
    });
    expect(directorySelection).toEqual({
      canceled: false,
      filePaths: ["C:/workspace"],
    });
    expect(devicePresenter.restartApp).toHaveBeenCalledTimes(1);
    expect(restartResult).toEqual({ restarted: true });
    expect(sanitizeResult).toEqual({ content: "<svg />" });

    expect(projectPresenter.getRecentProjects).toHaveBeenCalledWith(5);
    expect(recentProjects).toEqual({
      projects: [
        {
          path: "C:/workspace",
          name: "workspace",
          icon: null,
          lastAccessedAt: 123,
        },
      ],
    });
    expect(environments).toEqual({
      environments: [
        {
          path: "C:/workspace",
          name: "workspace",
          sessionCount: 2,
          lastUsedAt: 456,
          isTemp: false,
          exists: true,
        },
      ],
    });
    expect(projectPresenter.openDirectory).toHaveBeenCalledWith("C:/workspace");
    expect(openDirectoryResult).toEqual({ opened: true });
    expect(selectedDirectory).toEqual({ path: "C:/selected-workspace" });

    expect(filePresenter.getMimeType).toHaveBeenCalledWith("/workspace/demo.txt");
    expect(mimeType).toEqual({ mimeType: "text/plain" });
    expect(preparedFile).toEqual({
      file: {
        name: "demo.txt",
        path: "/workspace/demo.txt",
        type: "text",
        mimeType: "text/plain",
        content: "demo",
      },
    });
    expect(preparedDirectory).toEqual({
      file: {
        name: "workspace",
        path: "/workspace",
        type: "directory",
      },
    });
    expect(readFile).toEqual({ content: "hello world" });
    expect(isDirectory).toEqual({ isDirectory: true });
    expect(imagePath).toEqual({ path: "/tmp/capture.png" });

    expect(daemonRouteMocks.invokeDaemonRoute).toHaveBeenCalledWith("workspace.register", {
      workspacePath: "/workspace",
      mode: "workspace",
    });
    expect(registerWorkspace).toEqual({ registered: true });
    expect(daemonRouteMocks.invokeDaemonRoute).toHaveBeenCalledWith("workspace.register", {
      workspacePath: "/workspace",
      mode: "workdir",
    });
    expect(registerWorkdir).toEqual({ registered: true });
    expect(readDirectory).toEqual({
      nodes: [
        {
          name: "src",
          path: "/workspace/src",
          isDirectory: true,
        },
      ],
    });
    expect(preview).toEqual({
      preview: expect.objectContaining({
        path: "/workspace/src/app.ts",
        name: "app.ts",
        relativePath: "src/app.ts",
      }),
    });
    expect(gitStatus).toEqual({
      state: {
        workspacePath: "/workspace",
        branch: "main",
        ahead: 0,
        behind: 0,
        changes: [],
      },
    });
    expect(gitDiff).toEqual({
      diff: {
        workspacePath: "/workspace",
        filePath: "/workspace/src/app.ts",
        relativePath: "src/app.ts",
        staged: "",
        unstaged: "diff --git a/src/app.ts b/src/app.ts",
      },
    });
    expect(resolution).toEqual({
      resolution: {
        path: "/workspace/docs/guide.md",
        name: "guide.md",
        relativePath: "docs/guide.md",
        workspaceRoot: "/workspace",
      },
    });
    expect(searchResult).toEqual({
      nodes: [
        {
          name: "app.ts",
          path: "/workspace/src/app.ts",
          isDirectory: false,
        },
      ],
    });
    expect(workspaceShell.openFile).toHaveBeenCalledWith("/workspace/src/app.ts");
    expect(openFileResult).toEqual({ opened: true });
    expect(workspaceShell.revealFileInFolder).toHaveBeenCalledWith("/workspace/src/app.ts");
    expect(revealResult).toEqual({ revealed: true });
    expect(daemonRouteMocks.invokeDaemonRoute).toHaveBeenCalledWith("workspace.unwatch", {
      workspacePath: "/workspace",
    });
    expect(unwatchResult).toEqual({ watching: false });
    expect(daemonRouteMocks.invokeDaemonRoute).toHaveBeenCalledWith("workspace.unregister", {
      workspacePath: "/workspace",
      mode: "workspace",
    });
    expect(unregisterResult).toEqual({ unregistered: true });
  });

  it("dispatches phase3 browser routes with host window context", async () => {
    const { runtime, yoBrowserPresenter } = createRuntime();

    const statusResult = await dispatchArgosRoute(
      runtime,
      "browser.getStatus",
      {
        sessionId: "session-1",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );
    const loadResult = await dispatchArgosRoute(
      runtime,
      "browser.loadUrl",
      {
        sessionId: "session-1",
        url: "https://example.com/docs",
        timeoutMs: 5000,
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );
    const attachResult = await dispatchArgosRoute(
      runtime,
      "browser.attachCurrentWindow",
      {
        sessionId: "session-1",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );
    const updateResult = await dispatchArgosRoute(
      runtime,
      "browser.updateCurrentWindowBounds",
      {
        sessionId: "session-1",
        bounds: {
          x: 10,
          y: 20,
          width: 400,
          height: 300,
        },
        visible: true,
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );
    const backResult = await dispatchArgosRoute(
      runtime,
      "browser.goBack",
      {
        sessionId: "session-1",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );
    const detachResult = await dispatchArgosRoute(
      runtime,
      "browser.detach",
      {
        sessionId: "session-1",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );
    const destroyResult = await dispatchArgosRoute(
      runtime,
      "browser.destroy",
      {
        sessionId: "session-1",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(statusResult).toEqual({
      status: expect.objectContaining({
        initialized: true,
        visible: true,
      }),
    });
    expect(yoBrowserPresenter.loadUrl).toHaveBeenCalledWith("session-1", "https://example.com/docs", 5000, 3);
    expect(loadResult).toEqual({
      status: expect.objectContaining({
        page: expect.objectContaining({
          id: "session-1-3",
          url: "https://example.com/docs",
        }),
      }),
    });
    expect(yoBrowserPresenter.attachSessionBrowser).toHaveBeenCalledWith("session-1", 3);
    expect(attachResult).toEqual({ attached: true });
    expect(yoBrowserPresenter.updateSessionBrowserBounds).toHaveBeenCalledWith(
      "session-1",
      3,
      {
        x: 10,
        y: 20,
        width: 400,
        height: 300,
      },
      true,
    );
    expect(updateResult).toEqual({ updated: true });
    expect(yoBrowserPresenter.goBack).toHaveBeenCalledWith("session-1");
    expect(backResult).toEqual({
      status: expect.objectContaining({
        initialized: true,
      }),
    });
    expect(yoBrowserPresenter.detachSessionBrowser).toHaveBeenCalledWith("session-1");
    expect(detachResult).toEqual({ detached: true });
    expect(yoBrowserPresenter.destroySessionBrowser).toHaveBeenCalledWith("session-1");
    expect(destroyResult).toEqual({ destroyed: true });
  });

  it("dispatches phase3 tab routes through the renderer tab adapter", async () => {
    const { runtime, tabPresenter } = createRuntime();

    const readyResult = await dispatchArgosRoute(
      runtime,
      "tab.notifyRendererReady",
      {},
      {
        webContentsId: 88,
        windowId: 3,
      },
    );
    const activatedResult = await dispatchArgosRoute(
      runtime,
      "tab.notifyRendererActivated",
      {
        sessionId: "session-1",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );
    const captureResult = await dispatchArgosRoute(
      runtime,
      "tab.captureCurrentArea",
      {
        rect: {
          x: 0,
          y: 0,
          width: 100,
          height: 80,
        },
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );
    const stitchResult = await dispatchArgosRoute(
      runtime,
      "tab.stitchImagesWithWatermark",
      {
        images: ["data:image/png;base64,1", "data:image/png;base64,2"],
        watermark: {
          isDark: false,
          version: "1.2.3",
          texts: {
            brand: "Argos",
          },
        },
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(tabPresenter.onRendererTabReady).toHaveBeenCalledWith(88);
    expect(readyResult).toEqual({ notified: true });
    expect(tabPresenter.onRendererTabActivated).toHaveBeenCalledWith("session-1");
    expect(activatedResult).toEqual({ notified: true });
    expect(tabPresenter.captureTabArea).toHaveBeenCalledWith(88, {
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    expect(captureResult).toEqual({
      imageData: "data:image/png;base64,capture",
    });
    expect(tabPresenter.stitchImagesWithWatermark).toHaveBeenCalledWith(
      ["data:image/png;base64,1", "data:image/png;base64,2"],
      {
        isDark: false,
        version: "1.2.3",
        texts: {
          brand: "Argos",
        },
      },
    );
    expect(stitchResult).toEqual({
      imageData: "data:image/png;base64,stitched",
    });
  });

  it("opens the settings window through the system route", async () => {
    const { runtime, windowPresenter } = createRuntime();

    const result = await dispatchArgosRoute(
      runtime,
      "system.openSettings",
      {
        routeName: "settings-display",
        section: "fonts",
      },
      {
        webContentsId: 88,
        windowId: 3,
      },
    );

    expect(windowPresenter.navigateToSettings).toHaveBeenCalledWith({
      routeName: "settings-display",
      params: undefined,
      section: "fonts",
    });
    expect(result).toEqual({ windowId: 9 });
  });
});
