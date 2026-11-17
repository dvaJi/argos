import { describe, expect, it } from "bun:test";
import os from "node:os";
import path from "node:path";
import { ModelType } from "@argos/shared/model";
import type { LLM_PROVIDER, MODEL_META, ModelConfig } from "@argos/shared/presenter";
import {
  buildImageRequestOptions,
  DaemonImageGenerationRuntime,
  extensionForMediaType,
  isImageGenerationModel,
  resolveImgcacheFile,
  type DaemonImageGenerationConfigPort,
  type ImageGenerator,
} from "../src/host/daemonImageGenerationRuntime";
import { attachToolImagePreviews } from "../src/host/pi-provider-execution";

const provider = {
  id: "openrouter",
  name: "OpenRouter",
  apiType: "openai",
  apiKey: "k",
  baseUrl: "https://openrouter.ai/api/v1",
  enable: true,
} as LLM_PROVIDER;

function makeConfig(overrides: {
  imageModel?: { providerId: string; modelId: string } | null;
  models?: MODEL_META[];
  modelConfig?: Partial<ModelConfig>;
}): DaemonImageGenerationConfigPort {
  return {
    resolveArgosAgentConfig: async () => ({ imageGenerationModel: overrides.imageModel ?? null }),
    getProviderById: (id) => (id === provider.id ? provider : undefined),
    getProviderModels: () => overrides.models ?? [],
    getCustomModels: () => [],
    getModelConfig: () => ({ type: ModelType.Chat, ...overrides.modelConfig }) as ModelConfig,
  };
}

const imageModel = { providerId: "openrouter", modelId: "recraft/x:free" };
const listedImageModel = {
  id: "recraft/x:free",
  name: "Recraft",
  group: "default",
  providerId: "openrouter",
  type: ModelType.ImageGeneration,
} as MODEL_META;

const call = (args: Record<string, unknown>) => ({
  id: "call-1",
  type: "function" as const,
  function: { name: "image_generate", arguments: JSON.stringify(args) },
});

describe("image generation helpers", () => {
  it("maps media types to file extensions", () => {
    expect(extensionForMediaType("image/webp")).toBe("webp");
    expect(extensionForMediaType("image/jpeg")).toBe("jpg");
    expect(extensionForMediaType(undefined)).toBe("png");
  });

  it("accepts image models by listed type, untyped image ids/endpoints, or config routing", () => {
    const chatConfig = { type: ModelType.Chat } as ModelConfig;
    expect(isImageGenerationModel("m", { type: ModelType.ImageGeneration }, chatConfig)).toBe(true);
    expect(isImageGenerationModel("m", undefined, { type: ModelType.ImageGeneration } as ModelConfig)).toBe(true);
    expect(isImageGenerationModel("m", undefined, { endpointType: "image-generation" } as ModelConfig)).toBe(true);
    // Untyped OpenAI listings and new-api endpoint hints.
    expect(isImageGenerationModel("gpt-image-2", {}, chatConfig)).toBe(true);
    expect(isImageGenerationModel("m", { supportedEndpointTypes: ["image-generation"] }, chatConfig)).toBe(true);
    // An explicit non-image listed type wins over the id heuristic.
    expect(isImageGenerationModel("gpt-image-2", { type: ModelType.Chat }, chatConfig)).toBe(false);
    expect(isImageGenerationModel("gpt-5", { type: ModelType.Chat }, chatConfig)).toBe(false);
  });

  it("always forwards size and only sends provider settings for OpenAI-compatible routes", () => {
    const options = { size: "1024x1024", quality: "high" as const, outputFormat: "webp" as const };
    expect(
      buildImageRequestOptions({
        provider,
        providerKind: "openai-compatible",
        providerOptionsKey: "openrouter",
        modelId: "m",
        options,
      }),
    ).toEqual({ size: "1024x1024", providerOptions: { openrouter: { quality: "high", output_format: "webp" } } });
    expect(
      buildImageRequestOptions({
        provider: { id: "gemini", apiType: "gemini" },
        providerKind: "gemini",
        providerOptionsKey: "google",
        modelId: "m",
        options,
      }),
    ).toEqual({ size: "1024x1024" });
    expect(
      buildImageRequestOptions({
        provider,
        providerKind: "openai-compatible",
        providerOptionsKey: "x",
        modelId: "m",
        options: undefined,
      }),
    ).toEqual({});
  });

  it("resolves imgcache paths inside the images dir only", () => {
    const root = path.join(os.tmpdir(), "argos-images");
    expect(resolveImgcacheFile(root, "generated/a.webp")).toEqual({
      filePath: path.join(root, "generated", "a.webp"),
      contentType: "image/webp",
    });
    expect(resolveImgcacheFile(root, "../secret.png")).toBeNull();
    expect(resolveImgcacheFile(root, "generated/%2e%2e/%2e%2e/secret.png")).toBeNull();
    expect(resolveImgcacheFile(root, "generated/notes.txt")).toBeNull();
    expect(resolveImgcacheFile(root, "")).toBeNull();
  });
});

