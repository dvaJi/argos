import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

const chatInputFocusMock = vi.fn<(...args: any[]) => any>();
const chatInputTriggerAttachMock = vi.fn<(...args: any[]) => any>();

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
    selectProject: vi.fn<(...args: any[]) => any>(),
    openFolderPicker: vi.fn<(...args: any[]) => any>(),
  };

  const sessionStore = {
    createSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    selectSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    sendMessage: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  };

  const agentStore = {
    selectedAgentId: "argos",
    selectedAgent: { id: "argos", name: "Argos", type: "argos" as const, enabled: true },
    agents: [{ id: "argos", type: "argos" as const }],
  };

  const modelStore = {
    initialized: true,
    initialize: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    enabledModels: [
      {
        providerId: "openai",
        providerName: "OpenAI",
        models: [{ id: "gpt-4.1", name: "GPT-4.1" }],
      },
    ],
    chatSelectableModelGroups: [] as any[],
    findChatSelectableModel: vi.fn<(...args: any[]) => any>(),
    pickFirstChatSelectableModel: vi.fn<(...args: any[]) => any>(() => ({
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
    updateGenerationSettings: vi.fn<(...args: any[]) => any>(),
    toGenerationSettings: vi.fn<(...args: any[]) => any>(() => undefined),
    resetGenerationSettings: vi.fn<(...args: any[]) => any>(),
  };

  const configClient = {
    getSetting: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    resolveArgosAgentConfig: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      disabledAgentTools: [],
      permissionMode: "full_access",
    }),
    openSettings: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  };

  const sessionClient = {
    ensureAcpDraftSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
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
    createConfigClient: vi.fn<(...args: any[]) => any>(() => configClient),
  }));
  vi.doMock("@api/SessionClient", () => ({
    createSessionClient: vi.fn<(...args: any[]) => any>(() => sessionClient),
  }));
  vi.doMock("@/lib/startupDeferred", () => ({
    scheduleStartupDeferredTask: vi.fn<(...args: any[]) => any>((task: () => void | Promise<void>) => {
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
      dismissGuide: vi.fn<(...args: any[]) => any>(),
      completeStep: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
      skipStep: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
      activatePreviousStep: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
      forceComplete: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
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
