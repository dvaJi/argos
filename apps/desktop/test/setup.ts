import { vi, beforeEach, afterEach } from "vitest";
import { __resetElectronMockState } from "./mocks/electron";

const electronMockState = vi.hoisted(() => ({
  loginItemSettings: { openAtLogin: false },
}));

type ArgosPayload = Record<string, unknown> | undefined;

function getDefaultArgosInvokeResult(routeName: string, payload: ArgosPayload = {}): Record<string, unknown> {
  switch (routeName) {
    case "browser.getStatus":
    case "browser.loadUrl":
    case "browser.goBack":
    case "browser.goForward":
    case "browser.reload":
      return { status: null };
    case "browser.attachCurrentWindow":
      return { attached: true };
    case "browser.updateCurrentWindowBounds":
      return { updated: true };
    case "browser.detach":
      return { detached: true };
    case "browser.destroy":
      return { destroyed: true };
    case "workspace.readDirectory":
    case "workspace.expandDirectory":
    case "workspace.searchFiles":
      return { nodes: [] };
    case "workspace.readFilePreview":
      return { preview: null };
    case "workspace.resolveMarkdownLinkedFile":
      return { resolution: null };
    case "workspace.getGitStatus":
      return { state: null };
    case "workspace.getGitDiff":
      return { diff: "" };
    case "file.getMimeType":
      return { mimeType: "text/plain" };
    case "file.prepareFile":
    case "file.prepareDirectory":
      return {
        file: {
          path: typeof payload?.path === "string" ? payload.path : "",
          name: "mock-file",
        },
      };
    case "file.readFile":
      return { content: "" };
    case "file.isDirectory":
      return { isDirectory: false };
    case "file.writeImageBase64":
      return { path: "/tmp/mock-image.png" };
    case "device.getInfo":
      return {
        info: {
          platform: "darwin",
          arch: "arm64",
          version: "14.0.0",
        },
      };
    case "device.getAppVersion":
      return { version: "1.0.0-test" };
    case "device.selectDirectory":
      return { canceled: true, filePaths: [] };
    case "device.restartApp":
      return { restarted: true };
    case "device.sanitizeSvg":
      return {
        content: typeof payload?.svgContent === "string" ? payload.svgContent : "",
      };
    default:
      return {};
  }
}

function installRendererTestGlobals(): void {
  if (typeof window === "undefined") {
    return;
  }

  (window as any).electron = {
    ipcRenderer: {
      invoke: vi.fn<(...args: any[]) => any>(),
      on: vi.fn<(...args: any[]) => any>(),
      removeAllListeners: vi.fn<(...args: any[]) => any>(),
      removeListener: vi.fn<(...args: any[]) => any>(),
      send: vi.fn<(...args: any[]) => any>(),
    },
  };

  (window as any).api = {
    copyImage: vi.fn<(...args: any[]) => any>(),
    copyText: vi.fn<(...args: any[]) => any>(),
    formatPathForInput: vi.fn<(...args: any[]) => any>((value: string) => value),
    getPathForFile: vi.fn<(...args: any[]) => any>(() => ""),
    getWebContentsId: vi.fn<(...args: any[]) => any>(() => 1),
    getWindowId: vi.fn<(...args: any[]) => any>(() => 1),
    openExternal: vi.fn<(...args: any[]) => any>(),
    readClipboardText: vi.fn<(...args: any[]) => any>(() => ""),
    toRelativePath: vi.fn<(...args: any[]) => any>((filePath: string) => filePath),
  };

  (window as any).argos = {
    invoke: vi.fn<(...args: any[]) => any>((routeName: string, payload?: Record<string, unknown>) =>
      Promise.resolve(getDefaultArgosInvokeResult(routeName, payload)),
    ),
    on: vi.fn<(...args: any[]) => any>(() => vi.fn<(...args: any[]) => any>()),
  };
}

