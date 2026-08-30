import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import logger from "@argos/shared/logger";

vi.mock("@argos/shared/logger", async () => {
  const { mockSharedLogger } = await import("../../mocks/sharedLogger");
  return mockSharedLogger();
});

const serverManagerMocks = vi.hoisted(() => ({
  startServer: vi.fn<(...args: any[]) => any>(),
  stopServer: vi.fn<(...args: any[]) => any>(),
  isServerRunning: vi.fn<(...args: any[]) => any>(),
  getRunningClients: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  testNpmRegistrySpeed: vi.fn<(...args: any[]) => any>().mockResolvedValue("https://registry.npmjs.org/"),
  getNpmRegistry: vi.fn<(...args: any[]) => any>().mockReturnValue("https://registry.npmjs.org/"),
  updateNpmRegistryInBackground: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  loadRegistryFromCache: vi.fn<(...args: any[]) => any>(),
  refreshNpmRegistry: vi.fn<(...args: any[]) => any>().mockResolvedValue("https://registry.npmjs.org/"),
  getUvRegistry: vi.fn<(...args: any[]) => any>().mockReturnValue(null),
}));

const toolManagerMocks = vi.hoisted(() => ({
  getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  getRunningClients: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
}));

vi.mock("@argos/mcp-runtime/runtime/serverManager", () => ({
  ServerManager: vi.fn<(...args: any[]) => any>().mockImplementation(function () {
    return {
      startServer: serverManagerMocks.startServer,
      stopServer: serverManagerMocks.stopServer,
      isServerRunning: serverManagerMocks.isServerRunning,
      getRunningClients: serverManagerMocks.getRunningClients,
      testNpmRegistrySpeed: serverManagerMocks.testNpmRegistrySpeed,
      getNpmRegistry: serverManagerMocks.getNpmRegistry,
      updateNpmRegistryInBackground: serverManagerMocks.updateNpmRegistryInBackground,
      loadRegistryFromCache: serverManagerMocks.loadRegistryFromCache,
      refreshNpmRegistry: serverManagerMocks.refreshNpmRegistry,
      getUvRegistry: serverManagerMocks.getUvRegistry,
    };
  }),
}));

vi.mock("@argos/mcp-runtime/runtime/toolManager", () => ({
  ToolManager: vi.fn<(...args: any[]) => any>().mockImplementation(function () {
    return {
      getAllToolDefinitions: toolManagerMocks.getAllToolDefinitions,
      getRunningClients: toolManagerMocks.getRunningClients,
    };
  }),
}));

vi.mock("@argos/mcp-runtime/config/mcprouterManager", () => ({
  McpRouterManager: vi.fn<(...args: any[]) => any>().mockImplementation(function () {
    return {};
  }),
}));

vi.mock("#/eventbus", () => ({
  eventBus: {
    send: vi.fn<(...args: any[]) => any>(),
    sendToRenderer: vi.fn<(...args: any[]) => any>(),
    on: vi.fn<(...args: any[]) => any>(),
    off: vi.fn<(...args: any[]) => any>(),
  },
  SendTarget: {
    ALL_WINDOWS: "ALL_WINDOWS",
  },
}));

vi.mock("#/events", () => ({
  CONFIG_EVENTS: { CONFIG_CHANGED: "config-changed", AGENTS_CHANGED: "agents-changed" },
  MCP_EVENTS: {
    SERVER_STARTED: "server-started",
    SERVER_STOPPED: "server-stopped",
    INITIALIZED: "initialized",
  },
  NOTIFICATION_EVENTS: {
    SHOW_ERROR: "show-error",
  },
}));

vi.mock("#/presenter", () => ({
  presenter: {
    configPresenter: {},
  },
}));

import { McpPresenter } from "../../../src/main/presenter/mcpPresenter";

