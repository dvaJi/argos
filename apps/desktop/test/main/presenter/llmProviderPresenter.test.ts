import { describe, it, expect, beforeEach, vi, beforeAll, afterEach } from "vitest";
import { LLMProviderPresenter } from "../../../src/main/presenter/llmProviderPresenter/index";
import { ConfigPresenter } from "../../../src/main/presenter/configPresenter/index";
import { LLM_PROVIDER, ChatMessage, ISQLitePresenter } from "@shared/presenter";
import { AiSdkProvider } from "../../../src/main/presenter/llmProviderPresenter/providers/aiSdkProvider";
import { ApiEndpointType, ModelType } from "@shared/model";

const { mockRunAiSdkCoreStream, mockRunAiSdkDimensions, mockRunAiSdkEmbeddings, mockRunAiSdkGenerateText } = vi.hoisted(
  () => ({
    mockRunAiSdkCoreStream: vi.fn<(...args: any[]) => any>(),
    mockRunAiSdkDimensions: vi.fn<(...args: any[]) => any>(),
    mockRunAiSdkEmbeddings: vi.fn<(...args: any[]) => any>(),
    mockRunAiSdkGenerateText: vi.fn<(...args: any[]) => any>().mockResolvedValue({ content: "mock completion" }),
  }),
);

// Ensure electron is mocked for this suite to avoid CJS named export issues
vi.mock("electron", () => {
  return {
    app: {
      getName: vi.fn<(...args: any[]) => any>(() => "Argos"),
      getVersion: vi.fn<(...args: any[]) => any>(() => "0.0.0-test"),
      getPath: vi.fn<(...args: any[]) => any>(() => "/mock/path"),
      isReady: vi.fn<(...args: any[]) => any>(() => true),
      on: vi.fn<(...args: any[]) => any>(),
    },
    session: {},
    ipcMain: {
      on: vi.fn<(...args: any[]) => any>(),
      handle: vi.fn<(...args: any[]) => any>(),
      removeHandler: vi.fn<(...args: any[]) => any>(),
    },
    BrowserWindow: vi.fn<(...args: any[]) => any>(() => ({
      loadURL: vi.fn<(...args: any[]) => any>(),
      loadFile: vi.fn<(...args: any[]) => any>(),
      on: vi.fn<(...args: any[]) => any>(),
      webContents: {
        send: vi.fn<(...args: any[]) => any>(),
        on: vi.fn<(...args: any[]) => any>(),
        isDestroyed: vi.fn<(...args: any[]) => any>(() => false),
      },
      isDestroyed: vi.fn<(...args: any[]) => any>(() => false),
      close: vi.fn<(...args: any[]) => any>(),
      show: vi.fn<(...args: any[]) => any>(),
      hide: vi.fn<(...args: any[]) => any>(),
    })),
    dialog: {
      showOpenDialog: vi.fn<(...args: any[]) => any>(),
    },
    shell: {
      openExternal: vi.fn<(...args: any[]) => any>(),
    },
  };
});

// Mock eventBus
vi.mock("@/eventbus", () => ({
  eventBus: {
    on: vi.fn<(...args: any[]) => any>(),
    sendToRenderer: vi.fn<(...args: any[]) => any>(),
    emit: vi.fn<(...args: any[]) => any>(),
    send: vi.fn<(...args: any[]) => any>(),
  },
  SendTarget: {
    ALL_WINDOWS: "ALL_WINDOWS",
  },
}));

const presenterRuntimeMock = vi.hoisted(() => ({
  toolPresenter: {
    getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    preCheckToolPermission: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    callTool: vi.fn<(...args: any[]) => any>().mockResolvedValue({ content: "Mock tool response", rawData: {} }),
  },
  mcpPresenter: {
    getAllToolDefinitions: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    callTool: vi.fn<(...args: any[]) => any>().mockResolvedValue({ content: "Mock tool response", rawData: {} }),
  },
  yoBrowserPresenter: {},
}));

// Mock presenter
vi.mock("@/presenter", () => ({
  presenter: presenterRuntimeMock,
}));

// Mock proxy config
vi.mock("@/presenter/proxyConfig", () => ({
  proxyConfig: {
    getProxyUrl: vi.fn<(...args: any[]) => any>().mockReturnValue(null),
  },
}));

