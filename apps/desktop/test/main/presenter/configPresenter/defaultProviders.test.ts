import { describe, expect, it } from "vitest";
import { DEFAULT_PROVIDERS } from "@argos/backend-core";
import { resolveAiSdkProviderDefinition } from "@argos/backend-core/provider/registry";

describe("DEFAULT_PROVIDERS", () => {
  it("includes Mistral as a disabled built-in OpenAI-compatible provider", () => {
    expect(DEFAULT_PROVIDERS).toContainEqual(
      expect.objectContaining({
        id: "mistral",
        name: "Mistral",
        apiType: "mistral",
        baseUrl: "https://api.mistral.ai/v1",
        enable: false,
        websites: expect.objectContaining({
          apiKey: "https://console.mistral.ai/api-keys/",
          defaultBaseUrl: "https://api.mistral.ai/v1",
        }),
      }),
    );
  });

  it("includes NVIDIA synced from upstream defaults", () => {
    expect(DEFAULT_PROVIDERS).toContainEqual(
      expect.objectContaining({
        id: "nvidia",
        name: "NVIDIA",
        apiType: "openai-completions",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        enable: false,
        websites: expect.objectContaining({
          apiKey: "https://build.nvidia.com/settings/api-keys",
          defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
        }),
      }),
    );
  });

  it("includes StepFun and its token plan synced from upstream defaults", () => {
    expect(DEFAULT_PROVIDERS).toContainEqual(
      expect.objectContaining({
        id: "stepfun",
        apiType: "openai-completions",
        baseUrl: "https://api.stepfun.com/v1",
        enable: false,
      }),
    );
    expect(DEFAULT_PROVIDERS).toContainEqual(
      expect.objectContaining({
        id: "stepfun-step-plan",
        apiType: "openai-completions",
        baseUrl: "https://api.stepfun.com/step_plan/v1",
        enable: false,
      }),
    );
  });

  it("includes Kimi For Coding as a disabled Anthropic-compatible provider", () => {
    expect(DEFAULT_PROVIDERS).toContainEqual(
      expect.objectContaining({
        id: "kimi-for-coding",
        name: "Kimi For Coding",
        apiType: "anthropic",
        baseUrl: "https://api.kimi.com/coding/",
        enable: false,
        websites: expect.objectContaining({
          apiKey: "https://www.kimi.com/code/console",
          defaultBaseUrl: "https://api.kimi.com/coding/",
        }),
      }),
    );
  });

  it("includes the upstream OpenAI-compatible routers", () => {
    const byId = new Map(DEFAULT_PROVIDERS.map((provider) => [provider.id, provider]));
    const addedRouters = ["astrlink", "magpie", "litellm", "openllm", "requesty", "atlascloud", "greenpt", "straico"];

    for (const id of addedRouters) {
      const provider = byId.get(id);
      expect(provider, `expected default provider ${id}`).toBeDefined();
      expect(provider?.apiType).toBe("openai-completions");
      expect(provider?.enable).toBe(false);
      expect(provider?.baseUrl).toBeTruthy();
    }
  });

  it("keeps provider ids unique", () => {
    const ids = DEFAULT_PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("derives defaultBaseUrl for every provider that ships a baseUrl", () => {
    for (const provider of DEFAULT_PROVIDERS) {
      if (!provider.baseUrl) continue;
      expect(provider.websites?.defaultBaseUrl, `expected websites.defaultBaseUrl for ${provider.id}`).toBeTruthy();
    }
  });

  it("still filters China-specific providers", () => {
    const ids = new Set(DEFAULT_PROVIDERS.map((provider) => provider.id));
    expect(ids.has("dashscope")).toBe(false);
    expect(ids.has("silicon")).toBe(false);
  });

  it("excludes providers requiring apiTypes Argos does not support", () => {
    const ids = new Set(DEFAULT_PROVIDERS.map((provider) => provider.id));
    for (const unsupportedId of ["typesafe", "cloudflare", "apimart", "openai-codex"]) {
      expect(ids.has(unsupportedId)).toBe(false);
    }
  });

  it("resolves kimi-for-coding to the Anthropic runtime definition", () => {
    const provider = DEFAULT_PROVIDERS.find((candidate) => candidate.id === "kimi-for-coding");
    expect(provider).toBeDefined();
    const definition = resolveAiSdkProviderDefinition(provider!);
    expect(definition).toMatchObject({
      runtimeKind: "anthropic",
      modelSource: "provider-db",
      providerDbSourceId: "kimi-for-coding",
      checkModelId: "kimi-for-coding",
    });
  });

  it("resolves new openai-completions routers via the apiType fallback", () => {
    const provider = DEFAULT_PROVIDERS.find((candidate) => candidate.id === "requesty");
    expect(provider).toBeDefined();
    const definition = resolveAiSdkProviderDefinition(provider!);
    expect(definition).toMatchObject({
      runtimeKind: "openai-compatible",
      modelSource: "openai",
      checkStrategy: "fetch-models",
    });
  });
});
