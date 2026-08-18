import { beforeEach, describe, expect, it, mock, vi } from "bun:test";

const runtimeMocks = {
  startServer: vi.fn<(serverName: string) => Promise<void>>(),
};

mock.module("@argos/mcp-runtime", () => ({
  ServerManager: class {
    startServer = runtimeMocks.startServer;
  },
  ToolManager: class {},
}));

const { DaemonMcpRuntime } = await import("../src/host/daemonMcpRuntime");

describe("DaemonMcpRuntime startup", () => {
  beforeEach(() => {
    runtimeMocks.startServer.mockReset();
    runtimeMocks.startServer.mockResolvedValue(undefined);
  });

  it("starts enabled non-plugin servers and isolates failures", async () => {
    runtimeMocks.startServer.mockImplementation(async (serverName) => {
      if (serverName === "broken") throw new Error("missing command");
    });
    const configPresenter = {
      getMcpEnabled: vi.fn(async () => true),
      getMcpServers: vi.fn(async () => ({
        Artifacts: { enabled: true, type: "inmemory" },
        broken: { enabled: true, type: "stdio" },
        disabled: { enabled: false, type: "stdio" },
        plugin: { enabled: true, type: "stdio", source: "plugin", ownerPluginId: "plugin-1" },
      })),
    };
    const runtime = new DaemonMcpRuntime(configPresenter as never, {} as never);

    const result = await runtime.startEnabledServers();

    expect(runtimeMocks.startServer).toHaveBeenCalledWith("Artifacts");
    expect(runtimeMocks.startServer).toHaveBeenCalledWith("broken");
    expect(runtimeMocks.startServer).not.toHaveBeenCalledWith("disabled");
    expect(runtimeMocks.startServer).not.toHaveBeenCalledWith("plugin");
    expect(result.started).toEqual(["Artifacts"]);
    expect(result.failed).toEqual([{ serverName: "broken", error: "missing command" }]);
  });

  it("does nothing while MCP is globally disabled", async () => {
    const configPresenter = {
      getMcpEnabled: vi.fn(async () => false),
      getMcpServers: vi.fn(),
    };
    const runtime = new DaemonMcpRuntime(configPresenter as never, {} as never);

    await expect(runtime.startEnabledServers()).resolves.toEqual({ started: [], failed: [] });
    expect(configPresenter.getMcpServers).not.toHaveBeenCalled();
    expect(runtimeMocks.startServer).not.toHaveBeenCalled();
  });
});
