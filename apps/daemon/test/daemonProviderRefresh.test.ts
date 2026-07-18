import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { DaemonConfigPresenter, resolveDaemonProviderDbBuiltIn } from "../src/host/daemonConfigPresenter";
import { ProviderDbLoader } from "@argos/backend-core/provider";
import {
  providersListModelsRoute,
  providersListOllamaModelsRoute,
  providersListOllamaRunningModelsRoute,
  providersPullOllamaModelRoute,
  providersRefreshModelsRoute,
} from "@argos/shared-contracts/routes";

describe("daemon provider model refresh", () => {
  it("refreshes provider models into daemon-owned config state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "argos-daemon-provider-refresh-"));
    try {
      const configPresenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"));
      configPresenter.setProviders([
        {
          id: "openai",
          name: "OpenAI",
          apiType: "openai",
          apiKey: "test-key",
          baseUrl: "https://api.openai.com/v1",
          enable: true,
          models: [],
          customModels: [],
        } as any,
      ]);

      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            { id: "gpt-4o", name: "GPT-4o", owned_by: "openai", context_length: 128000, max_tokens: 16384 },
            { id: "gpt-4o-mini", display_name: "GPT-4o mini", owned_by: "openai", context_length: 128000 },
          ],
        }),
        text: async () => "",
      }));
      vi.stubGlobal("fetch", fetchMock);

      const dispatcher = createDaemonDispatcher(configPresenter as any);
      await expect(dispatcher(providersRefreshModelsRoute.name, { providerId: "openai" })).resolves.toEqual({
        refreshed: true,
      });

      const models = configPresenter.getProviderModels("openai");
      expect(models).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "gpt-4o",
            name: "GPT-4o",
            providerId: "openai",
            group: "openai",
            contextLength: 128000,
            maxTokens: 16384,
          }),
          expect.objectContaining({
            id: "gpt-4o-mini",
            name: "GPT-4o mini",
            providerId: "openai",
            group: "openai",
            contextLength: 128000,
          }),
        ]),
      );
      await expect(dispatcher(providersListModelsRoute.name, { providerId: "openai" })).resolves.toMatchObject({
        providerModels: expect.arrayContaining([
          expect.objectContaining({ id: "gpt-4o" }),
          expect.objectContaining({ id: "gpt-4o-mini" }),
        ]),
      });
    } finally {
      vi.unstubAllGlobals();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("serves Ollama routes from daemon-owned config state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "argos-daemon-ollama-routes-"));
    try {
      const configPresenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"));
      configPresenter.setProviders([
        {
          id: "ollama",
          name: "Ollama",
          apiType: "ollama",
          apiKey: "",
          baseUrl: "http://127.0.0.1:11434",
          enable: true,
          models: [],
          customModels: [],
        } as any,
      ]);

      const fetchMock = vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith("/api/tags") || url.endsWith("/api/ps")) {
          return {
            ok: true,
            json: async () => ({
              models: [
                {
                  name: "qwen3:8b",
                  model: "qwen3:8b",
                  size: 123,
                  digest: "sha256:test",
                  modified_at: "2026-01-01T00:00:00Z",
                  details: {
                    format: "gguf",
                    family: "qwen",
                    families: ["qwen"],
                    parameter_size: "8B",
                    quantization_level: "Q4_0",
                  },
                },
              ],
            }),
            text: async () => "",
          };
        }

        if (url.endsWith("/api/pull")) {
          return {
            ok: true,
            json: async () => ({}),
            text: async () => "done",
          };
        }

        throw new Error(`Unexpected fetch url: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const dispatcher = createDaemonDispatcher(configPresenter as any);
      await expect(dispatcher(providersListOllamaModelsRoute.name, { providerId: "ollama" })).resolves.toMatchObject({
        models: [
          expect.objectContaining({
            name: "qwen3:8b",
            model: "qwen3:8b",
            size: 123,
            digest: "sha256:test",
          }),
        ],
      });
      await expect(
        dispatcher(providersListOllamaRunningModelsRoute.name, { providerId: "ollama" }),
      ).resolves.toMatchObject({
        models: [
          expect.objectContaining({
            name: "qwen3:8b",
          }),
        ],
      });
      await expect(
        dispatcher(providersPullOllamaModelRoute.name, { providerId: "ollama", modelName: "qwen3:8b" }),
      ).resolves.toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:11434/api/tags",
        expect.objectContaining({
          method: "GET",
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:11434/api/ps",
        expect.objectContaining({
          method: "GET",
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:11434/api/pull",
        expect.objectContaining({
          method: "POST",
        }),
      );
    } finally {
      vi.unstubAllGlobals();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resolves provider-db models (e.g. deepseek) from the catalog without calling /v1/models", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "argos-daemon-provider-db-"));
    try {
      const deepseekEntry = {
        id: "deepseek",
        name: "DeepSeek",
        models: [
          {
            id: "deepseek-chat",
            name: "deepseek-chat",
            display_name: "DeepSeek Chat",
            type: "chat",
            modalities: { input: ["text", "image"] },
            tool_call: true,
            reasoning: { supported: true },
            limit: { context: 64000, output: 8000 },
          },
          {
            id: "deepseek-reasoner",
            display_name: "DeepSeek Reasoner",
            type: "chat",
          },
        ],
      };

      const fakeLoader = {
        refreshIfNeeded: vi.fn().mockResolvedValue({ status: "skipped", lastUpdated: null, providersCount: 1 }),
        getProvider: (id: string) => (id === "deepseek" ? (deepseekEntry as any) : undefined),
      } as unknown as ProviderDbLoader;

      const configPresenter = new DaemonConfigPresenter(
        path.join(root, "config"),
        path.join(root, "data"),
        undefined,
        fakeLoader,
      );
      configPresenter.setProviders([
        {
          id: "deepseek",
          name: "DeepSeek",
          apiType: "deepseek",
          apiKey: "test-key",
          baseUrl: "https://api.deepseek.com/v1",
          enable: true,
          models: [],
          customModels: [],
        } as any,
      ]);

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const dispatcher = createDaemonDispatcher(configPresenter as any);
      await expect(dispatcher(providersRefreshModelsRoute.name, { providerId: "deepseek" })).resolves.toEqual({
        refreshed: true,
      });

      expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("api.deepseek.com"), expect.anything());

      const models = configPresenter.getProviderModels("deepseek");
      expect(models).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "deepseek-chat",
            name: "DeepSeek Chat",
            providerId: "deepseek",
            group: "default",
            vision: true,
            functionCall: true,
            reasoning: true,
            type: "chat",
            contextLength: 64000,
            maxTokens: 8000,
          }),
          expect.objectContaining({
            id: "deepseek-reasoner",
            name: "DeepSeek Reasoner",
            providerId: "deepseek",
          }),
        ]),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resolves provider-db models from a bundled catalog file offline (no network)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "argos-daemon-provider-db-offline-"));
    try {
      const builtInPath = path.join(root, "providers.json");
      await writeFile(
        builtInPath,
        JSON.stringify({
          providers: {
            deepseek: {
              id: "deepseek",
              name: "DeepSeek",
              models: [
                {
                  id: "deepseek-chat",
                  name: "deepseek-chat",
                  display_name: "DeepSeek Chat",
                  type: "chat",
                  limit: { context: 64000, output: 8000 },
                },
              ],
            },
          },
        }),
      );

      const loader = new ProviderDbLoader({
        cacheDir: path.join(root, "cache"),
        builtInDbPath: builtInPath,
      });
      loader.refreshIfNeeded = vi.fn().mockResolvedValue({
        status: "skipped",
        lastUpdated: null,
        providersCount: 1,
      });

      const configPresenter = new DaemonConfigPresenter(
        path.join(root, "config"),
        path.join(root, "data"),
        undefined,
        loader,
      );
      configPresenter.setProviders([
        {
          id: "deepseek",
          name: "DeepSeek",
          apiType: "deepseek",
          apiKey: "test-key",
          baseUrl: "https://api.deepseek.com/v1",
          enable: true,
          models: [],
          customModels: [],
        } as any,
      ]);

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const dispatcher = createDaemonDispatcher(configPresenter as any);
      await expect(dispatcher(providersRefreshModelsRoute.name, { providerId: "deepseek" })).resolves.toEqual({
        refreshed: true,
      });

      expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("api.deepseek.com"), expect.anything());
      const models = configPresenter.getProviderModels("deepseek");
      expect(models.find((m) => m.id === "deepseek-chat")).toBeTruthy();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resolveDaemonProviderDbBuiltIn honors ARGOS_PROVIDER_DB_BUILTIN", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "argos-daemon-provider-db-env-"));
    try {
      const builtInPath = path.join(root, "providers.json");
      await writeFile(builtInPath, JSON.stringify({ providers: {} }));

      const previous = process.env.ARGOS_PROVIDER_DB_BUILTIN;
      process.env.ARGOS_PROVIDER_DB_BUILTIN = builtInPath;
      try {
        expect(resolveDaemonProviderDbBuiltIn()).toBe(builtInPath);
      } finally {
        if (previous === undefined) delete process.env.ARGOS_PROVIDER_DB_BUILTIN;
        else process.env.ARGOS_PROVIDER_DB_BUILTIN = previous;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
