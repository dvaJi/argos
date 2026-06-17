import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ModelType } from "../../../src/shared/model";

describe("ArgosAgentsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mounts and saves Argos agents without advanced model overrides", async () => {
    vi.resetModules();

    const existingAgent = {
      id: "argos",
      type: "argos",
      name: "Argos",
      enabled: true,
      protected: true,
      description: "Writer agent",
      avatar: null,
      config: {
        defaultModelPreset: {
          providerId: "openai",
          modelId: "gpt-4.1",
          temperature: 1.2,
          contextLength: 64000,
          maxTokens: 8192,
          thinkingBudget: 2048,
          reasoningEffort: "high",
          verbosity: "high",
          forceInterleavedThinkingCompat: true,
        },
        assistantModel: null,
        visionModel: null,
        imageGenerationModel: { providerId: "openai", modelId: "gpt-image-1" },
        systemPrompt: "system prompt",
        permissionMode: "default",
        disabledAgentTools: ["tool_beta"],
        autoCompactionEnabled: false,
        autoCompactionTriggerThreshold: 72,
        autoCompactionRetainRecentPairs: 4,
      },
    };

    const configPresenter = {
      listAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([existingAgent]),
      getSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      updateArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(existingAgent),
      createArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: "argos-new" }),
      deleteArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const toolPresenter = {
      getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([
        {
          source: "agent",
          function: { name: "tool_alpha", description: "Alpha tool" },
          server: { name: "alpha-server" },
        },
        {
          source: "agent",
          function: { name: "tool_beta", description: "Beta tool" },
          server: { name: "beta-server" },
        },
      ]),
    };
    const projectPresenter = {
      getRecentProjects: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    };
    const modelStore = {
      allProviderModels: [
        {
          providerId: "openai",
          models: [
            { id: "gpt-4.1", name: "GPT-4.1" },
            { id: "gpt-image-1", name: "GPT Image 1", type: ModelType.ImageGeneration },
          ],
        },
      ],
      findModelByIdOrName: vi.fn<(...args: any[]) => any>((modelId: string) =>
        modelId === "gpt-image-1"
          ? {
              providerId: "openai",
              model: { id: "gpt-image-1", name: "GPT Image 1", type: ModelType.ImageGeneration },
            }
          : {
              providerId: "openai",
              model: { id: "gpt-4.1", name: "GPT-4.1" },
            },
      ),
    };

    vi.doMock("@api/legacy/presenters", () => ({
      useLegacyPresenter: (name: string) => {
        if (name === "configPresenter") return configPresenter;
        if (name === "projectPresenter") return projectPresenter;
        if (name === "toolPresenter") return toolPresenter;
        return {};
      },
    }));
    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => modelStore,
    }));
    vi.doMock("@iconify/react", () => ({
      Icon: () => null,
    }));

    const ArgosAgentsSettings = (await import("../../../src/renderer/settings/components/ArgosAgentsSettings")).default;

    const result = render(<ArgosAgentsSettings />);

    await act(async () => {});

    expect(result.container.textContent).not.toContain("settings.argosAgents.temperature");
    expect(result.container.textContent).not.toContain("settings.argosAgents.reasoningEffort");
    expect(result.container.textContent).not.toContain("settings.argosAgents.verbosity");
    expect(result.container.textContent).not.toContain("settings.argosAgents.interleaved");
    expect(result.container.textContent).toContain("GPT-4.1");
    expect(result.container.textContent).toContain("GPT Image 1");
    expect(result.container.textContent).not.toContain("openai/gpt-4.1");
    expect(
      (result.container.textContent?.indexOf("settings.argosAgents.visionModel") ?? -1) <
        (result.container.textContent?.indexOf("settings.argosAgents.imageGenerationModel") ?? -1),
    ).toBe(true);

    const saveButton = Array.from(result.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("common.save"),
    );

    expect(saveButton).toBeDefined();

    await fireEvent.click(saveButton!);
    await act(async () => {});

    expect(configPresenter.updateArgosAgent).toHaveBeenCalledTimes(1);

    const [, payload] = configPresenter.updateArgosAgent.mock.calls[0];
    expect(payload).toMatchObject({
      name: "Argos",
      enabled: true,
      description: "Writer agent",
      config: {
        defaultModelPreset: {
          providerId: "openai",
          modelId: "gpt-4.1",
        },
        assistantModel: null,
        visionModel: null,
        imageGenerationModel: { providerId: "openai", modelId: "gpt-image-1" },
        defaultProjectPath: null,
        systemPrompt: "system prompt",
        permissionMode: "default",
        disabledAgentTools: ["tool_beta"],
        autoCompactionEnabled: false,
        autoCompactionTriggerThreshold: 72,
        autoCompactionRetainRecentPairs: 4,
      },
    });
    expect(payload.config.defaultModelPreset).toEqual({
      providerId: "openai",
      modelId: "gpt-4.1",
    });
    expect(payload.config.imageGenerationModel).toEqual({
      providerId: "openai",
      modelId: "gpt-image-1",
    });
  });

  it("filters the image generation model selector to image models", async () => {
    vi.resetModules();

    const existingAgent = {
      id: "argos",
      type: "argos",
      name: "Argos",
      enabled: true,
      protected: true,
      description: "Writer agent",
      avatar: null,
      config: {
        defaultModelPreset: null,
        assistantModel: null,
        visionModel: null,
        imageGenerationModel: null,
        systemPrompt: "",
        permissionMode: "default",
        disabledAgentTools: [],
      },
    };
    const configPresenter = {
      listAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([existingAgent]),
      getSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      updateArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(existingAgent),
      createArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: "argos-new" }),
      deleteArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const toolPresenter = {
      getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    };
    const projectPresenter = {
      getRecentProjects: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    };

    vi.doMock("@api/legacy/presenters", () => ({
      useLegacyPresenter: (name: string) => {
        if (name === "configPresenter") return configPresenter;
        if (name === "projectPresenter") return projectPresenter;
        if (name === "toolPresenter") return toolPresenter;
        return {};
      },
    }));
    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => ({
        allProviderModels: [],
        findModelByIdOrName: vi.fn<(...args: any[]) => any>(() => null),
      }),
    }));
    vi.doMock("@iconify/react", () => ({
      Icon: () => null,
    }));

    const ArgosAgentsSettings = (await import("../../../src/renderer/settings/components/ArgosAgentsSettings")).default;

    const result = render(<ArgosAgentsSettings />);

    await act(async () => {});

    const modelSelects = screen.getAllByTestId("model-select-stub");
    expect(modelSelects).toHaveLength(4);
  });

  it("keeps the editor header sticky so save actions stay visible while scrolling", async () => {
    vi.resetModules();

    const existingAgent = {
      id: "argos",
      type: "argos",
      name: "Argos",
      enabled: true,
      protected: true,
      description: "Writer agent",
      avatar: null,
      config: {},
    };

    const configPresenter = {
      listAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([existingAgent]),
      getSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      updateArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(existingAgent),
      createArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: "argos-new" }),
      deleteArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const toolPresenter = {
      getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    };
    const projectPresenter = {
      getRecentProjects: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    };
    const modelStore = {
      allProviderModels: [],
      findModelByIdOrName: vi.fn<(...args: any[]) => any>(() => null),
    };

    vi.doMock("@api/legacy/presenters", () => ({
      useLegacyPresenter: (name: string) => {
        if (name === "configPresenter") return configPresenter;
        if (name === "projectPresenter") return projectPresenter;
        if (name === "toolPresenter") return toolPresenter;
        return {};
      },
    }));
    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => modelStore,
    }));
    vi.doMock("@iconify/react", () => ({
      Icon: () => null,
    }));

    const ArgosAgentsSettings = (await import("../../../src/renderer/settings/components/ArgosAgentsSettings")).default;

    const result = render(<ArgosAgentsSettings />);

    await act(async () => {});

    const stickyHeader = screen.getByTestId("argos-agents-sticky-header");

    expect(stickyHeader.className).toContain("sticky");
    expect(stickyHeader.className).toContain("top-0");
    expect(stickyHeader.textContent).toContain("common.save");
    expect(stickyHeader.textContent).toContain("common.reset");
  });

  it("saves auto compaction settings when number inputs emit numeric values", async () => {
    vi.resetModules();

    const existingAgent = {
      id: "argos",
      type: "argos",
      name: "Argos",
      enabled: true,
      protected: true,
      description: "Writer agent",
      avatar: null,
      config: {
        defaultModelPreset: null,
        assistantModel: null,
        visionModel: null,
        systemPrompt: "system prompt",
        permissionMode: "default",
        disabledAgentTools: [],
        autoCompactionEnabled: true,
        autoCompactionTriggerThreshold: 72,
        autoCompactionRetainRecentPairs: 4,
      },
    };

    const configPresenter = {
      listAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([existingAgent]),
      getSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      updateArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(existingAgent),
      createArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: "argos-new" }),
      deleteArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const toolPresenter = {
      getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    };
    const projectPresenter = {
      getRecentProjects: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    };
    const modelStore = {
      allProviderModels: [],
      findModelByIdOrName: vi.fn<(...args: any[]) => any>(() => null),
    };

    vi.doMock("@api/legacy/presenters", () => ({
      useLegacyPresenter: (name: string) => {
        if (name === "configPresenter") return configPresenter;
        if (name === "projectPresenter") return projectPresenter;
        if (name === "toolPresenter") return toolPresenter;
        return {};
      },
    }));
    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => modelStore,
    }));
    vi.doMock("@iconify/react", () => ({
      Icon: () => null,
    }));

    const ArgosAgentsSettings = (await import("../../../src/renderer/settings/components/ArgosAgentsSettings")).default;

    const result = render(<ArgosAgentsSettings />);

    await act(async () => {});

    const thresholdInput = screen.getByTestId("auto-compaction-trigger-threshold-input");
    const retainInput = screen.getByTestId("auto-compaction-retain-recent-pairs-input");

    // PLACEHOLDER: was wrapper.findComponent(...).vm.$emit('update:modelValue', 91)
    // React: fireEvent.change with numeric value
    fireEvent.change(thresholdInput, { target: { value: "91" } });
    fireEvent.change(retainInput, { target: { value: "6" } });

    const saveButton = Array.from(result.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("common.save"),
    );

    expect(saveButton).toBeDefined();

    await fireEvent.click(saveButton!);
    await act(async () => {});

    expect(configPresenter.updateArgosAgent).toHaveBeenCalledTimes(1);

    const [, payload] = configPresenter.updateArgosAgent.mock.calls[0];
    expect(payload.config.autoCompactionTriggerThreshold).toBe(91);
    expect(payload.config.autoCompactionRetainRecentPairs).toBe(6);
  });

  it("falls back to default auto compaction values when inputs are blank or invalid", async () => {
    vi.resetModules();

    const existingAgent = {
      id: "argos",
      type: "argos",
      name: "Argos",
      enabled: true,
      protected: true,
      description: "Writer agent",
      avatar: null,
      config: {
        defaultModelPreset: null,
        assistantModel: null,
        visionModel: null,
        systemPrompt: "system prompt",
        permissionMode: "default",
        disabledAgentTools: [],
        autoCompactionEnabled: true,
        autoCompactionTriggerThreshold: 72,
        autoCompactionRetainRecentPairs: 4,
      },
    };

    const configPresenter = {
      listAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([existingAgent]),
      getSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      updateArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(existingAgent),
      createArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: "argos-new" }),
      deleteArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const toolPresenter = {
      getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    };
    const projectPresenter = {
      getRecentProjects: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    };
    const modelStore = {
      allProviderModels: [],
      findModelByIdOrName: vi.fn<(...args: any[]) => any>(() => null),
    };

    vi.doMock("@api/legacy/presenters", () => ({
      useLegacyPresenter: (name: string) => {
        if (name === "configPresenter") return configPresenter;
        if (name === "projectPresenter") return projectPresenter;
        if (name === "toolPresenter") return toolPresenter;
        return {};
      },
    }));
    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => modelStore,
    }));
    vi.doMock("@iconify/react", () => ({
      Icon: () => null,
    }));

    const ArgosAgentsSettings = (await import("../../../src/renderer/settings/components/ArgosAgentsSettings")).default;

    const result = render(<ArgosAgentsSettings />);

    await act(async () => {});

    const thresholdInput = screen.getByTestId("auto-compaction-trigger-threshold-input");
    const retainInput = screen.getByTestId("auto-compaction-retain-recent-pairs-input");

    // PLACEHOLDER: was wrapper.findComponent(...).vm.$emit('update:modelValue', '')
    fireEvent.change(thresholdInput, { target: { value: "" } });
    fireEvent.change(retainInput, { target: { value: "oops" } });

    const saveButton = Array.from(result.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("common.save"),
    );

    expect(saveButton).toBeDefined();

    await fireEvent.click(saveButton!);
    await act(async () => {});

    expect(configPresenter.updateArgosAgent).toHaveBeenCalledTimes(1);

    const [, payload] = configPresenter.updateArgosAgent.mock.calls[0];
    expect(payload.config.autoCompactionTriggerThreshold).toBe(80);
    expect(payload.config.autoCompactionRetainRecentPairs).toBe(2);
  });

  it("fills the system prompt field from a prompt template dialog", async () => {
    vi.resetModules();

    const configPresenter = {
      listAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      getSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([
        {
          id: "writer",
          name: "Writer",
          content: "You are a writing assistant.",
        },
        {
          id: "coder",
          name: "Coder",
          content: "You write concise code.",
        },
      ]),
      updateArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: "argos-new" }),
      createArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: "argos-new" }),
      deleteArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const toolPresenter = {
      getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    };
    const projectPresenter = {
      getRecentProjects: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    };
    const modelStore = {
      allProviderModels: [],
      findModelByIdOrName: vi.fn<(...args: any[]) => any>(() => null),
    };

    vi.doMock("@api/legacy/presenters", () => ({
      useLegacyPresenter: (name: string) => {
        if (name === "configPresenter") return configPresenter;
        if (name === "projectPresenter") return projectPresenter;
        if (name === "toolPresenter") return toolPresenter;
        return {};
      },
    }));
    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => modelStore,
    }));
    vi.doMock("@iconify/react", () => ({
      Icon: () => null,
    }));

    const ArgosAgentsSettings = (await import("../../../src/renderer/settings/components/ArgosAgentsSettings")).default;

    const result = render(<ArgosAgentsSettings />);

    await act(async () => {});

    const pickerButton = Array.from(result.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("promptSetting.selectSystemPrompt"),
    );

    expect(pickerButton).toBeDefined();

    await fireEvent.click(pickerButton!);
    await act(async () => {});

    expect(configPresenter.getSystemPrompts).toHaveBeenCalledTimes(1);
    expect(result.container.textContent).toContain("Writer");
    expect(result.container.textContent).toContain("Coder");

    const templateButton = Array.from(result.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("You write concise code."),
    );

    expect(templateButton).toBeDefined();

    await fireEvent.click(templateButton!);
    await act(async () => {});

    const textareas = Array.from(result.container.querySelectorAll("textarea")).filter((textarea) =>
      textarea.getAttribute("placeholder")?.includes("settings.argosAgents.systemPromptPlaceholder"),
    );

    expect(textareas).toHaveLength(1);
    expect(textareas[0].value).toBe("You write concise code.");
  });

  it("shows an unsaved draft agent in the sidebar before persisting", async () => {
    vi.resetModules();

    const existingAgent = {
      id: "argos",
      type: "argos",
      name: "Argos",
      enabled: true,
      protected: true,
      description: "Writer agent",
      avatar: null,
      config: {},
    };
    const createdAgent = {
      id: "argos-new",
      type: "argos",
      name: "Draft Writer",
      enabled: true,
      protected: false,
      description: "",
      avatar: null,
      config: {},
    };

    const configPresenter = {
      listAgents: vi
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce([existingAgent])
        .mockResolvedValueOnce([existingAgent, createdAgent]),
      getSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      updateArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(existingAgent),
      createArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(createdAgent),
      deleteArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const toolPresenter = {
      getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    };
    const projectPresenter = {
      getRecentProjects: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    };
    const modelStore = {
      allProviderModels: [],
      findModelByIdOrName: vi.fn<(...args: any[]) => any>(() => null),
    };

    vi.doMock("@api/legacy/presenters", () => ({
      useLegacyPresenter: (name: string) => {
        if (name === "configPresenter") return configPresenter;
        if (name === "projectPresenter") return projectPresenter;
        if (name === "toolPresenter") return toolPresenter;
        return {};
      },
    }));
    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => modelStore,
    }));
    vi.doMock("@iconify/react", () => ({
      Icon: () => null,
    }));

    const ArgosAgentsSettings = (await import("../../../src/renderer/settings/components/ArgosAgentsSettings")).default;

    const result = render(<ArgosAgentsSettings />);

    await act(async () => {});

    const addButton = Array.from(result.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("common.add"),
    );
    expect(addButton).toBeDefined();

    await fireEvent.click(addButton!);
    await act(async () => {});

    expect(configPresenter.createArgosAgent).not.toHaveBeenCalled();
    const asideButtons = Array.from(result.container.querySelectorAll("aside button"));
    expect(asideButtons.some((button) => button.textContent?.includes("settings.argosAgents.unnamed"))).toBe(true);

    const nameInput = Array.from(result.container.querySelectorAll("input")).find((input) =>
      input.getAttribute("placeholder")?.includes("settings.argosAgents.namePlaceholder"),
    );

    expect(nameInput).toBeDefined();

    await fireEvent.change(nameInput!, { target: { value: "Draft Writer" } });
    await act(async () => {});

    const updatedAsideButtons = Array.from(result.container.querySelectorAll("aside button"));
    expect(updatedAsideButtons.some((button) => button.textContent?.includes("Draft Writer"))).toBe(true);

    const saveButton = Array.from(result.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("common.save"),
    );

    expect(saveButton).toBeDefined();

    await fireEvent.click(saveButton!);
    await act(async () => {});

    expect(configPresenter.createArgosAgent).toHaveBeenCalledTimes(1);
    expect(configPresenter.createArgosAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Draft Writer",
      }),
    );
  });

  it("stores an optional default directory on the agent config", async () => {
    vi.resetModules();

    const existingAgent = {
      id: "argos",
      type: "argos",
      name: "Argos",
      enabled: true,
      protected: true,
      description: "",
      avatar: null,
      config: {
        defaultProjectPath: "/workspaces/writer",
      },
    };

    const configPresenter = {
      listAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([existingAgent]),
      getSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      updateArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(existingAgent),
      createArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: "argos-new" }),
      deleteArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const toolPresenter = {
      getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    };
    const projectPresenter = {
      getRecentProjects: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue("/workspaces/selected"),
    };
    const modelStore = {
      allProviderModels: [],
      findModelByIdOrName: vi.fn<(...args: any[]) => any>(() => null),
    };

    vi.doMock("@api/legacy/presenters", () => ({
      useLegacyPresenter: (name: string) => {
        if (name === "configPresenter") return configPresenter;
        if (name === "projectPresenter") return projectPresenter;
        if (name === "toolPresenter") return toolPresenter;
        return {};
      },
    }));
    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => modelStore,
    }));
    vi.doMock("@iconify/react", () => ({
      Icon: () => null,
    }));

    const ArgosAgentsSettings = (await import("../../../src/renderer/settings/components/ArgosAgentsSettings")).default;

    const result = render(<ArgosAgentsSettings />);

    await act(async () => {});

    const directoryTrigger = Array.from(result.container.querySelectorAll("button")).find(
      (button) => button.getAttribute("title") === "/workspaces/writer",
    );

    expect(directoryTrigger).toBeDefined();
    expect(directoryTrigger?.textContent).toContain("writer");

    const pickButton = Array.from(result.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("common.project.openFolder"),
    );

    expect(pickButton).toBeDefined();

    await fireEvent.click(pickButton!);
    await act(async () => {});

    expect(projectPresenter.selectDirectory).toHaveBeenCalledTimes(1);
    expect(
      Array.from(result.container.querySelectorAll("button")).some(
        (button) => button.getAttribute("title") === "/workspaces/selected",
      ),
    ).toBe(true);

    const saveButton = Array.from(result.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("common.save"),
    );

    expect(saveButton).toBeDefined();

    await fireEvent.click(saveButton!);
    await act(async () => {});

    expect(configPresenter.updateArgosAgent).toHaveBeenCalledWith(
      "argos",
      expect.objectContaining({
        config: expect.objectContaining({
          defaultProjectPath: "/workspaces/selected",
        }),
      }),
    );
  });

  it("uses a flat target agent select for subagent slots", async () => {
    vi.resetModules();

    const existingAgent = {
      id: "argos",
      type: "argos",
      name: "Argos",
      enabled: true,
      protected: true,
      description: "Writer agent",
      avatar: null,
      config: {
        subagentEnabled: true,
        subagents: [
          {
            id: "slot-current",
            targetType: "self",
            displayName: "Current",
            description: "",
          },
          {
            id: "slot-reviewer",
            targetType: "agent",
            targetAgentId: "acp-reviewer",
            displayName: "Reviewer",
            description: "",
          },
        ],
      },
    };
    const acpAgent = {
      id: "acp-reviewer",
      type: "acp",
      name: "ACP Reviewer",
      enabled: true,
      source: "manual",
      protected: false,
      description: "ACP reviewer",
      avatar: null,
      config: {},
    };
    const uninstalledRegistryAgent = {
      id: "acp-uninstalled",
      type: "acp",
      name: "ACP Not Installed",
      enabled: true,
      source: "registry",
      protected: false,
      description: "ACP not installed",
      avatar: null,
      config: {},
      installState: {
        status: "not_installed",
      },
    };

    const configPresenter = {
      listAgents: vi
        .fn<(...args: any[]) => any>()
        .mockResolvedValue([existingAgent, acpAgent, uninstalledRegistryAgent]),
      getSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      updateArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(existingAgent),
      createArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: "argos-new" }),
      deleteArgosAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const toolPresenter = {
      getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    };
    const projectPresenter = {
      getRecentProjects: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      selectDirectory: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    };
    const modelStore = {
      allProviderModels: [],
      findModelByIdOrName: vi.fn<(...args: any[]) => any>(() => null),
    };

    vi.doMock("@api/legacy/presenters", () => ({
      useLegacyPresenter: (name: string) => {
        if (name === "configPresenter") return configPresenter;
        if (name === "projectPresenter") return projectPresenter;
        if (name === "toolPresenter") return toolPresenter;
        return {};
      },
    }));
    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => modelStore,
    }));
    vi.doMock("@iconify/react", () => ({
      Icon: () => null,
    }));

    const ArgosAgentsSettings = (await import("../../../src/renderer/settings/components/ArgosAgentsSettings")).default;

    const result = render(<ArgosAgentsSettings />);

    await act(async () => {});

    expect(result.container.textContent).not.toContain("settings.argosAgents.subagentTargetType");

    const targetSelects = result.container.querySelectorAll("select");
    expect(targetSelects).toHaveLength(2);
    expect(targetSelects[0].textContent).toContain("settings.argosAgents.subagentTargetSelf");
    expect(targetSelects[0].textContent).toContain("ACP Reviewer");
    expect(targetSelects[0].textContent).not.toContain("ACP Not Installed");

    fireEvent.change(targetSelects[0], { target: { value: "acp-reviewer" } });
    fireEvent.change(targetSelects[1], { target: { value: "__current_agent__" } });

    const saveButton = Array.from(result.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("common.save"),
    );

    expect(saveButton).toBeDefined();

    await fireEvent.click(saveButton!);
    await act(async () => {});

    const [, payload] = configPresenter.updateArgosAgent.mock.calls[0];
    expect(payload.config.subagents).toEqual([
      {
        id: "slot-current",
        targetType: "agent",
        targetAgentId: "acp-reviewer",
        displayName: "Current",
        description: "",
      },
      {
        id: "slot-reviewer",
        targetType: "self",
        displayName: "Reviewer",
        description: "",
      },
    ]);
  });
});
