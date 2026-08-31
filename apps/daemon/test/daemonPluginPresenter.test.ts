import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "bun:test";
import { PluginRuntimeRegistry } from "@argos/mcp-runtime";
import { DaemonPluginPresenter } from "../src/host/daemonPluginPresenter";

describe("DaemonPluginPresenter", () => {
  const cleanupRoots: string[] = [];

  afterEach(() => {
    while (cleanupRoots.length > 0) {
      const root = cleanupRoots.pop();
      if (root) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  function createPresenter() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-plugin-"));
    cleanupRoots.push(root);

    const configPresenter = {
      getMcpServers: vi.fn(async () => ({
        "fixture-server": { ownerPluginId: "fixture-plugin", source: "plugin", sourceId: "fixture-plugin" },
      })),
      addMcpServer: vi.fn(),
      updateMcpServer: vi.fn(),
      removeMcpServer: vi.fn(),
    };
    const mcpPresenter = {
      startServer: vi.fn(),
      stopServer: vi.fn(async () => undefined),
      isServerRunning: vi.fn(() => true),
      getServerLastError: vi.fn(() => undefined),
    };
    const skillPresenter = {
      registerPluginSkill: vi.fn(),
      unregisterPluginSkillsByOwner: vi.fn(),
    };
    const pluginRuntime = new PluginRuntimeRegistry({
      isServerRunning: () => false,
      startServer: vi.fn(),
      stopServer: vi.fn(),
    } as never);

    const presenter = new DaemonPluginPresenter({
      configPresenter: configPresenter as never,
      mcpPresenter: mcpPresenter as never,
      skillPresenter: skillPresenter as never,
      pluginRuntime,
      configDir: root,
      dataDir: root,
      appVersion: "1.0.0",
    });

    return { presenter, configPresenter, mcpPresenter, skillPresenter, pluginRuntime, root };
  }

  it("skips eager auto-start for on-demand plugin MCP servers", async () => {
    const { presenter, mcpPresenter, pluginRuntime } = createPresenter();

    pluginRuntime.registerServer({
      pluginId: "fixture-plugin",
      serverName: "fixture-server",
      startMode: "onDemand",
      surfaces: ["tools"],
      toolCatalog: {
        version: "1.0.0-test",
        tools: [
          {
            name: "fixture_tool",
            description: "fixture",
            inputSchema: { type: "object", properties: {} },
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
          },
        ],
      },
    });

    await (
      presenter as unknown as { startPluginMcpServersIfReady(pluginId: string, serverNames: string[]): Promise<void> }
    ).startPluginMcpServersIfReady("fixture-plugin", ["fixture-server"]);

    expect(mcpPresenter.startServer).not.toHaveBeenCalled();
  });

  it("stops plugin-owned MCP servers during shutdown", async () => {
    const { presenter, mcpPresenter } = createPresenter();

    await presenter.shutdown();

    expect(mcpPresenter.stopServer).toHaveBeenCalledWith("fixture-server");
  });

  it("hosts plugin settings UI actions in daemon mode", async () => {
    const { presenter, root } = createPresenter();
    const settingsRoot = path.join(root, "settings");
    const assetsRoot = path.join(settingsRoot, "assets");
    fs.mkdirSync(assetsRoot, { recursive: true });
    fs.writeFileSync(path.join(settingsRoot, "index.html"), "<html></html>");
    fs.writeFileSync(path.join(assetsRoot, "index.js"), "console.log('settings')");
    vi.spyOn(presenter as any, "getSettingsContribution").mockReturnValue({
      id: "fixture-settings",
      ownerPluginId: "fixture-plugin",
      title: "Fixture Settings",
      placement: "plugins",
      entry: path.join(settingsRoot, "index.html"),
      preloadTypes: path.join(root, "settings-preload.d.ts"),
    });

    await expect(presenter.invokeAction("fixture-plugin", "settings.open")).resolves.toEqual({
      ok: true,
      data: { settingsUrl: "/api/v1/plugins/fixture-plugin/settings/" },
    });
    presenter.setSettingsBaseUrl("http://127.0.0.1:43127/");
    await expect(presenter.invokeAction("fixture-plugin", "settings.open")).resolves.toEqual({
      ok: true,
      data: { settingsUrl: "http://127.0.0.1:43127/api/v1/plugins/fixture-plugin/settings/" },
    });
    expect(await presenter.resolveSettingsWebAsset("fixture-plugin", "")).toEqual({
      filePath: path.join(settingsRoot, "index.html"),
      isEntry: true,
    });
    expect(await presenter.resolveSettingsWebAsset("fixture-plugin", "assets/index.js")).toEqual({
      filePath: path.join(assetsRoot, "index.js"),
      isEntry: false,
    });
    expect(await presenter.resolveSettingsWebAsset("fixture-plugin", "../secret.txt")).toBeNull();
  });
});
