import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IConfigPresenter, LLM_PROVIDER } from "@shared/presenter";
import { AiSdkProvider } from "../../../../src/main/presenter/llmProviderPresenter/providers/aiSdkProvider";

vi.mock("electron", () => ({
  app: {
    getName: vi.fn<(...args: any[]) => any>(() => "Argos"),
    getVersion: vi.fn<(...args: any[]) => any>(() => "0.0.0-test"),
    getPath: vi.fn<(...args: any[]) => any>(() => "/mock/path"),
    isReady: vi.fn<(...args: any[]) => any>(() => true),
    on: vi.fn<(...args: any[]) => any>(),
  },
}));

vi.mock("@/presenter", () => ({
  presenter: {
    devicePresenter: {
      cacheImage: vi.fn<(...args: any[]) => any>(),
    },
  },
}));

vi.mock("@/eventbus", () => ({
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

vi.mock("@/events", () => ({
  CONFIG_EVENTS: {
    PROXY_RESOLVED: "PROXY_RESOLVED",
    PROVIDER_ATOMIC_UPDATE: "PROVIDER_ATOMIC_UPDATE",
    PROVIDER_BATCH_UPDATE: "PROVIDER_BATCH_UPDATE",
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

vi.mock("../../../../src/main/presenter/llmProviderPresenter/aiSdk", () => ({
  runAiSdkCoreStream: vi.fn<(...args: any[]) => any>(),
  runAiSdkDimensions: vi.fn<(...args: any[]) => any>(),
  runAiSdkEmbeddings: vi.fn<(...args: any[]) => any>(),
  runAiSdkGenerateText: vi.fn<(...args: any[]) => any>(),
}));

const createConfigPresenter = (): IConfigPresenter =>
  ({
    getProviderModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    getCustomModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    getDbProviderModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    getModelConfig: vi.fn<(...args: any[]) => any>().mockReturnValue(undefined),
    getSetting: vi.fn<(...args: any[]) => any>().mockReturnValue(undefined),
    setProviderModels: vi.fn<(...args: any[]) => any>(),
    getModelStatus: vi.fn<(...args: any[]) => any>().mockReturnValue(true),
  }) as unknown as IConfigPresenter;

const createProvider = (overrides?: Partial<LLM_PROVIDER>): LLM_PROVIDER => ({
  id: "zenmux",
  name: "ZenMux",
  apiType: "zenmux",
  apiKey: "test-key",
  baseUrl: "https://zenmux.ai/api/v1/",
  enable: false,
  ...overrides,
});

describe("AiSdkProvider zenmux", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes anthropic models through the anthropic runtime", async () => {
    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    const routeDecision = (provider as any).resolveRouteDecision("anthropic/claude-sonnet-4-5");
    const runtimeProvider = (provider as any).getRuntimeProvider(routeDecision) as LLM_PROVIDER;

    expect(routeDecision.providerKind).toBe("anthropic");
    expect(runtimeProvider.baseUrl).toBe("https://zenmux.ai/api/anthropic");
  });

  it("routes non-anthropic models through the openai-compatible runtime", async () => {
    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    const routeDecision = (provider as any).resolveRouteDecision("moonshotai/kimi-k2.5");

    expect(routeDecision.providerKind).toBe("openai-compatible");
  });

  it("fetches model metadata from the shared OpenAI-compatible path and keeps the ZenMux group", async () => {
    const fetchMock = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true,
      json: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        data: [{ id: "moonshotai/kimi-k2.5" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());

    const models = await provider.fetchModels();

    expect(models).toEqual([
      expect.objectContaining({
        id: "moonshotai/kimi-k2.5",
        group: "ZenMux",
        providerId: "zenmux",
      }),
    ]);
  });

  it("fails fast for embeddings on anthropic models", async () => {
    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());

    await expect(provider.getEmbeddings("anthropic/claude-sonnet-4-5", ["hello"])).rejects.toThrow(
      "Embeddings not supported for Anthropic models: anthropic/claude-sonnet-4-5",
    );
  });

  it("fails fast for embedding dimensions on anthropic models", async () => {
    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());

    await expect(provider.getDimensions("anthropic/claude-sonnet-4-5")).rejects.toThrow(
      "Embeddings not supported for Anthropic models: anthropic/claude-sonnet-4-5",
    );
  });
});
