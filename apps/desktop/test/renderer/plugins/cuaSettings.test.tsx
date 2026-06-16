import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scriptPath = resolve(process.cwd(), "plugins/cua/settings/assets/index.js");

const flushPromises = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const renderSettingsDom = (): void => {
  document.body.innerHTML = `
    <span id="plugin-state"></span>
    <strong id="runtime-state"></strong>
    <strong id="runtime-version"></strong>
    <code id="runtime-command"></code>
    <code id="runtime-helper-app"></code>
    <strong id="mcp-state"></strong>
    <strong id="permission-accessibility"></strong>
    <strong id="permission-screen-recording"></strong>
    <p id="message"></p>
    <a id="project-link"></a>
    <button id="check"></button>
    <button id="guide"></button>
    <button id="disable"></button>
  `;
};

type CuaSettingsWindow = Window & { argosPlugin?: unknown };

const runSettingsScript = async (): Promise<void> => {
  const script = await readFile(scriptPath, "utf8");
  window.eval(`(() => {\n${script}\n})()`);
};

describe("CUA plugin settings", () => {
  beforeEach(() => {
    renderSettingsDom();
    delete (window as CuaSettingsWindow).argosPlugin;
  });

  it("clears the bottom message after a successful permission check", async () => {
    const pluginWindow = window as CuaSettingsWindow;

    pluginWindow.argosPlugin = {
      getStatus: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        enabled: true,
        runtime: {
          state: "ready",
          version: "0.1.5",
          command: "/mock/cua-driver",
          helperAppPath: "/mock/Argos Computer Use.app",
        },
        mcpServers: [
          {
            serverId: "cua-driver",
            enabled: true,
            running: true,
          },
        ],
      }),
      invokeAction: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        ok: true,
        data: {
          accessibility: "granted",
          screenRecording: "denied",
        },
      }),
      disable: vi.fn<(...args: any[]) => any>(),
    };

    await runSettingsScript();
    await flushPromises();

    document.getElementById("check")?.click();
    await flushPromises();

    expect(document.getElementById("permission-accessibility")?.textContent).toBe("Granted");
    expect(document.getElementById("permission-screen-recording")?.textContent).toBe("Denied");
    expect(document.getElementById("message")?.textContent).toBe("");
  });

  it("shows plugin MCP errors in the status row and message area", async () => {
    const pluginWindow = window as CuaSettingsWindow;

    pluginWindow.argosPlugin = {
      getStatus: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        enabled: true,
        runtime: {
          state: "installed",
          version: "0.1.5",
          command: "/mock/cua-driver",
          helperAppPath: "/mock/Argos Computer Use.app",
        },
        mcpServers: [
          {
            serverId: "cua-driver",
            enabled: true,
            running: false,
            lastError: "connect failed",
          },
        ],
      }),
      invokeAction: vi.fn<(...args: any[]) => any>(),
      disable: vi.fn<(...args: any[]) => any>(),
    };

    await runSettingsScript();
    await flushPromises();

    expect(document.getElementById("mcp-state")?.textContent).toBe("Error");
    expect(document.getElementById("message")?.textContent).toBe("connect failed");
  });
});
