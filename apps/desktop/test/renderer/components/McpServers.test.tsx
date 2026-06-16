import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const setup = async (
  options: {
    withServers?: boolean;
    showFooterAddButton?: boolean;
    serverList?: Array<Record<string, unknown> & { name: string }>;
    config?: {
      mcpServers?: Record<string, Record<string, unknown>>;
    };
  } = {},
) => {
  vi.resetModules();

  const defaultServerList = options.withServers
    ? [
        {
          name: "running-server",
          icons: "",
          descriptions: "",
          command: "",
          args: [],
          enabled: true,
          isRunning: true,
        },
        {
          name: "stopped-server",
          icons: "",
          descriptions: "",
          command: "",
          args: [],
          enabled: false,
          isRunning: false,
        },
      ]
    : [];
  const defaultMcpServers = options.withServers
    ? {
        "running-server": { type: "stdio" },
        "stopped-server": { type: "stdio" },
      }
    : {};
  const serverList = options.serverList ?? defaultServerList;
  const config = {
    mcpServers: {
      ...defaultMcpServers,
      ...options.config?.mcpServers,
    },
  };
  const mcpStore = {
    mcpInstallCache: "",
    clearMcpInstallCache: vi.fn<(...args: any[]) => any>(),
    serverList,
    config,
    configLoading: false,
    tools: [],
    visibleTools: [],
    prompts: [],
    visiblePrompts: [],
    resources: [],
    visibleResources: [],
    serverLoadingStates: {},
    addServer: vi.fn<(...args: any[]) => any>().mockResolvedValue({ success: true }),
    updateServer: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
    removeServer: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
    toggleServer: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
    loadTools: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    loadPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    loadResources: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  };

  vi.doMock("@/stores/mcp", () => ({
    useMcpStore: () => mcpStore,
  }));

  const McpServers = (await import("@/components/mcp-config/components/McpServers")).default;

  const result = render(<McpServers showFooterAddButton={options.showFooterAddButton} />);

  return {
    ...result,
    mcpStore,
  };
};

describe("McpServers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("open", vi.fn<(...args: any[]) => any>());
  });

  it("renders the add button in the footer action area", async () => {
    await setup();
    const actionButtons = screen.getAllByTestId("action-button");

    expect(actionButtons[0]?.textContent).toContain("common.add");
  });

  it("can hide the footer add button for settings header ownership", async () => {
    const { container } = await setup({ showFooterAddButton: false });

    expect(container.textContent).not.toContain("common.add");
  });

  it("only shows all, running, and stopped filters", async () => {
    const { container } = await setup({ withServers: true });

    expect(container.textContent).toContain("settings.mcp.center.filters.all");
    expect(container.textContent).toContain("settings.mcp.center.filters.running");
    expect(container.textContent).toContain("settings.mcp.center.filters.stopped");
    expect(container.textContent).not.toContain("settings.mcp.center.filters.builtIn");
    expect(container.textContent).not.toContain("settings.mcp.center.filters.custom");
  });

  it("hides plugin-owned MCP servers from the global settings list", async () => {
    const { container } = await setup({
      serverList: [{ name: "user-server" }],
      config: {
        mcpServers: {
          "feishu-tools": {
            type: "stdio",
            command: "node",
            args: [],
            enabled: true,
            source: "plugin",
            ownerPluginId: "com.argos.plugins.feishu",
          },
          "user-server": {
            type: "stdio",
            command: "node",
            args: [],
            enabled: true,
          },
        },
      },
    });

    const cards = screen.getAllByTestId("server-card").map((card) => card.textContent);

    expect(cards).toEqual(["user-server"]);
    expect(container.textContent).not.toContain("feishu-tools");
  });

  it("shows the empty state when only plugin-owned MCP servers exist", async () => {
    const { container } = await setup({
      serverList: [],
      config: {
        mcpServers: {
          "feishu-tools": {
            type: "stdio",
            command: "node",
            args: [],
            enabled: true,
            source: "plugin",
            ownerPluginId: "com.argos.plugins.feishu",
          },
        },
      },
    });

    expect(container.textContent).toContain("settings.mcp.noServersFound");
    expect(screen.queryAllByTestId("server-card")).toHaveLength(0);
  });
});
