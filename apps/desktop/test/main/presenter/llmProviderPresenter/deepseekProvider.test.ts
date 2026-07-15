import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IConfigPresenter, LLM_PROVIDER } from "@argos/shared/presenter";
import { AiSdkProvider } from "../../../../src/main/presenter/llmProviderPresenter/providers/aiSdkProvider";
import { resolveAiSdkProviderDefinition } from "@argos/backend-core/provider/registry";

const { mockGetProvider } = vi.hoisted(() => ({
  mockGetProvider: vi.fn<(...args: any[]) => any>(),
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
  runAiSdkGenerateText: vi.fn<(...args: any[]) => any>(),
}));

const createProvider = (overrides?: Partial<LLM_PROVIDER>): LLM_PROVIDER => ({
  id: "deepseek",
  name: "Deepseek",
  apiType: "deepseek",
  apiKey: "sk-test-deepseek-key",
  baseUrl: "https://api.deepseek.com/v1",
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
  }) as unknown as IConfigPresenter;

describe("AiSdkProvider deepseek", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the provider-db model source so refresh does not hit /v1/models", () => {
    const definition = resolveAiSdkProviderDefinition(createProvider());
    expect(definition?.modelSource).toBe("provider-db");
  });

  it("maps deepseek catalog entries into provider models", async () => {
    mockGetProvider.mockReturnValue({
      id: "deepseek",
      name: "DeepSeek",
      models: [
        {
          id: "deepseek-chat",
          display_name: "DeepSeek Chat",
          tool_call: true,
          reasoning: {
            supported: true,
          },
          modalities: {
            input: ["text", "image"],
            output: ["text"],
          },
          limit: {
            context: 64000,
            output: 8000,
          },
        },
      ],
    });

    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    const models = await provider.fetchModels();

    expect(models).toEqual([
      expect.objectContaining({
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        providerId: "deepseek",
        vision: true,
        functionCall: true,
        reasoning: true,
      }),
    ]);
  });

  it("refreshModels resolves from the provider db without calling the unsupported /models endpoint", async () => {
    const fetchMock = vi.fn<(...args: any[]) => any>().mockResolvedValue(
      new Response(JSON.stringify({ error: "Authentication Fails (auth header format should be Bearer sk-...)" }), {
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    mockGetProvider.mockReturnValue({
      id: "deepseek",
      name: "DeepSeek",
      models: [
        {
          id: "deepseek-reasoner",
          display_name: "DeepSeek Reasoner",
          tool_call: true,
          modalities: {
            input: ["text"],
            output: ["text"],
          },
          limit: {
            context: 64000,
            output: 8000,
          },
        },
      ],
    });

    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    await provider.refreshModels();

    const modelsUrlCalls = fetchMock.mock.calls.filter((call) => {
      const url = String(call[0] ?? "");
      return url.includes("/models");
    });
    expect(modelsUrlCalls).toHaveLength(0);
  });
});