vi.mock("../../../src/main/presenter/llmProviderPresenter/aiSdk", () => ({
  runAiSdkCoreStream: mockRunAiSdkCoreStream,
  runAiSdkDimensions: mockRunAiSdkDimensions,
  runAiSdkEmbeddings: mockRunAiSdkEmbeddings,
  runAiSdkGenerateText: mockRunAiSdkGenerateText,
}));

describe("LLMProviderPresenter Integration Tests", () => {
  let llmProviderPresenter: LLMProviderPresenter;
  let mockConfigPresenter: ConfigPresenter;
  const mockSqlitePresenter: ISQLitePresenter = {
    getAcpSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    upsertAcpSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    updateAcpSessionId: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    updateAcpWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    updateAcpSessionStatus: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    deleteAcpSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    deleteAcpSessions: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    close: vi.fn<(...args: any[]) => any>(),
    createConversation: vi.fn<(...args: any[]) => any>(),
    deleteConversation: vi.fn<(...args: any[]) => any>(),
    renameConversation: vi.fn<(...args: any[]) => any>(),
    getConversation: vi.fn<(...args: any[]) => any>(),
    updateConversation: vi.fn<(...args: any[]) => any>(),
    getConversationList: vi.fn<(...args: any[]) => any>(),
    getConversationCount: vi.fn<(...args: any[]) => any>(),
    insertMessage: vi.fn<(...args: any[]) => any>(),
    queryMessages: vi.fn<(...args: any[]) => any>(),
    deleteAllMessages: vi.fn<(...args: any[]) => any>(),
    runTransaction: vi.fn<(...args: any[]) => any>(),
    getMessage: vi.fn<(...args: any[]) => any>(),
    getMessageVariants: vi.fn<(...args: any[]) => any>(),
    updateMessage: vi.fn<(...args: any[]) => any>(),
    updateMessageParentId: vi.fn<(...args: any[]) => any>(),
    deleteMessage: vi.fn<(...args: any[]) => any>(),
    getMaxOrderSeq: vi.fn<(...args: any[]) => any>(),
    addMessageAttachment: vi.fn<(...args: any[]) => any>(),
    getMessageAttachments: vi.fn<(...args: any[]) => any>(),
    getLastUserMessage: vi.fn<(...args: any[]) => any>(),
    getMainMessageByParentId: vi.fn<(...args: any[]) => any>(),
    deleteAllMessagesInConversation: vi.fn<(...args: any[]) => any>(),
  } as unknown as ISQLitePresenter;

  // Mock OpenAI Compatible Provider config
  const mockProvider: LLM_PROVIDER = {
    id: "mock-openai-api",
    name: "Mock OpenAI API",
    apiType: "openai-compatible",
    apiKey: "argosIsAwesome",
    baseUrl: "https://mockllm.anya2a.com/v1",
    enable: true,
  };

  beforeAll(() => {
    // Mock ConfigPresenter methods
    const mockConfigPresenterInstance = {
      getProviders: vi.fn<(...args: any[]) => any>().mockReturnValue([mockProvider]),
      getProviderById: vi.fn<(...args: any[]) => any>().mockReturnValue(mockProvider),
      getModelConfig: vi.fn<(...args: any[]) => any>().mockReturnValue({
        maxTokens: 4096,
        contextLength: 4096,
        temperature: 0.7,
        vision: false,
        functionCall: false,
        reasoning: false,
      }),
      getSetting: vi.fn<(...args: any[]) => any>().mockImplementation((key: string) => {
        if (key === "azureApiVersion") return "2024-02-01";
        return undefined;
      }),
      setModelStatus: vi.fn<(...args: any[]) => any>(),
      updateCustomModel: vi.fn<(...args: any[]) => any>(),
      setProviderModels: vi.fn<(...args: any[]) => any>(),
      getCustomModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      getProviderModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      getModelStatus: vi.fn<(...args: any[]) => any>().mockReturnValue(true),
      enableModel: vi.fn<(...args: any[]) => any>(),
      setCustomModels: vi.fn<(...args: any[]) => any>(),
      addCustomModel: vi.fn<(...args: any[]) => any>(),
      removeCustomModel: vi.fn<(...args: any[]) => any>(),
    };

    mockConfigPresenter = mockConfigPresenterInstance as unknown as ConfigPresenter;
  });

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockRunAiSdkGenerateText.mockResolvedValue({ content: "mock completion" });

    vi.stubGlobal(
      "fetch",
      vi.fn<(...args: any[]) => any>().mockResolvedValue({
        ok: true,
        json: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          data: [{ id: "mock-gpt-thinking" }, { id: "gpt-4-mock" }, { id: "mock-gpt-markdown" }],
        }),
        text: vi.fn<(...args: any[]) => any>().mockResolvedValue(""),
      }),
    );

    // Reset mock implementations
    mockConfigPresenter.getProviders = vi.fn<(...args: any[]) => any>().mockReturnValue([mockProvider]);
    mockConfigPresenter.getProviderById = vi.fn<(...args: any[]) => any>().mockReturnValue(mockProvider);
    mockConfigPresenter.getModelConfig = vi.fn<(...args: any[]) => any>().mockReturnValue({
      maxTokens: 4096,
      contextLength: 4096,
      temperature: 0.7,
      vision: false,
      functionCall: false,
      reasoning: false,
      type: "chat",
    });
    mockConfigPresenter.enableModel = vi.fn<(...args: any[]) => any>();
    mockConfigPresenter.setProviderModels = vi.fn<(...args: any[]) => any>();
    mockConfigPresenter.getCustomModels = vi.fn<(...args: any[]) => any>().mockReturnValue([]);
    mockConfigPresenter.getProviderModels = vi.fn<(...args: any[]) => any>().mockReturnValue([]);
    mockConfigPresenter.getModelStatus = vi.fn<(...args: any[]) => any>().mockReturnValue(true);

    // Create new instance for each test
    llmProviderPresenter = new LLMProviderPresenter(
      mockConfigPresenter,
      mockSqlitePresenter,
      presenterRuntimeMock.mcpPresenter as any,
    );
  });

  afterEach(async () => {
    // Stop all active streams after each test
    const activeStreams = (llmProviderPresenter as any).activeStreams as Map<string, any>;
    for (const [eventId] of activeStreams) {
      await llmProviderPresenter.stopStream(eventId);
    }

    // Wait for any pending async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    vi.unstubAllGlobals();
  });

  describe("Basic Provider Management", () => {
    it("should initialize with providers", () => {
      const providers = llmProviderPresenter.getProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("mock-openai-api");
    });

    it("should get provider by id", () => {
      const provider = llmProviderPresenter.getProviderById("mock-openai-api");
      expect(provider).toBeDefined();
      expect(provider.id).toBe("mock-openai-api");
      expect(provider.apiType).toBe("openai-compatible");
    });

    it("should set current provider", async () => {
      await llmProviderPresenter.setCurrentProvider("mock-openai-api");
      const currentProvider = llmProviderPresenter.getCurrentProvider();
      expect(currentProvider?.id).toBe("mock-openai-api");
    });

    it("defers provider bootstrap until a provider instance is requested", async () => {
      const fetchSpy = vi.spyOn<(...args: any[]) => any>(AiSdkProvider.prototype, "fetchModels").mockResolvedValue([]);

      const presenter = new LLMProviderPresenter(
        mockConfigPresenter,
        mockSqlitePresenter,
        presenterRuntimeMock.mcpPresenter as any,
      );

      await Promise.resolve();
      await Promise.resolve();

      expect(fetchSpy).not.toHaveBeenCalled();

      presenter.getProviderInstance("mock-openai-api");
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("should resolve novita via apiType fallback without an id-specific provider mapping", () => {
      const novitaProvider: LLM_PROVIDER = {
        id: "novita",
        name: "Novita AI",
        apiType: "openai-completions",
        apiKey: "argosIsAwesome",
        baseUrl: "https://api.novita.ai/openai",
        enable: true,
      };

      mockConfigPresenter.getProviders = vi.fn<(...args: any[]) => any>().mockReturnValue([novitaProvider]);
      mockConfigPresenter.getProviderById = vi.fn<(...args: any[]) => any>().mockReturnValue(novitaProvider);

      llmProviderPresenter = new LLMProviderPresenter(
        mockConfigPresenter,
        mockSqlitePresenter,
        presenterRuntimeMock.mcpPresenter as any,
      );

      const providerInstance = llmProviderPresenter.getProviderInstance("novita");

      expect(providerInstance).toBeInstanceOf(AiSdkProvider);
    });
  });

  describe("Model Management", () => {
    beforeEach(async () => {
      await llmProviderPresenter.setCurrentProvider("mock-openai-api");
    });

    it("should fetch model list from mock API", async () => {
      const models = await llmProviderPresenter.getModelList("mock-openai-api");

      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBe(true);

      // Verify returned models include the expected mock models
      const modelIds = models.map((m) => m.id);
      expect(modelIds).toContain("mock-gpt-thinking");
      expect(modelIds).toContain("gpt-4-mock");
      expect(modelIds).toContain("mock-gpt-markdown");

      // Verify model structure
      const firstModel = models[0];
      expect(firstModel).toHaveProperty("id");
      expect(firstModel).toHaveProperty("name");
      expect(firstModel).toHaveProperty("providerId", "mock-openai-api");
      expect(firstModel).toHaveProperty("isCustom", false);
    }, 15000); // Increase timeout since this is a network request

    it("should check provider connectivity", async () => {
      const result = await llmProviderPresenter.check("mock-openai-api");
      expect(result).toHaveProperty("isOk");
      expect(result).toHaveProperty("errorMsg");
      expect(result.isOk).toBe(true);
    }, 10000);
  });

  describe("Non-stream Completion", () => {
    beforeEach(async () => {
      await llmProviderPresenter.setCurrentProvider("mock-openai-api");
    });

    it("should generate completion without streaming", async () => {
      const messages = [{ role: "user" as const, content: "1" }];

      const response = await llmProviderPresenter.generateCompletion(
        "mock-openai-api",
        messages,
        "mock-gpt-thinking",
        0.7,
        100,
      );

      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);
      console.log("Completion response:", response.substring(0, 100));
    }, 15000);

    it("should generate completion standalone", async () => {
      const messages: ChatMessage[] = [{ role: "user", content: "1" }];

      const response = await llmProviderPresenter.generateCompletionStandalone(
        "mock-openai-api",
        messages,
        "mock-gpt-thinking",
        0.7,
        100,
      );

      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);
    }, 15000);

    it("falls back to completion transcription when audio endpoint is unsupported", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn<(...args: any[]) => any>().mockImplementation(async (input: string | URL | Request) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

          if (url.endsWith("/audio/transcriptions")) {
            return {
              ok: false,
              status: 404,
              text: vi.fn<(...args: any[]) => any>().mockResolvedValue("mock transcription failure"),
            };
          }

          return {
            ok: true,
            json: vi.fn<(...args: any[]) => any>().mockResolvedValue({
              data: [{ id: "mock-gpt-thinking" }, { id: "gpt-4-mock" }, { id: "mock-gpt-markdown" }],
            }),
            text: vi.fn<(...args: any[]) => any>().mockResolvedValue(""),
          };
        }),
      );

      const transcript = await llmProviderPresenter.transcribeAudioStandalone(
        "mock-openai-api",
        "mock-gpt-thinking",
        "AQID",
        "audio/wav",
        "recording.wav",
      );

      expect(transcript).toBe("mock completion");
    }, 15000);

    it("normalizes audio MIME type casing before transcription validation", async () => {
      const transcribeSpy = vi
        .spyOn<(...args: any[]) => any>(AiSdkProvider.prototype, "transcribeAudio")
        .mockResolvedValue("mock transcript");

      const transcript = await llmProviderPresenter.transcribeAudioStandalone(
        "mock-openai-api",
        "mock-gpt-thinking",
        "AQID",
        "Audio/WAV",
        "recording.wav",
      );

      expect(transcript).toBe("mock transcript");
      expect(transcribeSpy).toHaveBeenCalledWith(
        "mock-gpt-thinking",
        "AQID",
        "audio/wav",
        "recording.wav",
        expect.any(Object),
      );
    }, 15000);

    it("should generate images through the standalone image runtime", async () => {
      mockConfigPresenter.getModelConfig = vi.fn<(...args: any[]) => any>().mockReturnValue({
        maxTokens: 4096,
        contextLength: 4096,
        temperature: 0.7,
        vision: false,
        functionCall: false,
        reasoning: false,
        type: ModelType.ImageGeneration,
        imageGeneration: { quality: "low" },
      });
      mockRunAiSdkCoreStream.mockImplementationOnce(async function* () {
        yield {
          type: "image_data",
          image_data: { data: "imgcache://generated.png", mimeType: "image/png" },
        };
        yield { type: "stop", stop_reason: "complete" };
      });

      const response = await llmProviderPresenter.generateImageStandalone(
        "mock-openai-api",
        "A warm sunset over the ocean",
        "gpt-image-1",
        { size: "1024x1024" },
      );

      expect(response).toEqual({
        providerId: "mock-openai-api",
        modelId: "gpt-image-1",
        options: { quality: "low", size: "1024x1024" },
        images: [{ data: "imgcache://generated.png", mimeType: "image/png" }],
      });
      expect(mockRunAiSdkCoreStream).toHaveBeenCalledWith(
        expect.any(Object),
        [{ role: "user", content: "A warm sunset over the ocean" }],
        "gpt-image-1",
        expect.objectContaining({
          apiEndpoint: ApiEndpointType.Image,
          type: ModelType.ImageGeneration,
          imageGeneration: { quality: "low", size: "1024x1024" },
        }),
        0.7,
        4096,
        [],
      );
    }, 15000);

    it("should summarize titles", async () => {
      const messages = [
        { role: "user" as const, content: "Hello, I want to learn about artificial intelligence" },
        {
          role: "assistant" as const,
          content: "I can help you learn about AI. What specific aspects interest you?",
        },
      ];

      const title = await llmProviderPresenter.summaryTitles(messages, "mock-openai-api", "mock-gpt-thinking");

      expect(typeof title).toBe("string");
      expect(title.length).toBeGreaterThan(0);
      console.log("Generated title:", title);
    }, 15000);
  });

  describe("Error Handling", () => {
    it("should handle invalid provider id", () => {
      expect(() => {
        llmProviderPresenter.getProviderById("non-existent");
      }).toThrow("Provider non-existent not found");
    });

    it("should swallow ACP warmup shutdown errors", async () => {
      const warnSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});
      const mockAcpProvider = {
        warmupProcess: vi
          .fn<(...args: any[]) => any>()
          .mockRejectedValue(new Error("[ACP] Process manager is shutting down, refusing to spawn")),
      };
      vi.spyOn<(...args: any[]) => any>(llmProviderPresenter as any, "getAcpProviderInstance").mockReturnValue(
        mockAcpProvider as any,
      );

      await expect(llmProviderPresenter.warmupAcpProcess("agent-test", "/tmp")).resolves.toBeUndefined();
      warnSpy.mockRestore();
    });

    it("should rethrow non-shutdown ACP warmup errors", async () => {
      const mockAcpProvider = {
        warmupProcess: vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("boom")),
      };
      vi.spyOn<(...args: any[]) => any>(llmProviderPresenter as any, "getAcpProviderInstance").mockReturnValue(
        mockAcpProvider as any,
      );

      await expect(llmProviderPresenter.warmupAcpProcess("agent-test", "/tmp")).rejects.toThrow("boom");
    });

    it("should handle provider check failure for invalid config", async () => {
      vi.stubGlobal("fetch", vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("Network error")));

      // Create a provider with an invalid config
      const invalidProvider: LLM_PROVIDER = {
        id: "invalid-test",
        name: "Invalid Test",
        apiType: "openai-compatible",
        apiKey: "invalid-key",
        baseUrl: "https://invalid-url-that-does-not-exist.com/v1",
        enable: true,
      };

      // Create a new LLMProviderPresenter instance to test the invalid config
      // Avoid polluting other tests' provider state
      const invalidMockConfig = {
        getProviders: vi.fn<(...args: any[]) => any>().mockReturnValue([invalidProvider]),
        getProviderById: vi.fn<(...args: any[]) => any>().mockReturnValue(invalidProvider),
        getModelConfig: vi.fn<(...args: any[]) => any>().mockReturnValue({
          maxTokens: 4096,
          contextLength: 4096,
          temperature: 0.7,
          vision: false,
          functionCall: false,
          reasoning: false,
          type: "chat",
        }),
        getSetting: vi.fn<(...args: any[]) => any>(),
        setModelStatus: vi.fn<(...args: any[]) => any>(),
        updateCustomModel: vi.fn<(...args: any[]) => any>(),
        setProviderModels: vi.fn<(...args: any[]) => any>(),
        getCustomModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
        getProviderModels: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
        getModelStatus: vi.fn<(...args: any[]) => any>().mockReturnValue(true),
        enableModel: vi.fn<(...args: any[]) => any>(),
        setCustomModels: vi.fn<(...args: any[]) => any>(),
        addCustomModel: vi.fn<(...args: any[]) => any>(),
        removeCustomModel: vi.fn<(...args: any[]) => any>(),
      } as unknown as ConfigPresenter;

      const invalidLlmProvider = new LLMProviderPresenter(
        invalidMockConfig,
        mockSqlitePresenter,
        presenterRuntimeMock.mcpPresenter as any,
      );

      const result = await invalidLlmProvider.check("invalid-test");
      expect(result.isOk).toBe(false);
      expect(result.errorMsg).toBeDefined();
    }, 10000);
  });
});
