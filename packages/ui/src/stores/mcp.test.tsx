import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const servers: Record<string, { type: string; enabled: boolean; command?: string }> = {
  existing: { type: "stdio", enabled: true, command: "a" },
};

vi.mock("#api/McpClient", () => ({
  createMcpClient: () => ({
    getMcpServers: async () => structuredClone(servers),
    getMcpEnabled: async () => true,
    addMcpServer: async (name: string, config: (typeof servers)[string]) => {
      servers[name] = config;
      return true;
    },
    updateMcpServer: async (name: string, config: Partial<(typeof servers)[string]>) => {
      servers[name] = { ...servers[name], ...config };
    },
    isServerRunning: async () => false,
    getAllToolDefinitions: async () => [],
    getMcpClients: async () => [],
    getAllPrompts: async () => [],
    getAllResources: async () => [],
  }),
}));
vi.mock("../../api/ConfigClient", () => ({
  createConfigClient: () => ({
    getCustomPrompts: async () => [],
    getSetting: async () => [],
    setSetting: async () => undefined,
  }),
}));

describe("mcp store add/update", () => {
  it("re-renders the server list after addServer and updateServer", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { useMcpStore, loadConfig } = await import("./mcp");

    let latest: ReturnType<typeof useMcpStore> | null = null;
    const Probe = () => {
      const store = useMcpStore();
      latest = store;
      return <div data-names={store.serverList.map((s) => `${s.name}:${s.command}`).join(",")} />;
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Probe />));
    await act(async () => loadConfig());
    const names = () => container.querySelector("[data-names]")?.getAttribute("data-names");
    expect(names()).toBe("existing:a");

    await act(async () => {
      await latest!.addServer("fresh", { type: "stdio", enabled: true, command: "b" } as never);
    });
    expect(names()).toBe("existing:a,fresh:b");

    await act(async () => {
      await latest!.updateServer("existing", { command: "c" } as never);
    });
    expect(names()).toBe("existing:c,fresh:b");

    await act(async () => root.unmount());
    container.remove();
  });
});