// Mock Electron modules for testing
vi.mock("electron", () => ({
  __resetElectronMockState: vi.fn<(...args: any[]) => any>(() => {
    electronMockState.loginItemSettings = { openAtLogin: false };
  }),
  app: {
    getName: vi.fn<(...args: any[]) => any>(() => "Argos"),
    getVersion: vi.fn<(...args: any[]) => any>(() => "0.2.3"),
    getAppPath: vi.fn<(...args: any[]) => any>(() => "/mock/app"),
    getPath: vi.fn<(...args: any[]) => any>(() => "/mock/path"),
    isPackaged: false,
    getLoginItemSettings: vi.fn<(...args: any[]) => any>(() => ({ ...electronMockState.loginItemSettings })),
    setLoginItemSettings: vi.fn<(...args: any[]) => any>((settings: { openAtLogin?: boolean }) => {
      electronMockState.loginItemSettings = {
        ...electronMockState.loginItemSettings,
        ...settings,
      };
    }),
    on: vi.fn<(...args: any[]) => any>(),
    quit: vi.fn<(...args: any[]) => any>(),
    isReady: vi.fn<(...args: any[]) => any>(() => true),
  },
  BrowserWindow: vi.fn<(...args: any[]) => any>(() => ({
    loadURL: vi.fn<(...args: any[]) => any>(),
    loadFile: vi.fn<(...args: any[]) => any>(),
    on: vi.fn<(...args: any[]) => any>(),
    webContents: {
      send: vi.fn<(...args: any[]) => any>(),
      on: vi.fn<(...args: any[]) => any>(),
      setWindowOpenHandler: vi.fn<(...args: any[]) => any>(),
      isDestroyed: vi.fn<(...args: any[]) => any>(() => false),
    },
    isDestroyed: vi.fn<(...args: any[]) => any>(() => false),
    close: vi.fn<(...args: any[]) => any>(),
    show: vi.fn<(...args: any[]) => any>(),
    focus: vi.fn<(...args: any[]) => any>(),
    hide: vi.fn<(...args: any[]) => any>(),
  })),
  ipcMain: {
    on: vi.fn<(...args: any[]) => any>(),
    handle: vi.fn<(...args: any[]) => any>(),
    removeHandler: vi.fn<(...args: any[]) => any>(),
  },
  ipcRenderer: {
    invoke: vi.fn<(...args: any[]) => any>(),
    on: vi.fn<(...args: any[]) => any>(),
    removeAllListeners: vi.fn<(...args: any[]) => any>(),
    send: vi.fn<(...args: any[]) => any>(),
  },
  shell: {
    openExternal: vi.fn<(...args: any[]) => any>(),
  },
}));

// Mock file system operations
vi.mock("fs", () => {
  const mockedFs = {
    existsSync: vi.fn<(...args: any[]) => any>(),
    statSync: vi.fn<(...args: any[]) => any>(),
    accessSync: vi.fn<(...args: any[]) => any>(),
    readFileSync: vi.fn<(...args: any[]) => any>(),
    writeFileSync: vi.fn<(...args: any[]) => any>(),
    mkdirSync: vi.fn<(...args: any[]) => any>(),
    readdirSync: vi.fn<(...args: any[]) => any>(),
    renameSync: vi.fn<(...args: any[]) => any>(),
    constants: {
      X_OK: 1,
    },
    promises: {
      access: vi.fn<(...args: any[]) => any>(),
      readFile: vi.fn<(...args: any[]) => any>(),
      writeFile: vi.fn<(...args: any[]) => any>(),
      mkdir: vi.fn<(...args: any[]) => any>(),
      readdir: vi.fn<(...args: any[]) => any>(),
      stat: vi.fn<(...args: any[]) => any>(),
    },
  };

  return {
    __esModule: true,
    ...mockedFs,
    default: mockedFs,
  };
});

// Mock path module
vi.mock("path", async () => {
  const actual = await vi.importActual("path");
  return {
    ...actual,
    join: vi.fn<(...args: any[]) => any>((...args) => args.join("/")),
    resolve: vi.fn<(...args: any[]) => any>((...args) => args.join("/")),
  };
});

installRendererTestGlobals();

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
  electronMockState.loginItemSettings = { openAtLogin: false };
  __resetElectronMockState();
  installRendererTestGlobals();
});

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks();
});
