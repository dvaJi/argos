// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();
  const connection = {
    resolve: null as null | (() => void),
    promise: null as null | Promise<void>,
  };
  const bridgeInstances: Array<{
    url: string;
    connect: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];

  const createBridgeMock = vi.fn(() => ({
    invoke: vi.fn(),
    on: vi.fn(() => () => {}),
  }));

  class MockWebSocketBridge {
    readonly url: string;
    readonly connect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          connection.resolve = resolve;
          connection.promise = new Promise<void>(() => {});
        }),
    );
    readonly close = vi.fn();

    constructor(url: string) {
      this.url = url;
      bridgeInstances.push({
        url,
        connect: this.connect,
        close: this.close,
      });
    }

    getUrl(): string {
      return this.url;
    }

    isConnected(): boolean {
      return false;
    }

    onConnectionStateChange(): () => void {
      return () => {};
    }
  }

  class MockHybridBridge {
    constructor() {
      return hybridBridge as any;
    }
  }

  const hybridBridge = {
    setWsBridge: vi.fn(),
    setPendingBridgeConnection: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(() => () => {}),
    getConnectionState: vi.fn(() => ({
      mode: "local",
      url: null,
      connected: false,
      lastError: null,
    })),
    onConnectionStateChange: vi.fn(() => () => {}),
  };

  const workspaceConfig = {
    activeWorkspaceId: "remote-workspace",
    workspaces: [
      {
        id: "local",
        name: "Local",
        mode: "local",
        createdAt: 1,
      },
    ],
  };

  return {
    listeners,
    connection,
    bridgeInstances,
    createBridgeMock,
    MockWebSocketBridge,
    MockHybridBridge,
    hybridBridge,
    workspaceConfig,
  };
});

const ipcRendererMock = {
  on: vi.fn((channel: string, listener: (...args: any[]) => void) => {
    const next = state.listeners.get(channel) ?? [];
    next.push(listener);
    state.listeners.set(channel, next);
  }),
  invoke: vi.fn((channel: string) => {
    if (channel === "get-daemon-port") {
      return Promise.resolve({ port: 4321, host: "127.0.0.1" });
    }
    return Promise.resolve(null);
  }),
  sendSync: vi.fn((channel: string) => {
    if (channel === "get-web-contents-id") return 42;
    if (channel === "get-window-id") return 7;
    return undefined;
  }),
};

vi.mock("electron", () => ({
  clipboard: {
    writeText: vi.fn(),
    writeImage: vi.fn(),
    readText: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  nativeImage: {
    createFromDataURL: vi.fn(),
  },
  webUtils: {
    getPathForFile: vi.fn(),
  },
  webFrame: {
    setVisualZoomLevelLimits: vi.fn(),
  },
  ipcRenderer: ipcRendererMock,
  shell: {
    openExternal: vi.fn(),
  },
}));

vi.mock("@electron-toolkit/preload", () => ({
  exposeElectronAPI: vi.fn(),
}));

vi.mock("@argos/shared/externalUrl", () => ({
  normalizeExternalUrl: (url: string) => url,
}));

vi.mock("@argos/shared/workspaceConfig", () => ({
  LOCAL_WORKSPACE_ID: "local",
  readWorkspaceConfig: () => state.workspaceConfig,
  writeWorkspaceConfig: vi.fn(),
  notifyWorkspaceConfigChanged: vi.fn(),
  buildRemoteWsUrl: (remoteUrl: string) => `ws://${remoteUrl.replace(/^https?:\/\//, "")}`,
}));

vi.mock("#/events", () => ({
  DAEMON_EVENTS: {
    SIDECAR_PORT_ASSIGNED: "daemon.sidecar.portAssigned",
    SIDECAR_STATUS_CHANGED: "daemon.sidecar.statusChanged",
  },
}));

vi.mock("../../../src/preload/createBridge", () => ({
  createBridge: state.createBridgeMock,
}));

vi.mock("../../../src/preload/hybridBridge", () => ({
  HybridBridge: state.MockHybridBridge,
}));

vi.mock("@argos/client-sdk", () => ({
  WebSocketBridge: state.MockWebSocketBridge,
}));

describe("preload local daemon connection", () => {
  beforeEach(() => {
    vi.resetModules();
    state.listeners.clear();
    state.bridgeInstances.length = 0;
    state.connection.resolve = null;
    state.connection.promise = null;
    state.workspaceConfig.activeWorkspaceId = "local";
    ipcRendererMock.invoke.mockReset();
    ipcRendererMock.on.mockClear();
    ipcRendererMock.sendSync.mockClear();
    ipcRendererMock.invoke.mockImplementation((channel: string) => {
      if (channel === "get-daemon-port") {
        return Promise.resolve({ port: 4321, host: "127.0.0.1" });
      }
      return Promise.resolve(null);
    });
    state.createBridgeMock.mockClear();
    state.hybridBridge.setWsBridge.mockClear();
    state.hybridBridge.setPendingBridgeConnection.mockClear();
    state.hybridBridge.invoke.mockClear();
    state.hybridBridge.on.mockClear();
    state.hybridBridge.getConnectionState.mockClear();
    state.hybridBridge.onConnectionStateChange.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent local-daemon connects when lifecycle events overlap", async () => {
    await import("../../../src/preload/index");
    await Promise.resolve();
    await Promise.resolve();

    const portAssignedListeners = state.listeners.get("daemon.sidecar.portAssigned") ?? [];
    const statusChangedListeners = state.listeners.get("daemon.sidecar.statusChanged") ?? [];
    expect(portAssignedListeners).toHaveLength(1);
    expect(statusChangedListeners).toHaveLength(1);

    portAssignedListeners[0]?.({}, { port: 4321 });
    statusChangedListeners[0]?.({}, { status: "healthy" });

    await Promise.resolve();
    await Promise.resolve();

    expect(state.bridgeInstances).toHaveLength(1);
    expect(state.bridgeInstances[0]?.url).toBe("ws://127.0.0.1:4321");
    expect(state.bridgeInstances[0]?.connect).toHaveBeenCalledTimes(1);
    expect(state.hybridBridge.setWsBridge).toHaveBeenCalledTimes(1);

    state.connection.resolve?.();
    await Promise.resolve();
    await Promise.resolve();
  });
});
