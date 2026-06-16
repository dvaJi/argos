import { beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import { AgentToolManager } from "@/presenter/toolPresenter/agentTools/agentToolManager";
import { IMAGE_GENERATE_TOOL_NAME } from "@/presenter/toolPresenter/agentTools/agentImageGenerationTool";
import { ApiEndpointType, ModelType } from "@shared/model";

vi.mock("electron", () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
  nativeImage: {
    createFromPath: () => ({
      getSize: () => ({ width: 128, height: 96 }),
    }),
  },
}));

describe("Agent image generation tool", () => {
  let configPresenter: any;
  let generateImageStandalone: ReturnType<typeof vi.fn>;
  let resolveConversationSessionInfo: ReturnType<typeof vi.fn>;
  let manager: AgentToolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    generateImageStandalone = vi.fn<(...args: any[]) => any>();
    resolveConversationSessionInfo = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      agentId: "argos",
      agentType: "argos",
    });
    configPresenter = {
      getSkillsEnabled: () => false,
      getSkillsPath: () => os.tmpdir(),
      resolveArgosAgentConfig: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        imageGenerationModel: { providerId: "openai", modelId: "gpt-image-1" },
      }),
      getModelConfig: vi.fn<(...args: any[]) => any>().mockReturnValue({
        type: ModelType.ImageGeneration,
        apiEndpoint: ApiEndpointType.Image,
        vision: false,
        functionCall: false,
        reasoning: false,
        maxTokens: 1024,
        contextLength: 4096,
      }),
    };
    manager = new AgentToolManager({
      agentWorkspacePath: null,
      configPresenter,
      runtimePort: {
        resolveConversationWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
        resolveConversationSessionInfo,
        getSkillPresenter: () =>
          ({
            getActiveSkills: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
            getActiveSkillsAllowedTools: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
            listSkillScripts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
            getSkillExtension: vi.fn<(...args: any[]) => any>(),
          }) as any,
        getYoBrowserToolHandler: () => ({
          getToolDefinitions: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
          callTool: vi.fn<(...args: any[]) => any>(),
        }),
        getFilePresenter: () => ({
          getMimeType: vi.fn<(...args: any[]) => any>(),
          prepareFileCompletely: vi.fn<(...args: any[]) => any>(),
        }),
        getLlmProviderPresenter: () => ({
          executeWithRateLimit: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
          generateCompletionStandalone: vi.fn<(...args: any[]) => any>(),
          generateImageStandalone,
        }),
        createSettingsWindow: vi.fn<(...args: any[]) => any>(),
        sendToWindow: vi.fn<(...args: any[]) => any>().mockReturnValue(true),
        getApprovedFilePaths: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
        consumeSettingsApproval: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
      },
    });
  });

  it("shows image_generate in settings context without a conversation", async () => {
    const defs = await manager.getAllToolDefinitions({
      chatMode: "agent",
      supportsVision: false,
      agentWorkspacePath: null,
    });

    expect(defs.some((tool) => tool.function.name === IMAGE_GENERATE_TOOL_NAME)).toBe(true);
  });

  it("only shows image_generate in a session with an image generation model", async () => {
    let defs = await manager.getAllToolDefinitions({
      chatMode: "agent",
      supportsVision: false,
      agentWorkspacePath: null,
      conversationId: "conv-1",
    });

    expect(defs.some((tool) => tool.function.name === IMAGE_GENERATE_TOOL_NAME)).toBe(true);

    configPresenter.resolveArgosAgentConfig.mockResolvedValueOnce({});
    defs = await manager.getAllToolDefinitions({
      chatMode: "agent",
      supportsVision: false,
      agentWorkspacePath: null,
      conversationId: "conv-2",
    });

    expect(defs.some((tool) => tool.function.name === IMAGE_GENERATE_TOOL_NAME)).toBe(false);
  });

  it("generates image previews without putting image data into tool content", async () => {
    generateImageStandalone.mockResolvedValue({
      providerId: "openai",
      modelId: "gpt-image-1",
      options: { size: "1024x1024" },
      images: [{ data: "imgcache://generated.png", mimeType: "image/png" }],
    });

    const result = (await manager.callTool(
      IMAGE_GENERATE_TOOL_NAME,
      { prompt: "A warm sunset over the ocean", size: "1024x1024" },
      "conv-1",
    )) as any;

    expect(generateImageStandalone).toHaveBeenCalledWith(
      "openai",
      "A warm sunset over the ocean",
      "gpt-image-1",
      { size: "1024x1024" },
      { signal: undefined },
    );
    expect(result.rawData.imagePreviews).toEqual([
      {
        id: "generated-image-1",
        data: "imgcache://generated.png",
        mimeType: "image/png",
        title: "Generated image 1",
        source: "tool_output",
      },
    ]);
    expect(result.content).not.toContain("imgcache://generated.png");
    expect(result.rawData.toolResult.ok).toBe(true);
  });

  it("returns a recoverable tool error when no image model is configured", async () => {
    configPresenter.resolveArgosAgentConfig.mockResolvedValueOnce({});

    const result = (await manager.callTool(
      IMAGE_GENERATE_TOOL_NAME,
      { prompt: "A warm sunset over the ocean" },
      "conv-1",
    )) as any;

    expect(generateImageStandalone).not.toHaveBeenCalled();
    expect(result.rawData.isError).toBe(true);
    expect(result.rawData.toolResult.error).toMatchObject({
      code: "IMAGE_GENERATION_MODEL_UNAVAILABLE",
      recoverable: true,
    });
  });

  it("returns a recoverable tool error when the provider fails", async () => {
    generateImageStandalone.mockRejectedValue(new Error("quota exceeded"));

    const result = (await manager.callTool(
      IMAGE_GENERATE_TOOL_NAME,
      { prompt: "A warm sunset over the ocean" },
      "conv-1",
    )) as any;

    expect(result.rawData.isError).toBe(true);
    expect(result.rawData.toolResult.error).toMatchObject({
      code: "IMAGE_GENERATION_FAILED",
      message: "quota exceeded",
      recoverable: true,
    });
  });
});
