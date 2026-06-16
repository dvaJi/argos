import { beforeEach, describe, expect, it, vi } from "vitest";

const setMcpServerEnabledMutate = vi.hoisted(() => vi.fn<(...args: any[]) => any>());

const mcpClientMock = vi.hoisted(() => ({
  getMcpServers: vi.fn<(...args: any[]) => any>().mockResolvedValue({}),
  getMcpEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
  getAllPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  startServer: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  stopServer: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  isServerRunning: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
  getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  getMcpClients: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  getAllResources: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
}));

const configPresenterMock = vi.hoisted(() => ({
  getCustomPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  getSetting: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  setSetting: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  onCustomPromptsChanged: vi.fn<(...args: any[]) => any>(() => vi.fn<(...args: any[]) => any>()),
}));

const createQueryState = () => ({
  data: { value: undefined },
  error: { value: null },
  isLoading: { value: false },
  isFetching: { value: false },
  isRefreshing: { value: false },
  refresh: vi.fn<(...args: any[]) => any>(async () => ({ status: "success", data: undefined })),
  refetch: vi.fn<(...args: any[]) => any>(async () => ({ status: "success", data: undefined })),
});

vi.mock("@api/McpClient", () => ({
  createMcpClient: vi.fn<(...args: any[]) => any>(() => mcpClientMock),
}));

vi.mock("../../../src/renderer/api/ConfigClient", () => ({
  createConfigClient: vi.fn<(...args: any[]) => any>(() => configPresenterMock),
}));

vi.mock("@/composables/useIpcMutation", () => ({
  useIpcMutation: (options: { mutation?: (...args: any[]) => unknown }) => ({
    mutateAsync: options.mutation?.toString().includes("setMcpServerEnabled")
      ? setMcpServerEnabledMutate
      : vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/composables/useIpcQuery", () => ({
  useIpcQuery: () => createQueryState(),
}));

vi.mock("@/events", () => ({
  MCP_EVENTS: {
    SERVER_STARTED: "server-started",
    SERVER_STOPPED: "server-stopped",
    CONFIG_CHANGED: "config-changed",
    SERVER_STATUS_CHANGED: "server-status-changed",
    TOOL_CALL_RESULT: "tool-call-result",
  },
}));

const setupStore = async () => {
  vi.resetModules();
  const { useMcpStore } = await import("@/stores/mcp");
  return useMcpStore();
};

describe("useMcpStore toggleServer rollback", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setMcpServerEnabledMutate.mockReset();
    mcpClientMock.startServer.mockClear();
    mcpClientMock.stopServer.mockClear();
  });

  it("restores local state and persisted config when runtime sync fails", async () => {
    const store = await setupStore();

    store.config = {
      mcpServers: {
        demo: {
          command: "demo-command",
          args: [],
          env: {},
          descriptions: "Demo server",
          icons: "D",
          autoApprove: [],
          disable: false,
          type: "stdio",
          enabled: false,
        },
      },
      mcpEnabled: true,
      ready: true,
    };

    setMcpServerEnabledMutate.mockRejectedValueOnce(new Error("runtime failed"));
    setMcpServerEnabledMutate.mockResolvedValueOnce(undefined);

    const result = await store.toggleServer("demo");

    expect(result).toBe(false);
    expect(store.config.mcpServers.demo.enabled).toBe(false);
    expect(store.serverLoadingStates.demo).toBe(false);
    expect(setMcpServerEnabledMutate).toHaveBeenNthCalledWith(1, ["demo", true]);
    expect(setMcpServerEnabledMutate).toHaveBeenNthCalledWith(2, ["demo", false]);
    expect(mcpClientMock.startServer).not.toHaveBeenCalled();
    expect(mcpClientMock.stopServer).not.toHaveBeenCalled();
  });

  it("hides enabled servers when MCP is globally disabled", async () => {
    const store = await setupStore();

    store.config = {
      mcpServers: {
        demo: {
          command: "demo-command",
          args: [],
          env: {},
          descriptions: "Demo server",
          icons: "D",
          autoApprove: [],
          disable: false,
          type: "stdio",
          enabled: true,
        },
        "cua-driver": {
          command: "/mock/cua-driver",
          args: ["mcp"],
          env: {},
          descriptions: "Computer Use",
          icons: "plugin",
          autoApprove: [],
          disable: false,
          type: "stdio",
          enabled: true,
          source: "plugin",
          sourceId: "com.argos.plugins.cua",
          ownerPluginId: "com.argos.plugins.cua",
        },
      },
      mcpEnabled: false,
      ready: true,
    };

    expect(store.serverList).toHaveLength(1);
    expect(store.pluginServerList.map((server) => server.name)).toEqual(["cua-driver"]);
    expect(store.enabledServers).toEqual([]);
    expect(store.enabledPluginServers.map((server) => server.name)).toEqual(["cua-driver"]);
    expect(store.enabledServerCount).toBe(0);
  });

  it("hides plugin-owned servers from MCP UI lists", async () => {
    const store = await setupStore();

    store.config = {
      mcpServers: {
        demo: {
          command: "demo-command",
          args: [],
          env: {},
          descriptions: "Demo server",
          icons: "D",
          autoApprove: [],
          disable: false,
          type: "stdio",
          enabled: true,
        },
        "cua-driver": {
          command: "/Applications/Argos Computer Use.app/Contents/MacOS/cua-driver",
          args: ["mcp"],
          env: {},
          descriptions: "Computer Use",
          icons: "plugin",
          autoApprove: [],
          disable: false,
          type: "stdio",
          enabled: true,
          source: "plugin",
          sourceId: "com.argos.plugins.cua",
          ownerPluginId: "com.argos.plugins.cua",
        },
      },
      mcpEnabled: true,
      ready: true,
    };

    expect(store.serverList.map((server) => server.name)).toEqual(["demo"]);
    expect(store.pluginServerList.map((server) => server.name)).toEqual(["cua-driver"]);
    expect(store.enabledServers.map((server) => server.name)).toEqual(["demo"]);
    expect(store.enabledPluginServers.map((server) => server.name)).toEqual(["cua-driver"]);
    expect(store.enabledServerCount).toBe(1);
    expect(store.config.mcpServers["cua-driver"]).toBeDefined();
  });
});
