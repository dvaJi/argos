import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IConfigPresenter, LLM_PROVIDER, ModelConfig } from "@argos/shared/presenter";
import { AiSdkProvider } from "../../../../src/main/presenter/llmProviderPresenter/providers/aiSdkProvider";

const { mockRunAiSdkCoreStream } = vi.hoisted(() => ({
  mockRunAiSdkCoreStream: vi.fn<(...args: any[]) => any>(),
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
  runAiSdkCoreStream: mockRunAiSdkCoreStream,
  runAiSdkDimensions: vi.fn<(...args: any[]) => any>(),
  runAiSdkEmbeddings: vi.fn<(...args: any[]) => any>(),
  runAiSdkGenerateText: vi.fn<(...args: any[]) => any>(),
}));

const createConfigPresenter = (): IConfigPresenter =>
  ({
    getProviders: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    getProviderModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    getCustomModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    getModelConfig: vi.fn<(...args: any[]) => any>().mockReturnValue(undefined),
    getSetting: vi.fn<(...args: any[]) => any>().mockReturnValue(undefined),
    setProviderModels: vi.fn<(...args: any[]) => any>(),
    getModelStatus: vi.fn<(...args: any[]) => any>().mockReturnValue(true),
  }) as unknown as IConfigPresenter;

const createProvider = (): LLM_PROVIDER =>
  ({
    id: "aihubmix",
    name: "Aihubmix",
    apiType: "openai-compatible",
    apiKey: "test-key",
    baseUrl: "https://aihubmix.com/v1",
    enable: false,
  }) as LLM_PROVIDER;

describe("AihubmixProvider AI SDK runtime headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAiSdkCoreStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "stop", stop_reason: "complete" };
      },
    });
  });

  it("preserves the Argos APP-Code header in AI SDK mode", async () => {
    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    (provider as any).isInitialized = true;

    for await (const _event of provider.coreStream(
      [{ role: "user", content: "hello" }],
      "gpt-4o",
      {
        maxTokens: 1024,
        contextLength: 8192,
        vision: false,
        functionCall: false,
        reasoning: false,
        type: "chat",
      } as ModelConfig,
      0.7,
      256,
      [],
    )) {
      break;
    }

    const context = mockRunAiSdkCoreStream.mock.calls.at(-1)?.[0];

    expect(context.defaultHeaders).toMatchObject({
      "APP-Code": "SMUE7630",
      "X-Title": "Argos",
    });
  });

  it("treats Seedance models as video generation even when metadata is still chat", async () => {
    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    (provider as any).isInitialized = true;

    const modelConfig = {
      maxTokens: 1024,
      contextLength: 8192,
      vision: false,
      functionCall: false,
      reasoning: false,
      type: "chat",
    } as ModelConfig;

    for await (const _event of provider.coreStream(
      [{ role: "user", content: "Generate a video of Mars drinking coffee 2s" }],
      "doubao-seedance-2-0-fast-260128",
      modelConfig,
      0.7,
      256,
      [],
    )) {
      break;
    }

    const context = mockRunAiSdkCoreStream.mock.calls.at(-1)?.[0];

    expect(context.providerKind).toBe("openai-compatible");
    expect(context.shouldUseVideoGeneration("doubao-seedance-2-0-fast-260128", modelConfig)).toBe(true);
    expect(context.shouldUseVideoGeneration("gpt-4o", { type: "chat" } as ModelConfig)).toBe(false);
  });
});
