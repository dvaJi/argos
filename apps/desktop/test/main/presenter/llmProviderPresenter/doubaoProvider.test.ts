import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IConfigPresenter, LLM_PROVIDER } from "@shared/presenter";
import { AiSdkProvider } from "../../../../src/main/presenter/llmProviderPresenter/providers/aiSdkProvider";

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
  id: "doubao",
  name: "Doubao",
  apiType: "doubao",
  apiKey: "test-key",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
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

describe("AiSdkProvider doubao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps doubao catalog entries into provider models", async () => {
    mockGetProvider.mockReturnValue({
      id: "doubao",
      name: "Doubao",
      models: [
        {
          id: "doubao-seed-2.0-pro",
          display_name: "Doubao-Seed 2.0 Pro",
          tool_call: true,
          reasoning: {
            supported: true,
          },
          modalities: {
            input: ["text", "image", "video"],
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
        id: "doubao-seed-2.0-pro",
        name: "Doubao-Seed 2.0 Pro",
        providerId: "doubao",
        vision: true,
        functionCall: true,
        reasoning: true,
      }),
    ]);
  });
});
