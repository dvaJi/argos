import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    const presenter = new DaemonPluginPresenter({
      configPresenter: configPresenter as never,
      mcpPresenter: mcpPresenter as never,
      skillPresenter: skillPresenter as never,
      configDir: root,
      dataDir: root,
      appVersion: "1.0.0",
    });

    return { presenter, configPresenter, mcpPresenter, skillPresenter };
  }

  it("stops plugin-owned MCP servers during shutdown", async () => {
    const { presenter, mcpPresenter } = createPresenter();

    await presenter.shutdown();

    expect(mcpPresenter.stopServer).toHaveBeenCalledWith("fixture-server");
  });

  it("rejects plugin settings UI actions in daemon mode", async () => {
    const { presenter } = createPresenter();

    await expect(presenter.invokeAction("fixture-plugin", "settings.open")).resolves.toEqual({
      ok: false,
      error: "Plugin settings UI is not available in daemon mode",
    });
  });
});
