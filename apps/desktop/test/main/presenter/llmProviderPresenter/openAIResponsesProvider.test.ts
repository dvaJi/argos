import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IConfigPresenter, LLM_PROVIDER, ModelConfig } from "@argos/shared/presenter";
import { AiSdkProvider } from "../../../../src/main/presenter/llmProviderPresenter/providers/aiSdkProvider";

const { mockRunAiSdkCoreStream, mockRunAiSdkDimensions, mockRunAiSdkEmbeddings, mockRunAiSdkGenerateText } = vi.hoisted(
  () => ({
    mockRunAiSdkCoreStream: vi.fn<(...args: any[]) => any>(),
    mockRunAiSdkDimensions: vi.fn<(...args: any[]) => any>(),
    mockRunAiSdkEmbeddings: vi.fn<(...args: any[]) => any>(),
    mockRunAiSdkGenerateText: vi.fn<(...args: any[]) => any>(),
  }),
);

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

vi.mock("../../../../src/main/presenter/llmProviderPresenter/aiSdk", () => ({
  runAiSdkCoreStream: mockRunAiSdkCoreStream,
  runAiSdkDimensions: mockRunAiSdkDimensions,
  runAiSdkEmbeddings: mockRunAiSdkEmbeddings,
  runAiSdkGenerateText: mockRunAiSdkGenerateText,
}));

const createProvider = (overrides?: Partial<LLM_PROVIDER>): LLM_PROVIDER => ({
  id: "openai",
  name: "OpenAI",
  apiType: "openai-responses",
  apiKey: "test-key",
  baseUrl: "https://api.openai.com/v1",
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

describe("OpenAIResponsesProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAiSdkCoreStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "stop", stop_reason: "complete" };
      },
    });
  });

  it("uses the responses runtime for official OpenAI providers", async () => {
    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    (provider as any).isInitialized = true;

    try {
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
    } catch {}

    const context = mockRunAiSdkCoreStream.mock.calls.at(-1)?.[0];

    expect(context.providerKind).toBe("openai-responses");
    expect(context.shouldUseImageGeneration("gpt-image-1", {} as ModelConfig)).toBe(true);
    expect(
      context.shouldUseImageGeneration("custom-image-model", {
        type: "imageGeneration",
      } as ModelConfig),
    ).toBe(true);
    expect(context.shouldUseImageGeneration("gpt-4o", {} as ModelConfig)).toBe(false);
  });

  it("uses azure runtime semantics for azure-openai responses providers", async () => {
    const provider = new AiSdkProvider(
      createProvider({
        id: "azure-openai",
        name: "Azure OpenAI",
        baseUrl: "https://example.openai.azure.com/openai",
      }),
      createConfigPresenter(),
    );
    (provider as any).isInitialized = true;

    try {
      for await (const _event of provider.coreStream(
        [{ role: "user", content: "paint" }],
        "gpt-image-1",
        {
          apiEndpoint: "image",
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
    } catch {}

    const context = mockRunAiSdkCoreStream.mock.calls.at(-1)?.[0];

    expect(context.providerKind).toBe("azure");
    expect(context.buildTraceHeaders()).toMatchObject({
      "Content-Type": "application/json",
      "api-key": "test-key",
    });
    expect(
      context.shouldUseImageGeneration("gpt-image-1", {
        apiEndpoint: "image",
      } as ModelConfig),
    ).toBe(true);
    expect(
      context.shouldUseImageGeneration("custom-image-model", {
        type: "imageGeneration",
      } as ModelConfig),
    ).toBe(false);
    expect(context.shouldUseImageGeneration("gpt-image-1", {} as ModelConfig)).toBe(false);
  });

  it("submits audio transcriptions to the OpenAI audio endpoint", async () => {
    const fetchMock = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true,
      json: vi.fn<(...args: any[]) => any>().mockResolvedValue({ text: "transcribed text" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    (provider as any).isInitialized = true;

    const text = await provider.transcribeAudio("gpt-4o-mini-transcribe", "AQID", "audio/wav");

    expect(text).toBe("transcribed text");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      }),
    );
  });

  it("surfaces official OpenAI audio transcription errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<(...args: any[]) => any>().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn<(...args: any[]) => any>().mockResolvedValue("openai transcription failed"),
      }),
    );

    const provider = new AiSdkProvider(createProvider(), createConfigPresenter());
    (provider as any).isInitialized = true;

    await expect(provider.transcribeAudio("gpt-4o-mini-transcribe", "AQID", "audio/wav")).rejects.toThrow(
      "openai transcription failed",
    );
  });
});
