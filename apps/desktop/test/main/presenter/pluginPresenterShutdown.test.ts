import { describe, expect, it, vi } from "vitest";
import { PluginPresenter } from "../../../src/main/presenter/pluginPresenter";

vi.mock("electron", () => ({
  app: { getAppPath: vi.fn<(...args: any[]) => any>(() => "/mock/app") },
}));

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn<(...args: any[]) => any>(), send: vi.fn<(...args: any[]) => any>() },
  SendTarget: { ALL_WINDOWS: "ALL_WINDOWS" },
}));

vi.mock("../../../src/main/presenter/pluginPresenter/toolPolicyStore", () => ({
  registerPluginToolPolicy: vi.fn<(...args: any[]) => any>(),
  unregisterPluginToolPolicies: vi.fn<(...args: any[]) => any>(),
}));

const createPresenter = (servers: Record<string, any>, isRunning: (name: string) => boolean) => {
  const mcpPresenter = {
    isServerRunning: vi.fn<(...args: any[]) => any>(async (name: string) => isRunning(name)),
    stopServer: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  } as any;
  const configPresenter = {
    getMcpServers: vi.fn<(...args: any[]) => any>().mockResolvedValue(servers),
  } as any;
  const presenter = new PluginPresenter({
    configPresenter,
    mcpPresenter,
    skillPresenter: {} as any,
    platform: "darwin",
    appPath: "/mock/app",
    isPackaged: false,
    resourcesPath: "/mock/resources",
  });
  return { presenter, mcpPresenter };
};

describe("PluginPresenter#shutdown", () => {
  it("stops running plugin-owned servers without removing saved config", async () => {
    const { presenter, mcpPresenter } = createPresenter(
      {
        "manual-server": { source: "manual" },
        "plugin-running": { source: "plugin", sourceId: "com.argos.plugins.fixture" },
        "plugin-stopped": { source: "plugin", sourceId: "com.argos.plugins.other" },
      },
      (name) => name !== "plugin-stopped",
    );

    await presenter.shutdown();

    expect(mcpPresenter.stopServer).toHaveBeenCalledTimes(1);
    expect(mcpPresenter.stopServer).toHaveBeenCalledWith("plugin-running");
  });

  it("continues shutdown when a plugin-owned server fails to stop", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { presenter, mcpPresenter } = createPresenter(
      {
        "plugin-first": { source: "plugin", sourceId: "com.argos.plugins.first" },
        "plugin-second": { source: "plugin", sourceId: "com.argos.plugins.second" },
      },
      () => true,
    );
    mcpPresenter.stopServer.mockImplementation(async (name: string) => {
      if (name === "plugin-first") {
        throw new Error("first failed");
      }
    });

    await presenter.shutdown();

    expect(mcpPresenter.stopServer).toHaveBeenCalledWith("plugin-first");
    expect(mcpPresenter.stopServer).toHaveBeenCalledWith("plugin-second");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[PluginHost] Failed to stop plugin-owned MCP server during shutdown:",
      expect.objectContaining({ serverName: "plugin-first", pluginId: "com.argos.plugins.first" }),
    );
    consoleWarnSpy.mockRestore();
  });
});
