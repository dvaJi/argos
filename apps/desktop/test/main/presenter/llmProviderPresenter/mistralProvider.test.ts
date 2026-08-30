import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IConfigPresenter, LLM_PROVIDER } from "@argos/shared/presenter";
import { AiSdkProvider } from "../../../../src/main/presenter/llmProviderPresenter/providers/aiSdkProvider";
import { resolveAiSdkProviderDefinition } from "@argos/backend-core/provider/registry";

const { mockGetProvider, mockRunAiSdkGenerateText } = vi.hoisted(() => ({
  mockGetProvider: vi.fn<(...args: any[]) => any>(),
  mockRunAiSdkGenerateText: vi.fn<(...args: any[]) => any>(),
}));

vi.mock("electron", () => ({
  app: {
    getName: vi.fn<(...args: any[]) => any>(() => "Argos"),
    getVersion: vi.fn<(...args: any[]) => any>(() => "0.0.0-test"),
    getPath: vi.fn<(...args: any[]) => any>(() => "/mock/path"),
    isReady: vi.fn<(...args: any[]) => any>(() => true),
    on: vi.fn<(...args: any[]) => any>(),
  },
}));

vi.mock("@argos/shared/logger", async () => {
  const { mockSharedLogger } = await import("../../../mocks/sharedLogger");
  return mockSharedLogger();
});

vi.mock("#/eventbus", () => ({
  eventBus: {
    on: vi.fn<(...args: any[]) => any>(),
    sendToRenderer: vi.fn<(...args: any[]) => any>(),
    sendToMain: vi.fn<(...args: any[]) => any>(),
    emit: vi.fn<(...args: any[]) => any>(),
    send: vi.fn<(...args: any[]) => any>(),
  },
  SendTarget: {
    ALL_WINDOWS: "ALL_WINDOWS",
  },
}));

vi.mock("#/events", () => ({
  CONFIG_EVENTS: {
    MODEL_LIST_CHANGED: "MODEL_LIST_CHANGED",
  },
  PROVIDER_DB_EVENTS: {
    LOADED: "LOADED",
    UPDATED: "UPDATED",
  },
  NOTIFICATION_EVENTS: {
    SHOW_ERROR: "SHOW_ERROR",
  },
}));

vi.mock("../../../../src/main/presenter/proxyConfig", () => ({
  proxyConfig: {
    getProxyUrl: vi.fn<(...args: any[]) => any>().mockReturnValue(null),
  },
}));

vi.mock("../../../../src/main/presenter/configPresenter/providerDbLoader", () => ({
  providerDbLoader: {
    getDb: vi.fn<(...args: any[]) => any>().mockReturnValue(null),
    getProvider: mockGetProvider,
    getModel: vi.fn<(...args: any[]) => any>(),
  },
}));

vi.mock("../../../../src/main/presenter/llmProviderPresenter/aiSdk", () => ({
  runAiSdkCoreStream: vi.fn<(...args: any[]) => any>(),
  runAiSdkDimensions: vi.fn<(...args: any[]) => any>(),
  runAiSdkEmbeddings: vi.fn<(...args: any[]) => any>(),
  runAiSdkGenerateText: mockRunAiSdkGenerateText,
}));

const createProvider = (overrides?: Partial<LLM_PROVIDER>): LLM_PROVIDER => ({
  id: "mistral",
  name: "Mistral",
  apiType: "mistral",
  apiKey: "test-key",
  baseUrl: "https://api.mistral.ai/v1",
  enable: false,
  ...overrides,
});

const createConfigPresenter = (): IConfigPresenter =>
  ({
    getProviderModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    getCustomModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    getModelConfig: vi.fn<(...args: any[]) => any>().mockReturnValue(undefined),
    getSetting: vi.fn<(...args: any[]) => any>().mockReturnValue(undefined),
    setProviderModels: vi.fn<(...args: any[]) => any>(),
    getModelStatus: vi.fn<(...args: any[]) => any>().mockReturnValue(true),
    setModelConfig: vi.fn<(...args: any[]) => any>(),
    hasUserModelConfig: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
  }) as unknown as IConfigPresenter;

describe("AiSdkProvider mistral", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAiSdkGenerateText.mockResolvedValue({ content: "ok" });
  });

  it("resolves Mistral by id and by custom provider apiType", () => {
    expect(resolveAiSdkProviderDefinition(createProvider())).toMatchObject({
      runtimeKind: "openai-compatible",
      modelSource: "provider-db",
      providerDbSourceId: "mistral",
      checkStrategy: "generate-text",
      credentialStrategy: "api-key",
      checkModelId: "mistral-small-latest",
    });

    expect(
      resolveAiSdkProviderDefinition(
        createProvider({
          id: "custom-mistral",
          apiType: "mistral",
        }),
      ),
    ).toMatchObject({
      runtimeKind: "openai-compatible",
      modelSource: "provider-db",
    });
  });

  it("maps Mistral provider DB metadata into provider models", async () => {
    mockGetProvider.mockReturnValue({
      id: "mistral",
      name: "Mistral",
      models: [
        {
          id: "mistral-small-latest",
          display_name: "Mistral Small",
          tool_call: true,
          reasoning: {
            supported: true,
          },
          modalities: {
            input: ["text", "image"],
            output: ["text"],
          },
          limit: {
            context: 256000,
            output: 64000,
          },
        },
      ],
    });

    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    const models = await provider.fetchModels();

    expect(models).toEqual([
      expect.objectContaining({
        id: "mistral-small-latest",
        name: "Mistral Small",
        group: "default",
        providerId: "mistral",
        vision: true,
        functionCall: true,
        reasoning: true,
        contextLength: 256000,
        maxTokens: 32000,
      }),
    ]);
  });

  it("uses Mistral provider DB metadata for custom Mistral providers", async () => {
    mockGetProvider.mockReturnValue({
      id: "mistral",
      name: "Mistral",
      models: [
        {
          id: "mistral-large-latest",
          display_name: "Mistral Large",
        },
      ],
    });

    const provider = new AiSdkProvider(
      createProvider({
        id: "custom-mistral",
        apiType: "mistral",
        custom: true,
      }),
      createConfigPresenter(),
    );
    const models = await provider.fetchModels();

    expect(mockGetProvider).toHaveBeenCalledWith("mistral");
    expect(models).toEqual([
      expect.objectContaining({
        id: "mistral-large-latest",
        providerId: "custom-mistral",
      }),
    ]);
  });

  it("fails provider verification before making a request when the API key is missing", async () => {
    const provider = new AiSdkProvider(
      createProvider({
        apiKey: "",
      }),
      createConfigPresenter(),
    );

    await expect(provider.check()).resolves.toEqual({
      isOk: false,
      errorMsg: "Missing API key",
    });
    expect(mockRunAiSdkGenerateText).not.toHaveBeenCalled();
  });

  it("verifies Mistral with a small generate-text request", async () => {
    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    (provider as any).isInitialized = true;

    await expect(provider.check()).resolves.toEqual({
      isOk: true,
      errorMsg: null,
    });
    expect(mockRunAiSdkGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKind: "openai-compatible",
        provider: expect.objectContaining({
          id: "mistral",
          baseUrl: "https://api.mistral.ai/v1",
        }),
      }),
      [{ role: "user", content: "Hello" }],
      "mistral-small-latest",
      expect.any(Object),
      0.2,
      16,
    );
  });
});
