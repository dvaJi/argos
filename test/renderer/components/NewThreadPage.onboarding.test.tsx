import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

const chatInputFocusMock = vi.fn();
const chatInputTriggerAttachMock = vi.fn();

const setup = async () => {
  vi.resetModules();
  chatInputFocusMock.mockReset();
  chatInputTriggerAttachMock.mockReset();

  const projectStore = {
    selectedProject: {
      path: "/tmp/workspace",
      name: "workspace",
    },
    defaultProjectPath: null,
    selectionSource: "manual" as const,
    projects: [],
    selectProject: vi.fn(),
    openFolderPicker: vi.fn(),
  };

  const sessionStore = {
    createSession: vi.fn().mockResolvedValue(undefined),
    selectSession: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };

  const agentStore = {
    selectedAgentId: "deepchat",
    selectedAgent: { id: "deepchat", name: "DeepChat", type: "deepchat" as const, enabled: true },
    agents: [{ id: "deepchat", type: "deepchat" as const }],
  };

  const modelStore = {
    initialized: true,
    initialize: vi.fn().mockResolvedValue(undefined),
    enabledModels: [
      {
        providerId: "openai",
        providerName: "OpenAI",
        models: [{ id: "gpt-4.1", name: "GPT-4.1" }],
      },
    ],
    chatSelectableModelGroups: [] as any[],
    findChatSelectableModel: vi.fn(),
    pickFirstChatSelectableModel: vi.fn(() => ({
      providerId: "openai",
      providerName: "OpenAI",
      model: { id: "gpt-4.1", name: "GPT-4.1" },
    })),
  };
  modelStore.chatSelectableModelGroups = modelStore.enabledModels;

  const draftStore = {
    projectDir: "/tmp/workspace",
    providerId: "openai" as string | undefined,
    modelId: "gpt-4.1" as string | undefined,
    permissionMode: "full_access" as const,
    disabledAgentTools: [] as string[],
    subagentEnabled: false,
    systemPrompt: undefined as string | undefined,
    temperature: undefined as number | undefined,
    contextLength: undefined as number | undefined,
    maxTokens: undefined as number | undefined,
    timeout: undefined as number | undefined,
    thinkingBudget: undefined as number | undefined,
    reasoningEffort: undefined as string | undefined,
    reasoningVisibility: undefined as string | undefined,
    verbosity: undefined as string | undefined,
    forceInterleavedThinkingCompat: undefined as boolean | undefined,
    imageGeneration: undefined as Record<string, unknown> | undefined,
    pendingStartDeeplink: null as null,
    updateGenerationSettings: vi.fn(),
    toGenerationSettings: vi.fn(() => undefined),
    resetGenerationSettings: vi.fn(),
  };

  const configClient = {
    getSetting: vi.fn().mockResolvedValue(undefined),
    resolveDeepChatAgentConfig: vi.fn().mockResolvedValue({
      disabledAgentTools: [],
      permissionMode: "full_access",
    }),
    openSettings: vi.fn().mockResolvedValue(undefined),
  };

  const sessionClient = {
    ensureAcpDraftSession: vi.fn().mockResolvedValue(null),
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
  vi.doMock("@/composables/useGuidedOnboardingStep", () => ({
    useGuidedOnboardingStep: (stepId: string) => ({
      onboardingState: { value: null },
      currentStepId: { value: stepId === "first-chat" ? "first-chat" : null },
      stepState: {
        value: stepId === "first-chat" ? { id: "first-chat", status: "in_progress", required: true } : null,
      },
      showGuide: { value: stepId === "first-chat" },
      stepIndex: { value: 3 },
      totalSteps: { value: 3 },
      canGoPrevious: { value: true },
      dismissGuide: vi.fn(),
      completeStep: vi.fn().mockResolvedValue(null),
      skipStep: vi.fn().mockResolvedValue(null),
      activatePreviousStep: vi.fn().mockResolvedValue(null),
      forceComplete: vi.fn().mockResolvedValue(null),
    }),
  }));

  const NewThreadPage = (await import("@/pages/NewThreadPage")).default;

  render(<NewThreadPage />);

  await act(async () => {});

  return {};
};

describe("NewThreadPage guided onboarding", () => {
  it("does not render a popup primary action for the first-chat guide", async () => {
    await setup();

    expect(screen.queryByTestId("first-chat-guide-primary")).toBeNull();
  });
});
