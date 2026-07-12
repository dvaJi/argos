import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const buildTool = (name: string, serverName: string, source: "mcp" | "agent" = "agent") => ({
  type: "function",
  source,
  function: {
    name,
    description: `${name} description`,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  server: {
    name: serverName,
    icons: "",
    description: `${serverName} description`,
  },
});

const setup = async (options?: {
  hasActiveSession?: boolean;
  activeAgentId?: string;
  selectedAgentId?: string;
  disabledAgentTools?: string[];
  showSubagentToggle?: boolean;
  subagentEnabled?: boolean;
  pluginEnabled?: boolean;
  regularMcpEnabled?: boolean;
}) => {
  vi.resetModules();
  let skillSessionChangedHandler:
    | ((payload: { conversationId?: string | null; skills?: string[]; change: "activated" | "deactivated" }) => void)
    | undefined;
  const ipcRenderer = {
    emit: (event: string, payload?: { conversationId?: string; skills?: string[] }) => {
      if (event === "skill:activated") {
        skillSessionChangedHandler?.({
          conversationId: payload?.conversationId ?? null,
          skills: payload?.skills,
          change: "activated",
        });
      }
      if (event === "skill:deactivated") {
        skillSessionChangedHandler?.({
          conversationId: payload?.conversationId ?? null,
          skills: payload?.skills,
          change: "deactivated",
        });
      }
    },
  };

  const pluginTools = options?.pluginEnabled ? [buildTool("check_permissions", "cua-driver", "mcp")] : [];
  const regularMcpEnabled = options?.regularMcpEnabled ?? true;
  const mcpStore = {
    enabledServers: regularMcpEnabled ? [{ name: "demo-server", icons: "D", enabled: true }] : [],
    enabledPluginServers: options?.pluginEnabled
      ? [{ name: "cua-driver", icons: "plugin", descriptions: "CUA Driver", enabled: true }]
      : [],
    enabledServerCount: regularMcpEnabled ? 1 : 0,
    tools: regularMcpEnabled ? [buildTool("mcp_tool", "demo-server", "mcp")] : [],
    visibleTools: regularMcpEnabled ? [buildTool("mcp_tool", "demo-server", "mcp")] : [],
    pluginTools,
  };

  const sessionStore = {
    hasActiveSession: options?.hasActiveSession ?? true,
    activeSessionId: options?.hasActiveSession === false ? null : "s1",
    activeSession:
      options?.hasActiveSession === false
        ? null
        : {
            id: "s1",
            agentId: options?.activeAgentId ?? "argos",
            projectDir: "/tmp/workspace",
          },
  };

  const draftStore = {
    disabledAgentTools: [...(options?.disabledAgentTools ?? [])],
  };

  const agentStore = {
    selectedAgentId: options?.selectedAgentId ?? "argos",
  };

  const projectStore = {
    selectedProject: {
      path: "/tmp/workspace",
      name: "workspace",
    },
  };

  const toolPresenter = {
    getAllToolDefinitions: vi
      .fn<(...args: any[]) => any>()
      .mockResolvedValue([
        buildTool("read", "agent-filesystem"),
        buildTool("exec", "agent-filesystem"),
        buildTool("argos_question", "agent-core"),
        buildTool("update_plan", "agent-core"),
        buildTool("cdp_send", "yobrowser"),
        buildTool("mcp_tool", "demo-server", "mcp"),
      ]),
  };

  const agentSessionPresenter = {
    getSessionDisabledAgentTools: vi
      .fn<(...args: any[]) => any>()
      .mockResolvedValue([...(options?.disabledAgentTools ?? [])]),
    updateSessionDisabledAgentTools: vi
      .fn<(...args: any[]) => any>()
      .mockImplementation(async (_id: string, tools: string[]) => tools),
  };

  const windowPresenter = {
    createSettingsWindow: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    getSettingsWindowId: vi.fn<(...args: any[]) => any>().mockReturnValue(1),
    sendToWindow: vi.fn<(...args: any[]) => any>(),
  };

  vi.doMock("#/stores/mcp", () => ({
    useMcpStore: () => mcpStore,
  }));
  vi.doMock("#/stores/ui/session", () => ({
    useSessionStore: () => sessionStore,
  }));
  vi.doMock("#/stores/ui/draft", () => ({
    useDraftStore: () => draftStore,
  }));
  vi.doMock("#/stores/ui/agent", () => ({
    useAgentStore: () => agentStore,
  }));
  vi.doMock("#/stores/ui/project", () => ({
    useProjectStore: () => projectStore,
  }));
  vi.doMock("#api/ToolClient", () => ({
    createToolClient: vi.fn<(...args: any[]) => any>(() => ({
      getAllToolDefinitions: toolPresenter.getAllToolDefinitions,
    })),
  }));
  vi.doMock("#api/SessionClient", () => ({
    createSessionClient: vi.fn<(...args: any[]) => any>(() => ({
      getSessionDisabledAgentTools: agentSessionPresenter.getSessionDisabledAgentTools,
      updateSessionDisabledAgentTools: agentSessionPresenter.updateSessionDisabledAgentTools,
    })),
  }));
  vi.doMock("#api/SkillClient", () => ({
    createSkillClient: vi.fn<(...args: any[]) => any>(() => ({
      onSessionChanged: vi.fn<(...args: any[]) => any>(
        (
          listener: (payload: {
            conversationId?: string | null;
            skills?: string[];
            change: "activated" | "deactivated";
          }) => void,
        ) => {
          skillSessionChangedHandler = listener;
          return () => {
            if (skillSessionChangedHandler === listener) {
              skillSessionChangedHandler = undefined;
            }
          };
        },
      ),
    })),
  }));
  vi.doMock("#api/SettingsClient", () => ({
    createSettingsClient: vi.fn<(...args: any[]) => any>(() => ({
      openSettings: windowPresenter.createSettingsWindow,
    })),
  }));
  vi.doMock("@iconify/react", () => ({
    Icon: () => null,
  }));

  const McpIndicator = (await import("#/components/chat-input/McpIndicator")).default;
  const onToggleSubagents = vi.fn<(...args: any[]) => any>();

  const result = render(
    <McpIndicator
      showSubagentToggle={options?.showSubagentToggle ?? false}
      subagentEnabled={options?.subagentEnabled ?? false}
      onToggleSubagents={onToggleSubagents}
    />,
  );

  await act(async () => {});

  return {
    ...result,
    draftStore,
    toolPresenter,
    agentSessionPresenter,
    ipcRenderer,
    onToggleSubagents,
  };
};

describe("McpIndicator", () => {
  it("renders icon-only trigger for argos and keeps built-in tools session scoped", async () => {
    const { container, agentSessionPresenter } = await setup({
      hasActiveSession: true,
      activeAgentId: "argos",
    });

    const buttons = screen.getAllByRole("button");
    expect(buttons[0].textContent).toBe("");
    expect(container.textContent).toContain("Tools");
    expect(container.textContent).not.toContain("MCP 1");
    expect(container.textContent.indexOf("Tools")).toBeLessThan(container.textContent.indexOf("demo-server"));

    const execButton = buttons.find((button) => button.textContent === "exec");
    expect(execButton).toBeTruthy();

    await fireEvent.click(execButton!);
    await act(async () => {});

    expect(agentSessionPresenter.updateSessionDisabledAgentTools).toHaveBeenCalledWith("s1", ["exec"]);
  });

  it("supports enabling and disabling a whole tool group", async () => {
    const { agentSessionPresenter } = await setup({
      hasActiveSession: true,
      activeAgentId: "argos",
      disabledAgentTools: ["exec"],
    });

    const groupSwitches = screen.getAllByRole("switch");
    const filesystemSwitch = groupSwitches[0];
    expect(filesystemSwitch).toBeTruthy();
    expect(filesystemSwitch.getAttribute("aria-checked")).toBe("true");

    await fireEvent.click(filesystemSwitch);
    await act(async () => {});

    expect(agentSessionPresenter.updateSessionDisabledAgentTools).toHaveBeenCalledWith("s1", ["exec", "read"]);
  });

  it("renders update_plan inside Agent Core and toggles it individually", async () => {
    const { agentSessionPresenter } = await setup({
      hasActiveSession: true,
      activeAgentId: "argos",
    });

    const buttons = screen.getAllByRole("button");
    expect(buttons.some((b) => b.textContent?.includes("Agent Core"))).toBe(true);
    expect(buttons.some((b) => b.textContent?.includes("update_plan"))).toBe(true);

    const updatePlanButton = buttons.find((button) => button.textContent === "update_plan");
    expect(updatePlanButton).toBeTruthy();

    await fireEvent.click(updatePlanButton!);
    await act(async () => {});

    expect(agentSessionPresenter.updateSessionDisabledAgentTools).toHaveBeenCalledWith("s1", ["update_plan"]);
  });

  it("resets a fully disabled tool group back to all enabled when switched on", async () => {
    const { agentSessionPresenter } = await setup({
      hasActiveSession: true,
      activeAgentId: "argos",
      disabledAgentTools: ["exec", "read"],
    });

    const groupSwitches = screen.getAllByRole("switch");
    const filesystemSwitch = groupSwitches[0];
    expect(filesystemSwitch).toBeTruthy();
    expect(filesystemSwitch.getAttribute("aria-checked")).toBe("false");

    await fireEvent.click(filesystemSwitch);
    await act(async () => {});

    expect(agentSessionPresenter.updateSessionDisabledAgentTools).toHaveBeenCalledWith("s1", []);
  });

  it("renders MCP badge for ACP sessions and keeps built-in tools hidden", async () => {
    const { container, toolPresenter } = await setup({
      hasActiveSession: true,
      activeAgentId: "acp-coder",
    });

    const buttons = screen.getAllByRole("button");
    expect(buttons[0].textContent).toContain("MCP 1");
    expect(container.textContent).not.toContain("Tools");
    expect(toolPresenter.getAllToolDefinitions).not.toHaveBeenCalled();
  });

  it("renders plugin-owned MCP tools in a separate plugin section", async () => {
    const { container } = await setup({
      hasActiveSession: true,
      activeAgentId: "acp-coder",
      pluginEnabled: true,
    });

    const buttons = screen.getAllByRole("button");
    expect(buttons[0].textContent).toContain("MCP 1");
    expect(container.textContent).toContain("MCP");
    expect(container.textContent).toContain("demo-server");
    expect(container.textContent).toContain("Plugins");
    expect(container.textContent).toContain("CUA Driver");
  });

  it("shows plugin MCP when global MCP has no enabled regular servers", async () => {
    const { container } = await setup({
      hasActiveSession: true,
      activeAgentId: "acp-coder",
      pluginEnabled: true,
      regularMcpEnabled: false,
    });

    const buttons = screen.getAllByRole("button");
    expect(buttons[0].textContent).toContain("MCP 0");
    expect(container.textContent).toContain("Plugins");
    expect(container.textContent).toContain("CUA Driver");
    expect(container.textContent).not.toContain("demo-server");
  });

  it("updates draft disabled tools for argos new thread mode", async () => {
    const { draftStore, agentSessionPresenter } = await setup({
      hasActiveSession: false,
      selectedAgentId: "argos",
    });

    const buttons = screen.getAllByRole("button");
    const updatePlanButton = buttons.find((button) => button.textContent === "update_plan");
    expect(updatePlanButton).toBeTruthy();

    await fireEvent.click(updatePlanButton!);
    await act(async () => {});

    expect(draftStore.disabledAgentTools).toEqual(["update_plan"]);
    expect(agentSessionPresenter.updateSessionDisabledAgentTools).not.toHaveBeenCalled();
  });

  it("renders subagent as a regular tool button inside Agent Core and emits updates", async () => {
    const { onToggleSubagents } = await setup({
      hasActiveSession: true,
      activeAgentId: "argos",
      showSubagentToggle: true,
      subagentEnabled: true,
    });

    const buttons = screen.getAllByRole("button");
    const subagentButton = buttons.find((node) => node.textContent === "subagent");

    expect(subagentButton).toBeTruthy();

    await fireEvent.click(subagentButton!);

    expect(onToggleSubagents).toHaveBeenCalledWith(false);
  });

  it("reloads argos tools when the active session emits skill activation changes", async () => {
    const { toolPresenter, ipcRenderer } = await setup({
      hasActiveSession: true,
      activeAgentId: "argos",
    });

    toolPresenter.getAllToolDefinitions.mockClear();
    ipcRenderer.emit("skill:activated", {
      conversationId: "s1",
      skills: ["argos-settings"],
    });
    await act(async () => {});

    expect(toolPresenter.getAllToolDefinitions).toHaveBeenCalledTimes(1);
    expect(toolPresenter.getAllToolDefinitions).toHaveBeenCalledWith({
      chatMode: "agent",
      conversationId: "s1",
      agentWorkspacePath: "/tmp/workspace",
    });
  });
});
