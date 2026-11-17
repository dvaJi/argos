import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { generateImage } from "ai";
import { createAiSdkProviderContext } from "@argos/backend-core/provider/aiSdk";
import { IMAGE_GENERATE_TOOL_NAME, IMAGE_GENERATION_TOOL_SERVER_NAME } from "@argos/shared/agentImageGenerationTool";
import {
  IMAGE_GENERATION_MODERATION_VALUES,
  IMAGE_GENERATION_OUTPUT_FORMAT_VALUES,
  IMAGE_GENERATION_QUALITY_VALUES,
  OPENAI_IMAGE_GENERATION_BACKGROUND_VALUES,
  isValidOpenAIImageGenerationSize,
  normalizeImageGenerationOptions,
  resolveImageGenerationCompatType,
  supportsOpenAIImageGenerationSettings,
  type ImageGenerationOptions,
} from "@argos/shared/imageGenerationSettings";
import { createAgentToolErrorResult, createAgentToolSuccessResult } from "@argos/shared/lib/agentToolResultEnvelope";
import { ApiEndpointType, ModelType } from "@argos/shared/model";
import type { LLM_PROVIDER, MODEL_META, ModelConfig } from "@argos/shared/presenter";
import type {
  MCPToolCall,
  MCPToolDefinition,
  MCPToolResponse,
  ToolCallImagePreview,
} from "@argos/shared/types/core/mcp";
import { z } from "zod";
import { resolveProviderKind, resolveProxyUrl } from "./llmUtilityExecution";

/** Generated images live under `<dataDir>/images/<this>/`, served as `imgcache://<this>/<file>`. */
export const GENERATED_IMAGES_SUBDIR = "generated";
/** Daemon HTTP route serving `<dataDir>/images` to browser clients (desktop uses `imgcache://`). */
export const IMGCACHE_ROUTE_PREFIX = "/api/v1/imgcache/";
/** No abort signal crosses the tool-call port, so generation carries its own deadline. */
const IMAGE_GENERATION_TIMEOUT_MS = 120_000;

const imageGenerateSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(8000).describe("Detailed text prompt for the image to generate."),
  size: z
    .string()
    .trim()
    .refine((value) => !value || isValidOpenAIImageGenerationSize(value), {
      message: "size must be a valid WIDTHxHEIGHT image generation size",
    })
    .optional()
    .describe("Optional output size, such as 1024x1024, 1536x1024, or 1024x1536."),
  quality: z
    .enum(IMAGE_GENERATION_QUALITY_VALUES)
    .optional()
    .describe("Optional quality hint when the selected image model supports it."),
  outputFormat: z
    .enum(IMAGE_GENERATION_OUTPUT_FORMAT_VALUES)
    .optional()
    .describe("Optional output format hint when the selected image model supports it."),
  background: z
    .enum(OPENAI_IMAGE_GENERATION_BACKGROUND_VALUES)
    .optional()
    .describe("Optional background hint when the selected image model supports it."),
  moderation: z
    .enum(IMAGE_GENERATION_MODERATION_VALUES)
    .optional()
    .describe("Optional moderation hint when the selected image model supports it."),
});

type ImageGenerateInput = z.infer<typeof imageGenerateSchema>;

export type ImageModelSelection = { providerId: string; modelId: string };

export type GeneratedImage = { data: Uint8Array; mediaType: string };

export type ImageRequestOptions = {
  size?: `${number}x${number}`;
  providerOptions?: Record<string, Record<string, string | number>>;
};

/** Generates images for a provider/model; injectable for tests. */
export type ImageGenerator = (input: {
  provider: LLM_PROVIDER;
  modelId: string;
  prompt: string;
  options: ImageGenerationOptions | undefined;
  signal: AbortSignal;
}) => Promise<GeneratedImage[]>;

