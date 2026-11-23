import { describe, expect, it, vi } from "bun:test";
import { createDaemonMcpPorts, pickSamplingModelId } from "../src/host/daemonMcpPorts";

describe("createDaemonMcpPorts", () => {
  it("exposes custom models from the daemon config presenter", () => {
    const configPresenter = {
      getMcpServers: vi.fn(() => ({})),
      getProviders: vi.fn(() => []),
      getProviderModels: vi.fn(() => [{ id: "provider-model", name: "Provider" }]),
      getCustomModels: vi.fn(() => [{ id: "custom-model", name: "Custom" }]),
    };
    const ports = createDaemonMcpPorts({
      appVersion: "1.0.0",
      eventPublisher: { publish: vi.fn() } as any,
      configPresenter: configPresenter as any,
      configDir: "/tmp/argos",
      db: { prepare: vi.fn() } as any,
      sessionRepository: {
        get: vi.fn(),
        listMessages: vi.fn(),
      } as any,
    });

    expect(ports.services.getProviderModels?.("openai")).toEqual([{ id: "provider-model", name: "Provider" }]);
    expect(ports.services.getCustomModels?.("openai")).toEqual([{ id: "custom-model", name: "Custom" }]);
  });

  it("creates shared in-memory servers for daemon-safe built-ins", () => {
    const configPresenter = {
      getMcpServers: vi.fn(() => ({})),
      getProviders: vi.fn(() => []),
      getProviderModels: vi.fn(() => []),
      getCustomModels: vi.fn(() => []),
      getLanguage: vi.fn(() => "en-US"),
      getCustomPrompts: vi.fn(() => []),
    };
    const db = {
      prepare: vi.fn((sql: string) => ({
        all: vi.fn(() => {
          if (sql.includes("FROM daemon_sessions")) {
            return [];
          }
          return [];
        }),
        get: vi.fn(() => ({ count: 0, total: 0 })),
      })),
    };
    const sessionRepository = {
      get: vi.fn(async () => null),
      listMessages: vi.fn(async () => []),
    };
    const ports = createDaemonMcpPorts({
      appVersion: "1.0.0",
      eventPublisher: { publish: vi.fn() } as any,
      configPresenter: configPresenter as any,
      configDir: "/tmp/argos",
      db: db as any,
      sessionRepository: sessionRepository as any,
    });

    expect(ports.services.getInMemoryServer?.("Artifacts", [], {})).toEqual(
      expect.objectContaining({ startServer: expect.any(Function) }),
    );
    expect(ports.services.getInMemoryServer?.("argos-inmemory/conversation-search-server", [], {})).toEqual(
      expect.objectContaining({ startServer: expect.any(Function) }),
    );
  });

  it("creates the built-in knowledge server when the knowledge runtime is wired", () => {
    const configPresenter = {
      getMcpServers: vi.fn(() => ({})),
      getProviders: vi.fn(() => []),
      getProviderModels: vi.fn(() => []),
      getCustomModels: vi.fn(() => []),
      getKnowledgeConfigs: vi.fn(() => [
        { id: "kb_1", description: "KB", enabled: true, embedding: { modelId: "m", providerId: "p" } },
      ]),
    };
    const knowledge = {
      similarityQuery: vi.fn(async () => []),
    };
    const ports = createDaemonMcpPorts({
      appVersion: "1.0.0",
      eventPublisher: { publish: vi.fn() } as any,
      configPresenter: configPresenter as any,
      configDir: "/tmp/argos",
      knowledge,
      db: { prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(() => ({ count: 0 })) })) } as any,
      sessionRepository: {
        get: vi.fn(async () => null),
        listMessages: vi.fn(async () => []),
      } as any,
    });

    for (const name of ["builtinKnowledge", "argos-inmemory/builtin-knowledge-server"]) {
      const server = ports.services.getInMemoryServer?.(name, [], {});
      expect(server).toEqual(expect.objectContaining({ startServer: expect.any(Function) }));
    }

    // Without the knowledge runtime the case fails fast instead of silently.
    const noKnowledgePorts = createDaemonMcpPorts({
      appVersion: "1.0.0",
      eventPublisher: { publish: vi.fn() } as any,
      configPresenter: configPresenter as any,
      configDir: "/tmp/argos",
      db: { prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(() => ({ count: 0 })) })) } as any,
      sessionRepository: {
        get: vi.fn(async () => null),
        listMessages: vi.fn(async () => []),
      } as any,
    });
    expect(() => noKnowledgePorts.services.getInMemoryServer?.("builtinKnowledge", [], {})).toThrow(
      "Built-in knowledge runtime is not available",
    );
  });
});

describe("MCP sampling model choice", () => {
  const provider = {
    id: "openrouter",
    enable: true,
    apiKey: "k",
    baseUrl: "https://example.test/api",
    apiType: "openai",
  };

  it("uses model ids, not model records (models holds MODEL_META objects)", () => {
    expect(
      pickSamplingModelId({
        ...provider,
        enabledModels: [],
        models: [
          { id: "off", enabled: false },
          { id: "gpt-x", enabled: true },
        ],
      }),
    ).toBe("gpt-x");
    expect(pickSamplingModelId({ ...provider, enabledModels: ["chosen"], models: [{ id: "gpt-x" }] })).toBe("chosen");
    expect(
      pickSamplingModelId({
        ...provider,
        disabledModels: ["gpt-x"],
        models: [{ id: "gpt-x" }],
        customModels: [{ id: "mine" }],
      }),
    ).toBe("mine");
    expect(pickSamplingModelId({ ...provider, models: [] })).toBeNull();
  });

  it("sends a string model to the completion endpoint", async () => {
    const providers = [{ ...provider, models: [{ id: "gpt-x", name: "GPT X" }] }];
    const ports = createDaemonMcpPorts({
      appVersion: "1.0.0",
      eventPublisher: { publish: vi.fn() } as any,
      configPresenter: {
        getMcpServers: vi.fn(() => ({})),
        getProviders: vi.fn(() => providers),
        getProviderModels: vi.fn(() => []),
        getCustomModels: vi.fn(() => []),
      } as any,
      configDir: "/tmp/argos",
      db: { prepare: vi.fn() } as any,
      sessionRepository: { get: vi.fn(), listMessages: vi.fn() } as any,
    });

    const decision = (await ports.services.handleSamplingRequest!({ requestId: "r1" })) as {
      providerId: string;
      modelId: unknown;
    };
    expect(decision).toMatchObject({ approved: true, providerId: "openrouter", modelId: "gpt-x" });

    const originalFetch = globalThis.fetch;
    let body: { model?: unknown } = {};
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "haiku" } }] }), { status: 200 });
    }) as never;
    try {
      const text = await ports.services.generateCompletionStandalone!(
        decision.providerId,
        [{ role: "user", content: "hi" }],
        decision.modelId,
      );
      expect(text).toBe("haiku");
      expect(body.model).toBe("gpt-x");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
