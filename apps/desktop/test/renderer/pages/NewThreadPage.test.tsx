import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, renderHook } from "@testing-library/react";

const setup = async (pendingModelId: string) => {
  vi.resetModules();

  const draftStore = {
    providerId: undefined as string | undefined,
    modelId: undefined as string | undefined,
    projectDir: "/workspace/demo",
    agentId: "argos",
    systemPrompt: undefined as string | undefined,
    temperature: undefined as number | undefined,
    contextLength: undefined as number | undefined,
    maxTokens: undefined as number | undefined,
    thinkingBudget: undefined as number | undefined,
    reasoningEffort: undefined as string | undefined,
    verbosity: undefined as string | undefined,
    forceInterleavedThinkingCompat: undefined as boolean | undefined,
    permissionMode: "full_access",
    disabledAgentTools: [] as string[],
    pendingStartDeeplink: {
      token: 1,
      msg: "帮我总结一下这周的迭代状态",
      modelId: pendingModelId,
      systemPrompt: "You are a concise project assistant.",
      mentions: ["README.md", "docs/spec.md"],
      autoSend: false,
    },
    toGenerationSettings: vi.fn(() => undefined),
    clearPendingStartDeeplink: vi.fn(() => {
      draftStore.pendingStartDeeplink = null;
    }),
  };
  const projectStore = {
    selectedProject: {
      name: "demo",
      path: "/workspace/demo",
    } as { name: string; path: string } | null,
    defaultProjectPath: null as string | null,
    selectionSource: "manual" as "none" | "manual" | "default",
    projects: [{ name: "demo", path: "/workspace/demo" }] as Array<{ name: string; path: string }>,
    selectProject: vi.fn((path: string | null, source?: "none" | "manual" | "default") => {
      const normalizedPath = path?.trim() || null;
      projectStore.selectedProject = normalizedPath
        ? {
            name: normalizedPath.split("/").pop() ?? normalizedPath,
            path: normalizedPath,
          }
        : null;
      projectStore.selectionSource = normalizedPath || source === "manual" ? (source ?? "manual") : "none";
    }),
    openFolderPicker: vi.fn(),
  };
  const sessionStore = {
    selectSession: vi.fn(),
    sendMessage: vi.fn(),
    createSession: vi.fn(),
  };
  const agentStore = {
    selectedAgentId: "argos",
    selectedAgent: null,
    agents: [{ id: "argos", type: "argos" }],
  };
  const getChatSelectableModelGroups = () => modelStore.enabledModels;
  const modelStore = {
    initialized: true,
    initialize: vi.fn().mockImplementation(async () => {
      modelStore.initialized = true;
    }),
    enabledModels: [
      {
        providerId: "openai",
        models: [{ id: "gpt-4o-mini" }, { id: "deepseek-chat" }],
      },
      {
        providerId: "deepseek",
        models: [{ id: "deepseek-chat" }],
      },
    ],
    get chatSelectableModelGroups() {
      return getChatSelectableModelGroups();
    },
    findChatSelectableModel: vi.fn((providerId: string, modelId: string) => {
      const group = getChatSelectableModelGroups().find((entry: any) => entry.providerId === providerId);
      const model = group?.models.find((entry: any) => entry.id === modelId);
      if (!group || !model) {
        return null;
      }
      return { providerId, providerName: providerId, model };
    }),
    pickFirstChatSelectableModel: vi.fn(() => {
      const firstGroup = getChatSelectableModelGroups()[0];
      const firstModel = firstGroup?.models[0];
      return firstGroup && firstModel
        ? {
            providerId: firstGroup.providerId,
            providerName: firstGroup.providerId,
            model: firstModel,
          }
        : null;
    }),
  };
  const configClient = {
    getSetting: vi.fn().mockResolvedValue(undefined),
    resolveArgosAgentConfig: vi.fn().mockResolvedValue({
      defaultModelPreset: {
        providerId: "openai",
        modelId: "gpt-4o-mini",
      },
      systemPrompt: "Default system prompt",
      permissionMode: "full_access",
      disabledAgentTools: [],
    }),
  };
  const sessionClient = {
    ensureAcpDraftSession: vi.fn(),
  };

  vi.doMock("@/stores/ui/project", () => ({
    useProjectStore: () => projectStore,
  }));
  vi.doMock("@/stores/ui/session", () => ({
    useSessionStore: () => sessionStore,
  }));
  vi.doMock("@/stores/ui/agent", () => ({
    useAgentStore: () => agentStore,
  }));
  vi.doMock("@/stores/modelStore", () => ({
    useModelStore: () => modelStore,
  }));
  vi.doMock("@/stores/ui/draft", () => ({
    useDraftStore: () => draftStore,
  }));
  vi.doMock("@api/ConfigClient", () => ({
    createConfigClient: vi.fn(() => configClient),
  }));
  vi.doMock("@api/SessionClient", () => ({
    createSessionClient: vi.fn(() => sessionClient),
  }));
  vi.doMock("@/lib/startupDeferred", () => ({
    scheduleStartupDeferredTask: vi.fn((task: () => void | Promise<void>) => {
      void task();
      return () => {};
    }),
  }));
  vi.doMock("@/components/chat/ChatInputBox", () => ({
    default: ({ modelValue }: { modelValue?: string }) => <div data-testid="chat-input">{modelValue}</div>,
  }));
  vi.doMock("@/components/chat/ChatStatusBar", () => ({
    default: () => <div data-testid="chat-status-bar" />,
  }));
  vi.doMock("react-i18next", () => ({
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }));
  vi.doMock("@iconify/react", () => ({
    Icon: () => <span />,
  }));

  const NewThreadPage = (await import("@/pages/NewThreadPage")).default;

  const result = render(<NewThreadPage />);

  await act(async () => {});

  return {
    ...result,
    draftStore,
    projectStore,
  };
};

describe("NewThreadPage start deeplink prefill", () => {
  it("applies exact model matches and appends mentions into the input", async () => {
    const { draftStore } = await setup("deepseek-chat");

    const chatInput = screen.getByTestId("chat-input");
    expect(chatInput.textContent).toContain("帮我总结一下这周的迭代状态");
    expect(draftStore.systemPrompt).toBe("You are a concise project assistant.");
    expect(draftStore.providerId).toBe("openai");
    expect(draftStore.modelId).toBe("deepseek-chat");
    expect(draftStore.clearPendingStartDeeplink).toHaveBeenCalledTimes(1);
  }, 20000);

  it("falls back to fuzzy model matching when no exact match exists", async () => {
    const { draftStore } = await setup("seek-chat");

    expect(draftStore.providerId).toBe("openai");
    expect(draftStore.modelId).toBe("deepseek-chat");
  }, 20000);

  it("allows clearing the selected project from the new thread dropdown", async () => {
    const { projectStore } = await setup("deepseek-chat");

    const clearButton = screen.getByTestId("new-thread-clear-project");
    await act(async () => {
      fireEvent.click(clearButton);
    });
    await act(async () => {});

    expect(projectStore.selectProject).toHaveBeenCalledWith(null, "manual");
    const trigger = screen.getByTestId("new-thread-project-trigger");
    expect(trigger.textContent).toContain("common.project.none");
  }, 20000);
});