export type DaemonImageGenerationConfigPort = {
  resolveArgosAgentConfig(agentId: string): Promise<{ imageGenerationModel?: ImageModelSelection | null } | null>;
  getProviderById(id: string): LLM_PROVIDER | undefined;
  getProviderModels(providerId: string): MODEL_META[];
  getCustomModels(providerId: string): MODEL_META[];
  getModelConfig(modelId: string, providerId?: string): ModelConfig;
};

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function extensionForMediaType(mediaType: string | undefined): string {
  return EXTENSION_BY_MEDIA_TYPE[mediaType?.toLowerCase().trim() ?? ""] ?? "png";
}

/** The agent's configured image model, or null when unset. */
export function readImageModelSelection(
  config: { imageGenerationModel?: ImageModelSelection | null } | null | undefined,
): ImageModelSelection | null {
  const providerId = config?.imageGenerationModel?.providerId?.trim();
  const modelId = config?.imageGenerationModel?.modelId?.trim();
  return providerId && modelId ? { providerId, modelId } : null;
}

/**
 * True when the listed model resolves to image generation (same inference as the
 * UI pickers, so untyped `gpt-image-*` listings qualify) or its config routes to
 * the image API.
 */
export function isImageGenerationModel(
  modelId: string,
  listedModel: Pick<MODEL_META, "type" | "endpointType" | "supportedEndpointTypes"> | undefined,
  modelConfig: Pick<ModelConfig, "type" | "apiEndpoint" | "endpointType"> | undefined,
): boolean {
  return (
    resolveImageGenerationCompatType({
      modelId,
      type: listedModel?.type,
      endpointType: listedModel?.endpointType,
      supportedEndpointTypes: listedModel?.supportedEndpointTypes,
    }) === ModelType.ImageGeneration ||
    modelConfig?.type === ModelType.ImageGeneration ||
    modelConfig?.apiEndpoint === ApiEndpointType.Image ||
    modelConfig?.endpointType === "image-generation"
  );
}

/**
 * Maps image options to AI SDK `generateImage` request options, mirroring the
 * desktop runtime: size is always forwarded; quality/format/background/
 * moderation go through provider options only for OpenAI-compatible image routes.
 */
export function buildImageRequestOptions(input: {
  provider: Pick<LLM_PROVIDER, "id" | "apiType">;
  providerKind: string;
  providerOptionsKey: string;
  modelId: string;
  options: ImageGenerationOptions | undefined;
}): ImageRequestOptions {
  const options = normalizeImageGenerationOptions(input.options);
  if (!options) return {};
  const { size, ...rest } = options;
  const request: ImageRequestOptions = {};
  if (size) request.size = size as `${number}x${number}`;

  const supportsSettings = supportsOpenAIImageGenerationSettings({
    providerId: input.provider.id,
    providerApiType: input.provider.apiType,
    providerKind: input.providerKind,
    providerOptionsKey: input.providerOptionsKey,
    modelId: input.modelId,
    type: ModelType.ImageGeneration,
  });
  if (!supportsSettings) return request;

  const officialOpenAI = input.providerOptionsKey === "openai";
  const payload: Record<string, string | number> = {};
  if (rest.quality) payload.quality = rest.quality;
  if (rest.background) payload.background = rest.background;
  if (rest.moderation) payload.moderation = rest.moderation;
  if (rest.outputFormat) payload[officialOpenAI ? "outputFormat" : "output_format"] = rest.outputFormat;
  if (rest.outputCompression !== undefined) {
    payload[officialOpenAI ? "outputCompression" : "output_compression"] = rest.outputCompression;
  }
  if (Object.keys(payload).length > 0) request.providerOptions = { [input.providerOptionsKey]: payload };
  return request;
}

/** Default generator: AI SDK `generateImage` over backend-core's provider context. */
export const createAiSdkImageGenerator =
  (configPresenter: unknown): ImageGenerator =>
  async ({ provider, modelId, prompt, options, signal }) => {
    const providerKind = resolveProviderKind(provider);
    const context = createAiSdkProviderContext({
      providerKind,
      provider,
      // Azure reads `azureApiVersion` through the config presenter.
      configPresenter: configPresenter as any,
      defaultHeaders: {},
      modelId,
      proxyUrl: resolveProxyUrl(),
    });
    if (!context.imageModel) {
      throw new Error(`Image generation is not supported by provider ${provider.id}`);
    }
    const result = await generateImage({
      model: context.imageModel,
      prompt,
      ...buildImageRequestOptions({
        provider,
        providerKind,
        providerOptionsKey: context.providerOptionsKey,
        modelId,
        options,
      }),
      abortSignal: signal,
    });
    return result.images.map((image) => ({ data: image.uint8Array, mediaType: image.mediaType }));
  };

