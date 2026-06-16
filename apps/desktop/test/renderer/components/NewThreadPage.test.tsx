import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ReasoningEffort, Verbosity } from "../../../src/shared/types/model-db";

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

const chatInputTriggerAttachMock = vi.fn();
const chatInputPendingSkillsSnapshotRef: { value: string[] } = { value: [] };

const setup = async (options?: {
  ensureAcpDraftSession?: (input: {
    agentId: string;
    projectDir: string;
    permissionMode?: string;
  }) => Promise<{ id: string; providerId?: string; modelId?: string } | null>;
  selectedProject?: {
    path: string;
    name: string;
  } | null;
  isDirectory?: boolean | ((path: string) => Promise<boolean> | boolean);
  defaultProjectPath?: string | null;
  defaultModel?: { providerId: string; modelId: string };
  preferredModel?: { providerId: string; modelId: string };
  resolvedAgentConfig?: Record<string, unknown>;
  deferStartupTasks?: boolean;
  modelStoreInitialized?: boolean;
  initializeModels?: () => Promise<void>;
  modelCapabilities?: Record<string, { supportsAudioInput: boolean | null }>;
}) => {
  vi.resetModules();
  chatInputTriggerAttachMock.mockReset();
  chatInputPendingSkillsSnapshotRef.value = [];

  const projectStore = {
    selectedProject: options?.selectedProject ?? {
      path: "/tmp/workspace",
      name: "workspace",
    },
    selectedProjectName: options?.selectedProject?.name ?? "workspace",
    selectionSource: "manual" as "manual" | "default",
    defaultProjectPath: options?.defaultProjectPath ?? null,
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
    selectedAgentId: "acp-agent",
    selectedAgent: { id: "acp-agent", name: "ACP Agent", type: "acp" as const, enabled: true },
  };

  const modelStore = {
    initialized: options?.modelStoreInitialized ?? true,
    initialize: vi.fn().mockImplementation(async () => {
      if (options?.initializeModels) {
        await options.initializeModels();
      }
      modelStore.initialized = true;
    }),
    enabledModels: [] as any[],
    chatSelectableModelGroups: [] as any[],
    findChatSelectableModel: vi.fn(),
    pickFirstChatSelectableModel: vi.fn(),
  };
  Object.defineProperty(modelStore, "chatSelectableModelGroups", {
    get: () => modelStore.enabledModels,
  });

  const draftStore = {
    projectDir: projectStore.selectedProject?.path ?? undefined,
    providerId: undefined as string | undefined,
    modelId: undefined as string | undefined,
    permissionMode: "full_access" as const,
    disabledAgentTools: [] as string[],
    systemPrompt: undefined as string | undefined,
    temperature: undefined as number | undefined,
    contextLength: undefined as number | undefined,
    maxTokens: undefined as number | undefined,
    thinkingBudget: undefined as number | undefined,
    reasoningEffort: undefined as ReasoningEffort | undefined,
    verbosity: undefined as Verbosity | undefined,
    toGenerationSettings: vi.fn(() => undefined),
    resetGenerationSettings: vi.fn(),
  };

  const configClient = {
    getSetting: vi.fn((key: string) => {
      if (key === "defaultModel") return Promise.resolve(options?.defaultModel);
      if (key === "preferredModel") return Promise.resolve(options?.preferredModel);
      return Promise.resolve(undefined);
    }),
    resolveArgosAgentConfig: vi.fn().mockResolvedValue(
      options?.resolvedAgentConfig ?? {
        disabledAgentTools: [],
        permissionMode: "full_access",
      },
    ),
  };

  const sessionClient = {
    ensureAcpDraftSession: vi
      .fn()
      .mockImplementation(options?.ensureAcpDraftSession ?? (() => Promise.resolve({ id: "draft-1" }))),
  };

  const isDirectoryMock = vi.fn((path: string) => {
    const resolver = options?.isDirectory ?? true;
    return Promise.resolve(typeof resolver === "function" ? resolver(path) : resolver);
  });

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
  vi.doMock("@api/FileClient", () => ({
    createFileClient: vi.fn(() => ({
      isDirectory: isDirectoryMock,
    })),
  }));
  vi.doMock("@/lib/startupDeferred", () => ({
    scheduleStartupDeferredTask: vi.fn((task: () => void | Promise<void>) => {
      if (!options?.deferStartupTasks) void task();
      return () => {};
    }),
  }));

  const NewThreadPage = (await import("@/pages/NewThreadPage")).default;

  render(<NewThreadPage />);

  await act(async () => {});

  return {
    projectStore,
    sessionStore,
    agentStore,
    modelStore,
    draftStore,
    sessionClient,
    isDirectoryMock,
  };
};

describe("NewThreadPage ACP draft session bootstrap", () => {
  it("uses the preselected project path when default project selection is already applied", async () => {
    const { sessionClient } = await setup({
      selectedProject: {
        path: "/tmp/default-workspace",
        name: "default-workspace",
      },
    });

    expect(sessionClient.ensureAcpDraftSession).toHaveBeenCalledWith({
      agentId: "acp-agent",
      projectDir: "/tmp/default-workspace",
      permissionMode: "full_access",
    });
  });

  it("ensures ACP draft session on mount", async () => {
    const { sessionClient } = await setup();

    expect(sessionClient.ensureAcpDraftSession).toHaveBeenCalledWith({
      agentId: "acp-agent",
      projectDir: "/tmp/workspace",
      permissionMode: "full_access",
    });
  });

  it("shows a warning when the selected workdir is invalid", async () => {
    const { sessionClient } = await setup({
      isDirectory: false,
    });

    expect(screen.queryByTestId("new-thread-project-missing-warning")).toBeTruthy();
    expect(sessionClient.ensureAcpDraftSession).not.toHaveBeenCalled();
  });
});