describe("McpPresenter#setMcpServerEnabled", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    serverManagerMocks.startServer.mockResolvedValue(undefined);
    serverManagerMocks.stopServer.mockResolvedValue(undefined);
    serverManagerMocks.isServerRunning.mockReturnValue(false);
    serverManagerMocks.getRunningClients.mockResolvedValue([]);
    serverManagerMocks.testNpmRegistrySpeed.mockResolvedValue("https://registry.npmjs.org/");
    serverManagerMocks.updateNpmRegistryInBackground.mockResolvedValue(undefined);
    serverManagerMocks.refreshNpmRegistry.mockResolvedValue("https://registry.npmjs.org/");
    toolManagerMocks.getAllToolDefinitions.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const createConfigPresenter = (
    mcpEnabled: boolean,
    privacyModeEnabled = false,
    servers: Record<string, any> = {},
    enabledServers: string[] = [],
  ) =>
    ({
      setMcpServerEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      getMcpEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(mcpEnabled),
      setMcpEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      getMcpServers: vi.fn<(...args: any[]) => any>().mockResolvedValue(servers),
      getEnabledMcpServers: vi.fn<(...args: any[]) => any>().mockResolvedValue(enabledServers),
      getLanguage: vi.fn<(...args: any[]) => any>().mockReturnValue("en-US"),
      getPrivacyModeEnabled: vi.fn<(...args: any[]) => any>(() => privacyModeEnabled),
    }) as any;

  it("starts a server immediately after enabling it when MCP is active", async () => {
    const configPresenter = createConfigPresenter(true);
    const presenter = new McpPresenter(configPresenter);
    const startSpy = vi.spyOn<(...args: any[]) => any>(presenter, "startServer").mockResolvedValue(undefined);
    const stopSpy = vi.spyOn<(...args: any[]) => any>(presenter, "stopServer").mockResolvedValue(undefined);

    await presenter.setMcpServerEnabled("demo-server", true);

    expect(configPresenter.setMcpServerEnabled).toHaveBeenCalledWith("demo-server", true);
    expect(startSpy).toHaveBeenCalledWith("demo-server");
    expect(stopSpy).not.toHaveBeenCalled();
    expect(configPresenter.setMcpServerEnabled.mock.invocationCallOrder[0]).toBeLessThan(
      startSpy.mock.invocationCallOrder[0],
    );
  });

  it("stops a server immediately after disabling it when MCP is active", async () => {
    const configPresenter = createConfigPresenter(true);
    const presenter = new McpPresenter(configPresenter);
    const startSpy = vi.spyOn<(...args: any[]) => any>(presenter, "startServer").mockResolvedValue(undefined);
    const stopSpy = vi.spyOn<(...args: any[]) => any>(presenter, "stopServer").mockResolvedValue(undefined);

    await presenter.setMcpServerEnabled("demo-server", false);

    expect(configPresenter.setMcpServerEnabled).toHaveBeenCalledWith("demo-server", false);
    expect(stopSpy).toHaveBeenCalledWith("demo-server");
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("only persists config when MCP is globally disabled", async () => {
    const configPresenter = createConfigPresenter(false);
    const presenter = new McpPresenter(configPresenter);
    const startSpy = vi.spyOn<(...args: any[]) => any>(presenter, "startServer").mockResolvedValue(undefined);
    const stopSpy = vi.spyOn<(...args: any[]) => any>(presenter, "stopServer").mockResolvedValue(undefined);

    await presenter.setMcpServerEnabled("demo-server", true);

    expect(configPresenter.setMcpServerEnabled).toHaveBeenCalledWith("demo-server", true);
    expect(startSpy).not.toHaveBeenCalled();
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it("starts plugin-owned servers even when MCP is globally disabled", async () => {
    const configPresenter = createConfigPresenter(
      false,
      false,
      {
        regular: { enabled: true },
        plugin: { enabled: true, source: "plugin", ownerPluginId: "com.argos.fixture" },
      },
      ["regular", "plugin"],
    );
    const presenter = new McpPresenter(configPresenter);
    (presenter as any).serverManager = {
      startServer: serverManagerMocks.startServer,
      testNpmRegistrySpeed: serverManagerMocks.testNpmRegistrySpeed,
      getNpmRegistry: serverManagerMocks.getNpmRegistry,
      updateNpmRegistryInBackground: serverManagerMocks.updateNpmRegistryInBackground,
    };

    await presenter.initialize();

    expect(serverManagerMocks.startServer).toHaveBeenCalledTimes(1);
    expect(serverManagerMocks.startServer).toHaveBeenCalledWith("plugin");
  });

  it("does not start plugin-owned servers when enabling the global MCP switch", async () => {
    const configPresenter = createConfigPresenter(
      true,
      false,
      {
        regular: { enabled: true },
        plugin: { enabled: true, source: "plugin", ownerPluginId: "com.argos.fixture" },
      },
      ["regular", "plugin"],
    );
    const presenter = new McpPresenter(configPresenter);
    const startSpy = vi.spyOn<(...args: any[]) => any>(presenter, "startServer").mockResolvedValue(undefined);

    await presenter.setMcpEnabled(true);

    expect(configPresenter.setMcpEnabled).toHaveBeenCalledWith(true);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledWith("regular");
  });

  it("does not stop plugin-owned servers when disabling the global MCP switch", async () => {
    const configPresenter = createConfigPresenter(false, false, {
      regular: { enabled: true },
      plugin: { enabled: true, source: "plugin", ownerPluginId: "com.argos.fixture" },
    });
    serverManagerMocks.getRunningClients.mockResolvedValue([{ serverName: "regular" }, { serverName: "plugin" }]);
    const presenter = new McpPresenter(configPresenter);
    (presenter as any).serverManager = {
      getRunningClients: serverManagerMocks.getRunningClients,
    };
    const stopSpy = vi.spyOn<(...args: any[]) => any>(presenter, "stopServer").mockResolvedValue(undefined);

    await presenter.setMcpEnabled(false);

    expect(configPresenter.setMcpEnabled).toHaveBeenCalledWith(false);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledWith("regular");
  });

  it("keeps plugin-owned tool definitions available when MCP is globally disabled", async () => {
    const configPresenter = createConfigPresenter(false, false, {
      regular: { enabled: true },
      plugin: { enabled: true, source: "plugin", ownerPluginId: "com.argos.fixture" },
    });
    toolManagerMocks.getAllToolDefinitions.mockResolvedValueOnce([
      {
        type: "function",
        function: {
          name: "regular_tool",
          description: "",
          parameters: { type: "object", properties: {} },
        },
        server: { name: "regular", icons: "", description: "" },
      },
      {
        type: "function",
        function: {
          name: "plugin_tool",
          description: "",
          parameters: { type: "object", properties: {} },
        },
        server: { name: "plugin", icons: "", description: "" },
      },
    ]);
    const presenter = new McpPresenter(configPresenter);
    (presenter as any).toolManager = {
      getAllToolDefinitions: toolManagerMocks.getAllToolDefinitions,
    };

    const tools = await presenter.getAllToolDefinitions();

    expect(tools.map((tool) => tool.function.name)).toEqual(["plugin_tool"]);
  });

  it("rejects when the runtime transition fails after persisting config", async () => {
    const configPresenter = createConfigPresenter(true);
    const presenter = new McpPresenter(configPresenter);
    const runtimeError = new Error("runtime failed");

    vi.spyOn<(...args: any[]) => any>(presenter, "startServer").mockRejectedValue(runtimeError);

    await expect(presenter.setMcpServerEnabled("demo-server", true)).rejects.toThrow("runtime failed");
    expect(configPresenter.setMcpServerEnabled).toHaveBeenCalledWith("demo-server", true);
  });

  it("skips automatic npm registry probing in privacy mode and keeps manual refresh available", async () => {
    const configPresenter = createConfigPresenter(true, true);
    const presenter = new McpPresenter(configPresenter);
    (presenter as any).serverManager.refreshNpmRegistry = serverManagerMocks.refreshNpmRegistry;

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5000);

    expect(serverManagerMocks.testNpmRegistrySpeed).not.toHaveBeenCalled();
    expect(serverManagerMocks.updateNpmRegistryInBackground).not.toHaveBeenCalled();

    await presenter.refreshNpmRegistry();

    expect(serverManagerMocks.refreshNpmRegistry).toHaveBeenCalledTimes(1);
  });
});

describe("McpPresenter#shutdown", () => {
  const createConfigPresenter = () =>
    ({
      getMcpServers: vi.fn<(...args: any[]) => any>().mockResolvedValue({}),
      getMcpEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
      setMcpServerEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      getLanguage: vi.fn<(...args: any[]) => any>().mockReturnValue("en-US"),
    }) as any;

  beforeEach(() => {
    serverManagerMocks.stopServer.mockResolvedValue(undefined);
    serverManagerMocks.isServerRunning.mockResolvedValue(false);
    serverManagerMocks.getRunningClients.mockResolvedValue([]);
  });

  it("stops all running clients during shutdown and continues after a stop failure", async () => {
    const presenter = new McpPresenter(createConfigPresenter());
    serverManagerMocks.getRunningClients.mockResolvedValue([{ serverName: "first" }, { serverName: "second" }]);
    // Order-independent (shutdown stops in parallel): reject only for "first".
    serverManagerMocks.stopServer.mockImplementation(async (serverName: string) => {
      if (serverName === "first") {
        throw new Error("first failed");
      }
    });

    await presenter.shutdown();

    expect(serverManagerMocks.stopServer).toHaveBeenCalledWith("first");
    expect(serverManagerMocks.stopServer).toHaveBeenCalledWith("second");
    expect(logger.error).toHaveBeenCalledWith("[Mcp] Failed to stop server first during shutdown:", expect.any(Error));
  });

  it("does not reject when there are no running clients", async () => {
    const presenter = new McpPresenter(createConfigPresenter());
    serverManagerMocks.getRunningClients.mockResolvedValue([]);

    await expect(presenter.shutdown()).resolves.toBeUndefined();
    expect(serverManagerMocks.stopServer).not.toHaveBeenCalled();
  });
});