const toolDefinition = (): MCPToolDefinition => ({
  type: "function",
  source: "agent",
  function: {
    name: IMAGE_GENERATE_TOOL_NAME,
    description:
      "Generate a new image from a text prompt using the agent's configured image generation model. Use this when the user asks to create, draw, render, or generate an image. The image is shown to the user in the conversation and saved to disk; the result lists the saved file paths.",
    parameters: z.toJSONSchema(imageGenerateSchema, {
      unrepresentable: "any",
    }) as MCPToolDefinition["function"]["parameters"],
  },
  server: {
    name: IMAGE_GENERATION_TOOL_SERVER_NAME,
    icons: "\u{1F5BC}\u{FE0F}",
    description: "Agent image generation tools",
  },
});

/**
 * Daemon-side `image_generate` tool for Argos (Pi) agents
 * (docs/features/daemon-image-generation).
 */
export class DaemonImageGenerationRuntime {
  constructor(
    private readonly options: {
      config: DaemonImageGenerationConfigPort;
      /** `<dataDir>/images` — the root served as `imgcache://`. */
      imagesDir: string;
      /** Defaults to AI SDK `generateImage` built from `config`. */
      generate?: ImageGenerator;
      writeFile?: (filePath: string, data: Uint8Array) => Promise<unknown>;
    },
  ) {}

  /** Tool definitions for an agent: empty unless it has an image generation model configured. */
  async toolDefinitionsForAgent(agentId: string | undefined): Promise<MCPToolDefinition[]> {
    if (!agentId) return [];
    const config = await this.options.config.resolveArgosAgentConfig(agentId);
    return readImageModelSelection(config) ? [toolDefinition()] : [];
  }

  handlesTool(name: string | undefined): boolean {
    return name === IMAGE_GENERATE_TOOL_NAME;
  }

  async callTool(request: MCPToolCall, agentId: string): Promise<MCPToolResponse> {
    let rawArgs: unknown;
    try {
      rawArgs = JSON.parse(request.function.arguments || "{}");
    } catch {
      rawArgs = null;
    }
    const parsed = imageGenerateSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return this.errorResponse(request.id, "INVALID_ARGUMENTS", parsed.error.message);
    }

    const model = await this.resolveModel(agentId);
    if (!model.ok) return this.errorResponse(request.id, model.code, model.message, parsed.data);

    const options = normalizeImageGenerationOptions({
      ...model.config.imageGeneration,
      ...toImageOptions(parsed.data),
    });