describe("DaemonImageGenerationRuntime", () => {
  it("only exposes the tool when the agent has an image model", async () => {
    const withModel = new DaemonImageGenerationRuntime({ config: makeConfig({ imageModel }), imagesDir: "/x" });
    const without = new DaemonImageGenerationRuntime({ config: makeConfig({}), imagesDir: "/x" });
    expect((await withModel.toolDefinitionsForAgent("a")).map((tool) => tool.function.name)).toEqual([
      "image_generate",
    ]);
    expect(await without.toolDefinitionsForAgent("a")).toEqual([]);
    expect(await withModel.toolDefinitionsForAgent(undefined)).toEqual([]);
  });

  it("generates, saves, and returns previews without base64 in the text result", async () => {
    const writes: Array<{ filePath: string; size: number }> = [];
    let received: Parameters<ImageGenerator>[0] | undefined;
    const runtime = new DaemonImageGenerationRuntime({
      config: makeConfig({ imageModel, models: [listedImageModel] }),
      imagesDir: path.join(os.tmpdir(), "argos-image-test"),
      generate: async (input) => {
        received = input;
        return [{ data: new Uint8Array([1, 2, 3]), mediaType: "image/webp" }];
      },
      writeFile: async (filePath, data) => writes.push({ filePath, size: data.length }),
    });

    const response = await runtime.callTool(call({ prompt: "a red cube", size: "1024x1024" }), "agent");

    expect(response.isError).toBe(false);
    expect(received?.modelId).toBe("recraft/x:free");
    expect(received?.options).toEqual({ size: "1024x1024" });
    expect(writes).toHaveLength(1);
    expect(writes[0].filePath.endsWith(".webp")).toBe(true);
    expect(response.imagePreviews).toEqual([
      expect.objectContaining({
        mimeType: "image/webp",
        source: "tool_output",
        data: expect.stringMatching(/^imgcache:\/\/generated\/[0-9a-f-]+\.webp$/),
      }),
    ]);
    const output = JSON.parse(response.content as string);
    expect(output.images[0].path).toBe(writes[0].filePath);
    expect(response.content as string).not.toContain("AQID");
  });

  it("returns error results for missing, non-image, or failing models", async () => {
    const generate: ImageGenerator = async () => {
      throw new Error("upstream 500");
    };
    const noModel = new DaemonImageGenerationRuntime({ config: makeConfig({}), imagesDir: "/x", generate });
    const chatModel = new DaemonImageGenerationRuntime({
      config: makeConfig({ imageModel, models: [{ ...listedImageModel, type: ModelType.Chat }] }),
      imagesDir: "/x",
      generate,
    });
    const failing = new DaemonImageGenerationRuntime({
      config: makeConfig({ imageModel, models: [listedImageModel] }),
      imagesDir: "/x",
      generate,
    });

    const codes = await Promise.all(
      [noModel, chatModel, failing].map(async (runtime) => {
        const response = await runtime.callTool(call({ prompt: "x" }), "agent");
        expect(response.isError).toBe(true);
        return JSON.parse(response.content as string).code;
      }),
    );
    expect(codes).toEqual([
      "IMAGE_GENERATION_MODEL_UNAVAILABLE",
      "IMAGE_GENERATION_MODEL_UNAVAILABLE",
      "IMAGE_GENERATION_FAILED",
    ]);
    const invalid = await failing.callTool(call({ prompt: "" }), "agent");
    expect(JSON.parse(invalid.content as string).code).toBe("INVALID_ARGUMENTS");
  });
});

describe("attachToolImagePreviews", () => {
  it("attaches previews to the matching in-flight tool-call block", () => {
    const blocks: any[] = [
      { id: "other", type: "tool_call", tool_call: { id: "other", name: "read" } },
      { id: "call-1", type: "tool_call", tool_call: { id: "call-1", name: "image_generate" } },
    ];
    const previews = [
      { id: "p", data: "imgcache://generated/a.png", mimeType: "image/png", source: "tool_output" as const },
    ];
    attachToolImagePreviews(blocks, "call-1", { imagePreviews: previews });
    expect(blocks[1].tool_call.imagePreviews).toEqual(previews);
    expect(blocks[0].tool_call.imagePreviews).toBeUndefined();
    attachToolImagePreviews(blocks, "missing", { imagePreviews: previews });
    attachToolImagePreviews(undefined, "call-1", { imagePreviews: previews });
  });
});
