import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MCPServerConfig } from "@argos/shared/presenter";

const mcpClientMock = vi.hoisted(() => ({
  getMcpServers: vi.fn<(...args: any[]) => any>().mockResolvedValue({}),
  getMcpEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
  getAllPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  setMcpServerEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
  startServer: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  stopServer: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  isServerRunning: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
  getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  getMcpClients: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  getAllResources: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
}));

const configClientMock = vi.hoisted(() => ({
  getCustomPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  getSetting: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  setSetting: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  onCustomPromptsChanged: vi.fn<(...args: any[]) => any>(() => () => {}),
}));

vi.mock("#api/McpClient", () => ({ createMcpClient: () => mcpClientMock }));
vi.mock("#api/ConfigClient", () => ({ createConfigClient: () => configClientMock }));

const demoConfig = (enabled: boolean): MCPServerConfig => ({
  command: "demo-command",
  args: [],
  env: {},
  descriptions: "Demo server",
  icons: "D",
  autoApprove: [],
  disable: false,
  type: "stdio",
  enabled,
});

async function setup(enabled = false) {
  vi.resetModules();
  const module = await import("#/stores/mcp");
  module.mcpStore.setState(() => ({
    config: { mcpServers: { demo: demoConfig(enabled) }, mcpEnabled: true, ready: true },
    mcpInstallCache: null,
    serverStatuses: { demo: false },
    serverLoadingStates: {},
    serverErrors: {},
    configLoading: false,
    toolLoadingStates: {},
    toolInputs: {},
    toolResults: {},
    enabledToolNames: [],
    tools: [],
    toolsLoading: false,
    toolsError: false,
    toolsErrorMessage: "",
    clients: [],
    resources: [],
    prompts: [],
  }));
  return module;
}

describe("MCP server lifecycle store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpClientMock.setMcpServerEnabled.mockResolvedValue(true);
    mcpClientMock.startServer.mockResolvedValue(undefined);
    mcpClientMock.stopServer.mockResolvedValue(undefined);
    mcpClientMock.isServerRunning.mockResolvedValue(false);
  });

  it("rolls back the enabled preference when persistence fails", async () => {
    const store = await setup(false);
    mcpClientMock.setMcpServerEnabled.mockRejectedValueOnce(new Error("persist failed"));

    await expect(store.toggleServer("demo")).resolves.toBe(false);

    expect(store.mcpStore.state.config.mcpServers.demo.enabled).toBe(false);
    expect(mcpClientMock.startServer).not.toHaveBeenCalled();
    expect(store.mcpStore.state.serverErrors.demo).toBe("persist failed");
  });

  it("starts a server after enabling it", async () => {
    const store = await setup(false);
    mcpClientMock.isServerRunning.mockResolvedValue(true);

    await expect(store.toggleServer("demo")).resolves.toBe(true);

    expect(mcpClientMock.setMcpServerEnabled).toHaveBeenCalledWith("demo", true);
    expect(mcpClientMock.startServer).toHaveBeenCalledWith("demo");
    expect(store.mcpStore.state.serverStatuses.demo).toBe(true);
  });

  it("keeps the enabled preference and exposes the runtime error when startup fails", async () => {
    const store = await setup(false);
    mcpClientMock.startServer.mockRejectedValueOnce(new Error("command not found"));

    await expect(store.toggleServer("demo")).resolves.toBe(false);

    expect(store.mcpStore.state.config.mcpServers.demo.enabled).toBe(true);
    expect(store.mcpStore.state.serverErrors.demo).toBe("command not found");
    expect(store.mcpStore.state.serverLoadingStates.demo).toBe(false);
  });

  it("directly starts an enabled but stopped server", async () => {
    const store = await setup(true);
    mcpClientMock.isServerRunning.mockResolvedValue(true);

    await expect(store.setServerRunning("demo", true)).resolves.toEqual({ success: true });

    expect(mcpClientMock.setMcpServerEnabled).not.toHaveBeenCalled();
    expect(mcpClientMock.startServer).toHaveBeenCalledWith("demo");
    expect(store.mcpStore.state.serverStatuses.demo).toBe(true);
  });

  it("enables a disabled server before a direct start", async () => {
    const store = await setup(false);

    await expect(store.setServerRunning("demo", true)).resolves.toEqual({ success: true });

    expect(mcpClientMock.setMcpServerEnabled).toHaveBeenCalledWith("demo", true);
    expect(mcpClientMock.startServer).toHaveBeenCalledWith("demo");
    expect(store.mcpStore.state.config.mcpServers.demo.enabled).toBe(true);
  });
});