    let images: GeneratedImage[];
    try {
      images = await (this.options.generate ?? createAiSdkImageGenerator(this.options.config))({
        provider: model.provider,
        modelId: model.selection.modelId,
        prompt: parsed.data.prompt,
        options,
        signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.errorResponse(request.id, "IMAGE_GENERATION_FAILED", message, parsed.data, model.selection);
    }
    if (images.length === 0) {
      return this.errorResponse(
        request.id,
        "IMAGE_GENERATION_FAILED",
        "The image model returned no images.",
        parsed.data,
        model.selection,
      );
    }

    const saved = await this.saveImages(images);
    const imagePreviews = saved.map<ToolCallImagePreview>((image, index) => ({
      id: `generated-image-${index + 1}`,
      data: image.url,
      mimeType: image.mediaType,
      title: `Generated image ${index + 1}`,
      source: "tool_output",
    }));
    const output = {
      ok: true,
      prompt: parsed.data.prompt,
      model: model.selection,
      settings: options ?? {},
      imageCount: saved.length,
      images: saved.map((image, index) => ({
        id: imagePreviews[index].id,
        mimeType: image.mediaType,
        path: image.filePath,
      })),
    };
    const content = JSON.stringify(output, null, 2);
    return {
      toolCallId: request.id,
      content,
      isError: false,
      imagePreviews,
      toolResult: createAgentToolSuccessResult(IMAGE_GENERATE_TOOL_NAME, content, {
        summary: `Generated ${saved.length} image${saved.length === 1 ? "" : "s"}.`,
        data: output,
      }),
    };
  }

  private async resolveModel(
    agentId: string,
  ): Promise<
    | { ok: true; selection: ImageModelSelection; provider: LLM_PROVIDER; config: ModelConfig }
    | { ok: false; code: string; message: string }
  > {
    const { config } = this.options;
    const selection = readImageModelSelection(await config.resolveArgosAgentConfig(agentId));
    if (!selection) {
      return {
        ok: false,
        code: "IMAGE_GENERATION_MODEL_UNAVAILABLE",
        message: "No image generation model is configured for this agent.",
      };
    }
    const provider = config.getProviderById(selection.providerId);
    if (!provider || !provider.enable) {
      return {
        ok: false,
        code: "IMAGE_GENERATION_MODEL_UNAVAILABLE",
        message: `Image generation provider "${selection.providerId}" is not available.`,
      };
    }
    const listed = [
      ...config.getProviderModels(selection.providerId),
      ...config.getCustomModels(selection.providerId),
    ].find((item) => item.id === selection.modelId);
    const modelConfig = config.getModelConfig(selection.modelId, selection.providerId);
    if (!isImageGenerationModel(selection.modelId, listed, modelConfig)) {
      return {
        ok: false,
        code: "IMAGE_GENERATION_MODEL_UNAVAILABLE",
        message: `"${selection.modelId}" is not an image generation model. Pick one in the agent's Image generation setting.`,
      };
    }
    return { ok: true, selection, provider, config: modelConfig };
  }

  private async saveImages(
    images: GeneratedImage[],
  ): Promise<Array<{ url: string; filePath: string; mediaType: string }>> {
    const dir = path.join(this.options.imagesDir, GENERATED_IMAGES_SUBDIR);
    fs.mkdirSync(dir, { recursive: true });
    const write = this.options.writeFile ?? ((filePath: string, data: Uint8Array) => Bun.write(filePath, data));
    return Promise.all(
      images.map(async (image) => {
        const fileName = `${randomUUID()}.${extensionForMediaType(image.mediaType)}`;
        const filePath = path.join(dir, fileName);
        await write(filePath, image.data);
        return {
          url: `imgcache://${GENERATED_IMAGES_SUBDIR}/${fileName}`,
          filePath,
          mediaType: image.mediaType || "image/png",
        };
      }),
    );
  }

  private errorResponse(
    toolCallId: string,
    code: string,
    message: string,
    input?: ImageGenerateInput,
    model?: ImageModelSelection,
  ): MCPToolResponse {
    const output = {
      ok: false,
      code,
      message,
      ...(input ? { prompt: input.prompt } : {}),
      ...(model ? { model } : {}),
    };
    const content = JSON.stringify(output, null, 2);
    return {
      toolCallId,
      content,
      isError: true,
      toolResult: createAgentToolErrorResult(IMAGE_GENERATE_TOOL_NAME, message, { code, data: output }),
    };
  }
}

function toImageOptions(input: ImageGenerateInput): ImageGenerationOptions {
  const options: ImageGenerationOptions = {};
  if (input.size) options.size = input.size;
  if (input.quality) options.quality = input.quality;
  if (input.outputFormat) options.outputFormat = input.outputFormat;
  if (input.background) options.background = input.background;
  if (input.moderation) options.moderation = input.moderation;
  return options;
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

/**
 * Resolves an `imgcache://` relative path to a file inside `imagesDir`, or null
 * when it escapes the directory or is not an image type we serve.
 */
export function resolveImgcacheFile(
  imagesDir: string,
  relativePath: string,
): { filePath: string; contentType: string } | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(relativePath);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes("\0")) return null;
  const root = path.resolve(imagesDir);
  const filePath = path.resolve(root, decoded);
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  const contentType = CONTENT_TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()];
  return contentType ? { filePath, contentType } : null;
}
