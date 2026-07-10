import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { DaemonConfigPresenter } from "../src/host/daemonConfigPresenter";
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
});
