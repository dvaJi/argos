import { describe, expect, it, vi } from "vitest";
import { DESKTOP_ONLY_ROUTE_PREFIXES } from "@argos/shared-contracts/desktop-only";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";

function createTestDispatcher(
  overrides: {
    configPresenter?: Record<string, unknown>;
    providerExecutionPort?: Record<string, unknown>;
    mcpRuntime?: Record<string, unknown>;
  } = {},
) {
  let knowledgeConfigs = [
    {
      id: "kb-1",
      description: "Daemon knowledge base",
      enabled: true,
      dimensions: 1536,
      normalized: true,
      embedding: { providerId: "openai", modelId: "text-embedding-3-small" },
      fragmentsNumber: 1,
      files: [],
    },
  ];
  let npmRegistryCache = {
    registry: "https://registry.example.com/",
    lastChecked: 123,
    isAutoDetect: true,
  };
  let customNpmRegistry = "https://registry.example.com/";
  let mcpServers: Record<string, any> = {};
  let mcpEnabled = true;
  const modelConfigs = new Map<string, any>();

  const configPresenter = {
    getProviders: () => [
      {
        id: "openai",
        name: "OpenAI",
        models: [{ id: "gpt-4", name: "GPT-4", group: "OpenAI", providerId: "openai", enabled: true }],
        customModels: [],
        enabledModels: ["gpt-4"],
        disabledModels: [],
      },
    ],
    getProviderById: (id: string) =>
      id === "openai"
        ? {
            id: "openai",
            name: "OpenAI",
            models: [{ id: "gpt-4", name: "GPT-4", group: "OpenAI", providerId: "openai", enabled: true }],
            customModels: [],
            enabledModels: ["gpt-4"],
            disabledModels: [],
          }
        : undefined,
    getProviderModels: (id: string) =>
      id === "openai" ? [{ id: "gpt-4", name: "GPT-4", group: "OpenAI", enabled: true }] : [],
    getCustomModels: () => [],
    listOllamaModels: () => [],
    listOllamaRunningModels: () => [],
    pullOllamaModel: () => false,
    refreshProviderModels: vi.fn(async () => []),
    getModelConfig: (modelId: string, providerId?: string) =>
      modelConfigs.get(`${providerId ?? ""}::${modelId}`) ?? {
        maxTokens: 0,
        contextLength: 0,
        vision: false,
        functionCall: false,
        reasoning: false,
        type: "chat",
        imageGeneration: undefined,
        videoGeneration: undefined,
        tts: undefined,
      },
    setModelConfig: vi.fn((modelId: string, providerId: string, config: unknown) => {
      modelConfigs.set(`${providerId}::${modelId}`, config);
    }),
    resetModelConfig: vi.fn((modelId: string, providerId: string) => {
      modelConfigs.delete(`${providerId}::${modelId}`);
    }),
    getProviderModelConfigs: (providerId: string) =>
      Array.from(modelConfigs.entries())
        .filter(([key]) => key.startsWith(`${providerId}::`))
        .map(([key, config]) => ({ modelId: key.split("::")[1], config })),
    hasUserModelConfig: (modelId: string, providerId: string) => modelConfigs.has(`${providerId}::${modelId}`),
    exportModelConfigs: () =>
      Object.fromEntries(
        Array.from(modelConfigs.entries()).map(([key, config]) => [
          key,
          { id: key, providerId: key.split("::")[0], config },
        ]),
      ),
    importModelConfigs: (configs: Record<string, unknown>, overwrite = false) => {
      if (overwrite) {
        modelConfigs.clear();
      }
      for (const [key, value] of Object.entries(configs)) {
        modelConfigs.set(key, value);
      }
    },
    addCustomModel: vi.fn(),
    removeCustomModel: vi.fn(),
    updateCustomModel: vi.fn(),
    getSetting: (key: string) => (key === "mcprouterApiKey" ? "router-key" : undefined),
    setSetting: vi.fn(),
    getNpmRegistryCache: () => npmRegistryCache,
    getEffectiveNpmRegistry: () => customNpmRegistry,
    getAutoDetectNpmRegistry: () => true,
    getCustomNpmRegistry: () => customNpmRegistry,
    setCustomNpmRegistry: vi.fn((registry: string) => {
      customNpmRegistry = registry;
    }),
    setAutoDetectNpmRegistry: vi.fn(),
    clearNpmRegistryCache: vi.fn(() => {
      npmRegistryCache = undefined as never;
    }),
    listMcpRouterServers: vi.fn(async () => [{ key: "router-a" }]),
    installMcpRouterServer: vi.fn(async () => true),
    getKnowledgeConfigs: () => knowledgeConfigs,
    setKnowledgeConfigs: vi.fn((configs: unknown[]) => {
      knowledgeConfigs = configs as typeof knowledgeConfigs;
    }),
    getMcpServers: vi.fn(async () => mcpServers),
    getMcpEnabled: vi.fn(async () => mcpEnabled),
    setMcpEnabled: vi.fn(async (enabled: boolean) => {
      mcpEnabled = enabled;
    }),
    addMcpServer: vi.fn(async (name: string, config: unknown) => {
      mcpServers = { ...mcpServers, [name]: config };
      return true;
    }),
    updateMcpServer: vi.fn(async (name: string, config: unknown) => {
      mcpServers = { ...mcpServers, [name]: { ...(mcpServers[name] ?? {}), ...(config as object) } };
    }),
    removeMcpServer: vi.fn(async (name: string) => {
      const { [name]: _removed, ...rest } = mcpServers;
      mcpServers = rest;
    }),
    ...overrides.configPresenter,
  } as any;

  const eventPublisher = {
    publish: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };

  const sessionRepository = {
    getSearchResults: vi.fn(async () => []),
    listMessageTraces: vi.fn(async () => []),
    getViewManifests: vi.fn(async () => []),
    getViewLineage: vi.fn(async () => []),
    resumePendingQueue: vi.fn(),
  } as any;

  const providerExecutionPort = {
    sendMessage: vi.fn(),
    steerActiveTurn: vi.fn(),
    respondToolInteraction: vi.fn(() => ({ resumed: false })),
    cancelGeneration: vi.fn(),
    testConnection: vi.fn(),
    generateCompletion: vi.fn(async () => "translated text"),
    ...overrides.providerExecutionPort,
  };

  const acpSessionExecutionPort = {
    getAcpSessionCommands: vi.fn(async () => []),
    getAcpSessionConfigOptions: vi.fn(async () => ({})),
    setAcpSessionConfigOption: vi.fn(async () => ({})),
  };

  const pluginRuntime = {
    listPlugins: vi.fn(async () => []),
    getPlugin: vi.fn(async () => undefined),
    enablePlugin: vi.fn(async () => {
      throw new Error("Plugin enable is not available in daemon mode");
    }),
    disablePlugin: vi.fn(async () => {
      throw new Error("Plugin disable is not available in daemon mode");
    }),
    invokeAction: vi.fn(async () => {
      throw new Error("Plugin action is not available in daemon mode");
    }),
  };

  const providerImportService = {
    scan: vi.fn(async () => ({
      sessionId: "scan-1",
      sourceOrder: [],
      sources: [],
      providers: [],
    })),
    apply: vi.fn(() => ({
      summary: { imported: 0, created: 0, updated: 0, skipped: 0, overwritten: 0, models: 0 },
      results: [],
    })),
  };

  const settingsActivityDb = {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
    })),
  };

  const mcpRuntime = {
    startServer: vi.fn(),
    stopServer: vi.fn(),
    isServerRunning: vi.fn(() => false),
    refreshNpmRegistry: vi.fn(async () => "https://registry.npmjs.org/"),
    getClients: vi.fn(async () => [{ id: "client-1" }]),
    getPrompt: vi.fn(async () => ({ name: "prompt", content: "prompt body" })),
    readResource: vi.fn(async () => ({ uri: "resource://1", text: "resource body" })),
    listPrompts: vi.fn(async () => []),
    listResources: vi.fn(async () => []),
    ...overrides.mcpRuntime,
  };

  const skillRuntime = {
    presenter: {
      getMetadataList: vi.fn(async () => []),
      getSkillsDir: vi.fn(async () => "/tmp/skills"),
      installFromFolder: vi.fn(async () => ({ installed: true })),
      installFromZip: vi.fn(async () => ({ installed: true })),
      installFromUrl: vi.fn(async () => ({ installed: true })),
      uninstallSkill: vi.fn(async () => ({ uninstalled: true })),
      updateSkillFile: vi.fn(async () => ({ updated: true })),
      saveSkillWithExtension: vi.fn(async () => ({ saved: true })),
      getSkillFolderTree: vi.fn(async () => []),
      openSkillsFolder: vi.fn(async () => undefined),
      getSkillExtension: vi.fn(async () => ({})),
      saveSkillExtension: vi.fn(async () => undefined),
      listSkillScripts: vi.fn(async () => []),
      getActiveSkills: vi.fn(async () => []),
      setActiveSkills: vi.fn(async () => []),
    },
  };

  const scheduledTasks = {
    list: vi.fn(() => ({ version: 1 as const, tasks: [] as unknown[] })),
    upsert: vi.fn(() => ({ task: {}, settings: { version: 1 as const, tasks: [] as unknown[] } })),
    delete: vi.fn(() => ({ settings: { version: 1 as const, tasks: [] as unknown[] } })),
    toggle: vi.fn(() => ({ task: {}, settings: { version: 1 as const, tasks: [] as unknown[] } })),
    fireNow: vi.fn(async () => ({ task: {}, settings: { version: 1 as const, tasks: [] as unknown[] } })),
  };

  const syncRuntime = {
    getBackupStatus: vi.fn(async () => ({ autoSyncEnabled: false, lastBackupTimestamp: null })),
    listBackups: vi.fn(async () => ({ backups: [] })),
    startBackup: vi.fn(async () => ({ timestamp: 1 })),
    restoreBackup: vi.fn(async () => undefined),
    getCloudConfig: vi.fn(async () => ({
      enabled: false,
      endpoint: "",
      bucket: "",
      region: "",
      prefix: "",
      accessKeyId: "",
      hasSecret: false,
      safeStorageAvailable: false,
    })),
    setCloudConfig: vi.fn(async () => ({
      enabled: false,
      endpoint: "",
      bucket: "",
      region: "",
      prefix: "",
      accessKeyId: "",
      hasSecret: false,
      safeStorageAvailable: false,
    })),
    testCloud: vi.fn(async () => ({ success: true, message: "" })),
    uploadToCloud: vi.fn(async () => ({ success: true, message: "" })),
    pullFromCloud: vi.fn(async () => ({ success: true, message: "" })),
  };

  const memoryRuntime = {
    presenter: {
      listMemories: vi.fn(() => []),
      getStatus: vi.fn(() => ({ total: 0, pendingEmbedding: 0, hasPersona: false })),
      recall: vi.fn(async () => []),
      deleteMemory: vi.fn(async () => true),
      clearMemories: vi.fn(async () => 0),
    },
    addMemory: vi.fn(async () => ({ id: "memory-1" })),
  };

  return {
    dispatcher: createDaemonDispatcher(
      configPresenter,
      eventPublisher as any,
      sessionRepository,
      providerExecutionPort as any,
      acpSessionExecutionPort as any,
      mcpRuntime as any,
      skillRuntime as any,
      scheduledTasks as any,
      syncRuntime as any,
      memoryRuntime as any,
      { runtime: {} as any } as any,
      pluginRuntime as any,
      providerImportService as any,
      settingsActivityDb as any,
    ),
    sessionRepository,
    providerExecutionPort,
    acpSessionExecutionPort,
    configPresenter,
    mcpRuntime,
    skillRuntime,
    scheduledTasks,
    syncRuntime,
    memoryRuntime,
    pluginRuntime,
    providerImportService,
    settingsActivityDb,
  };
}

function expectNoComingSoonError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    !message.includes("Coming soon") && !message.includes("requires additional runtime services not yet available")
  );
}

describe("DaemonDispatcher Tier 2 routes no longer return Coming soon", () => {
  describe("config.*", () => {
    it("config.getKnowledgeConfigs returns persisted knowledge configs", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("config.getKnowledgeConfigs", {});
      expect(result).toEqual({
        configs: [
          expect.objectContaining({
            id: "kb-1",
            enabled: true,
          }),
        ],
      });
    });

    it("config.setKnowledgeConfigs stores configs and returns them", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher();
      const nextConfigs = [
        {
          id: "kb-2",
          description: "Updated daemon knowledge base",
          enabled: false,
          dimensions: 768,
          normalized: false,
          embedding: { providerId: "openai", modelId: "text-embedding-3-small" },
          fragmentsNumber: 1,
        },
      ];

      const result = await dispatcher("config.setKnowledgeConfigs", { configs: nextConfigs });
      expect(result).toEqual({
        configs: [
          expect.objectContaining({
            id: "kb-2",
            description: "Updated daemon knowledge base",
            enabled: false,
            dimensions: 768,
            normalized: false,
            embedding: { providerId: "openai", modelId: "text-embedding-3-small" },
            fragmentsNumber: 1,
          }),
        ],
      });
      expect(configPresenter.setKnowledgeConfigs).toHaveBeenCalledWith(nextConfigs);
    });
  });

  describe("providers.*", () => {
    it("providers.listModels returns models from config", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("providers.listModels", { providerId: "openai" });
      expect(result).toEqual({
        providerModels: [expect.objectContaining({ id: "gpt-4", providerId: "openai" })],
        customModels: [],
      });
    });

    it("providers.getRateLimitStatus returns neutral status", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("providers.getRateLimitStatus", { providerId: "openai" });
      expect(result).toEqual({
        status: expect.objectContaining({
          config: { enabled: false, qpsLimit: 0 },
          currentQps: 0,
          queueLength: 0,
          lastRequestTime: 0,
        }),
      });
    });

    it("providers.refreshModels returns refreshed true", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("providers.refreshModels", { providerId: "openai" });
      expect(result).toEqual({ refreshed: true });
    });

    it("providers.listOllamaModels returns empty array", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("providers.listOllamaModels", { providerId: "openai" });
      expect(result).toEqual({ models: [] });
    });

    it("providers.listOllamaRunningModels returns empty array", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("providers.listOllamaRunningModels", { providerId: "openai" });
      expect(result).toEqual({ models: [] });
    });

    it("providers.pullOllamaModel returns success false", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("providers.pullOllamaModel", { providerId: "openai", modelName: "llama" });
      expect(result).toEqual({ success: false });
    });

    it("providers.import.scan returns empty scan result", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("providers.import.scan", {});
      expect(result).toEqual(
        expect.objectContaining({
          sourceOrder: [],
          sources: [],
          providers: [],
        }),
      );
    });

    it("providers.import.apply returns empty summary", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("providers.import.apply", { sessionId: "s-1", selections: [] });
      expect(result).toEqual(
        expect.objectContaining({
          summary: expect.objectContaining({ imported: 0 }),
          results: [],
        }),
      );
    });
  });

  describe("desktop-only routes", () => {
    // settings.listSystemFonts is desktop-only for Electron routing (it must hit
    // IPC to enumerate real OS fonts) but the daemon returns an empty list so web
    // mode degrades gracefully. Exclude it from the "must throw" assertions.
    const desktopOnlyRoutes = DESKTOP_ONLY_ROUTE_PREFIXES.filter((route) => route !== "settings.listSystemFonts").map(
      (route) => (route.endsWith(".") ? `${route}test` : route),
    );

    it.each(desktopOnlyRoutes)("%s fails explicitly in headless daemon mode", async (route) => {
      const { dispatcher } = createTestDispatcher();
      await expect(dispatcher(route as any, {})).rejects.toThrow(`Route not available in headless mode: ${route}`);
    });

    it("settings.listSystemFonts returns empty fonts in headless daemon mode", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = (await dispatcher("settings.listSystemFonts", {})) as { fonts: string[] };
      expect(result.fonts).toEqual([]);
    });

    it("skills.openFolder fails explicitly in headless daemon mode", async () => {
      const { dispatcher } = createTestDispatcher();
      await expect(dispatcher("skills.openFolder", {})).rejects.toThrow(
        "Opening the skills folder is not available in daemon mode.",
      );
    });
  });

  describe("mcp.*", () => {
    it("mcp.getNpmRegistryStatus returns registry state from the daemon config", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("mcp.getNpmRegistryStatus", {});
      expect(result).toEqual({
        status: {
          currentRegistry: "https://registry.example.com/",
          isFromCache: true,
          lastChecked: 123,
          autoDetectEnabled: true,
          customRegistry: "https://registry.example.com/",
        },
      });
    });

    it("mcp.refreshNpmRegistry delegates to the daemon MCP runtime", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher();
      const result = await dispatcher("mcp.refreshNpmRegistry", {});
      expect(result).toEqual({ registry: "https://registry.npmjs.org/" });
      expect(mcpRuntime.refreshNpmRegistry).toHaveBeenCalledTimes(1);
    });

    it("mcp.getClients delegates to the daemon MCP runtime", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher();
      const result = await dispatcher("mcp.getClients", {});
      expect(result).toEqual({ clients: [{ id: "client-1" }] });
      expect(mcpRuntime.getClients).toHaveBeenCalledTimes(1);
    });

    it("mcp.callTool delegates to the daemon MCP runtime", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher({
        mcpRuntime: {
          callTool: vi.fn(async () => ({
            content: "Daemon tool result",
            rawData: { content: [] },
          })),
        },
      });
      const result = await dispatcher("mcp.callTool", {
        request: {
          name: "echo",
          arguments: {},
        },
      } as any);
      expect(result).toEqual({
        content: "Daemon tool result",
        rawData: { content: [] },
      });
      expect(mcpRuntime.callTool).toHaveBeenCalledTimes(1);
    });

    it("mcp.startServer starts a daemon MCP server", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher();
      const result = await dispatcher("mcp.startServer", { serverName: "server-1" });
      expect(result).toEqual({ started: true });
      expect(mcpRuntime.startServer).toHaveBeenCalledWith("server-1");
    });

    it("mcp.stopServer stops a daemon MCP server", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher();
      const result = await dispatcher("mcp.stopServer", { serverName: "server-1" });
      expect(result).toEqual({ stopped: true });
      expect(mcpRuntime.stopServer).toHaveBeenCalledWith("server-1");
    });

    it("mcp.isServerRunning reports daemon MCP server status", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher({
        mcpRuntime: {
          isServerRunning: vi.fn(() => true),
        },
      });
      const result = await dispatcher("mcp.isServerRunning", { serverName: "server-1" });
      expect(result).toEqual({ running: true });
      expect(mcpRuntime.isServerRunning).toHaveBeenCalledWith("server-1");
    });

    it("mcp.listToolDefinitions delegates to the daemon MCP runtime", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher({
        mcpRuntime: {
          listToolDefinitions: vi.fn(async () => [
            {
              type: "function",
              function: { name: "echo", description: "Echo" },
            },
          ]),
        },
      });
      const result = await dispatcher("mcp.listToolDefinitions", { enabledMcpTools: ["echo"] });
      expect(result).toEqual({
        tools: [
          expect.objectContaining({
            function: expect.objectContaining({
              name: "echo",
              description: "Echo",
            }),
          }),
        ],
      });
      expect(mcpRuntime.listToolDefinitions).toHaveBeenCalledWith(["echo"]);
    });

    it("mcp.getServers returns the daemon MCP config", async () => {
      const { dispatcher } = createTestDispatcher({
        configPresenter: {
          getMcpServers: vi.fn(async () => ({
            "server-1": { type: "stdio", command: "node", args: ["server.js"] },
          })),
        },
      });
      const result = await dispatcher("mcp.getServers", {});
      expect(result).toEqual({
        servers: {
          "server-1": expect.objectContaining({ type: "stdio", command: "node" }),
        },
      });
    });

    it("mcp.getEnabled returns the daemon MCP enabled flag", async () => {
      const { dispatcher } = createTestDispatcher({
        configPresenter: {
          getMcpEnabled: vi.fn(async () => false),
        },
      });
      const result = await dispatcher("mcp.getEnabled", {});
      expect(result).toEqual({ enabled: false });
    });

    it("mcp.addServer updates the daemon MCP config", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher();
      const result = await dispatcher("mcp.addServer", {
        serverName: "server-1",
        config: { type: "stdio", command: "node", args: ["server.js"] },
      } as any);
      expect(result).toEqual({ success: true });
      expect(configPresenter.addMcpServer).toHaveBeenCalledWith("server-1", {
        type: "stdio",
        command: "node",
        args: ["server.js"],
      });
    });

    it("mcp.updateServer updates the daemon MCP config", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher();
      const result = await dispatcher("mcp.updateServer", {
        serverName: "server-1",
        config: { command: "bun" },
      } as any);
      expect(result).toEqual({ updated: true });
      expect(configPresenter.updateMcpServer).toHaveBeenCalledWith("server-1", { command: "bun" });
    });

    it("mcp.removeServer removes the daemon MCP config", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher();
      const result = await dispatcher("mcp.removeServer", {
        serverName: "server-1",
      } as any);
      expect(result).toEqual({ removed: true });
      expect(configPresenter.removeMcpServer).toHaveBeenCalledWith("server-1");
    });

    it("mcp.setEnabled updates the daemon MCP enabled flag", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher();
      const result = await dispatcher("mcp.setEnabled", { enabled: false });
      expect(result).toEqual({ enabled: false });
      expect(configPresenter.setMcpEnabled).toHaveBeenCalledWith(false);
    });

    it("mcp.isServerInstalled reflects daemon MCP config ownership", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher({
        configPresenter: {
          getMcpServers: vi.fn(async () => ({
            "server-1": { source: "plugin", sourceId: "plugin-1" },
          })),
        },
      });
      const result = await dispatcher("mcp.isServerInstalled", {
        source: "plugin",
        sourceId: "plugin-1",
      });
      expect(result).toEqual({ installed: true });
      expect(configPresenter.getMcpServers).toHaveBeenCalledTimes(1);
    });

    it("mcp.isServerInstalled reports false for missing daemon MCP config ownership", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher({
        configPresenter: {
          getMcpServers: vi.fn(async () => ({})),
        },
      });
      const result = await dispatcher("mcp.isServerInstalled", {
        source: "plugin",
        sourceId: "plugin-1",
      });
      expect(result).toEqual({ installed: false });
      expect(configPresenter.getMcpServers).toHaveBeenCalledTimes(1);
    });

    it("mcp.getMcpRouterApiKey returns the daemon router api key", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher({
        configPresenter: {
          getSetting: vi.fn((key: string) => (key === "mcprouterApiKey" ? "router-key" : undefined)),
        },
      });
      const result = await dispatcher("mcp.getMcpRouterApiKey", {});
      expect(result).toEqual({ apiKey: "router-key" });
      expect(configPresenter.getSetting).toHaveBeenCalledWith("mcprouterApiKey");
    });

    it("mcp.setMcpRouterApiKey stores the daemon router api key", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher({
        configPresenter: {
          setSetting: vi.fn(),
        },
      });
      const result = await dispatcher("mcp.setMcpRouterApiKey", { key: "new-router-key" });
      expect(result).toEqual({ set: true });
      expect(configPresenter.setSetting).toHaveBeenCalledWith("mcprouterApiKey", "new-router-key");
    });

    it("mcp.listMcpRouterServers returns the daemon MCP router catalog", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher({
        configPresenter: {
          listMcpRouterServers: vi.fn(async () => [
            {
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
              name: "router-one",
              author_name: "Argos",
              title: "Router One",
              description: "Daemon router server",
              server_key: "router-one",
            },
          ]),
        },
      });
      const result = await dispatcher("mcp.listMcpRouterServers", { page: 1, limit: 20 });
      expect(result).toEqual({
        servers: [
          expect.objectContaining({
            name: "router-one",
            title: "Router One",
            server_key: "router-one",
          }),
        ],
      });
      expect(configPresenter.listMcpRouterServers).toHaveBeenCalledWith(1, 20);
    });

    it("mcp.installMcpRouterServer installs the requested daemon router server", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher({
        configPresenter: {
          installMcpRouterServer: vi.fn(async () => true),
        },
      });
      const result = await dispatcher("mcp.installMcpRouterServer", { serverKey: "router-one" });
      expect(result).toEqual({ installed: true });
      expect(configPresenter.installMcpRouterServer).toHaveBeenCalledWith("router-one");
    });

    it("mcp.updateMcpRouterServersAuth updates daemon router auth", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher({
        configPresenter: {
          getMcpServers: vi.fn(async () => ({
            "router-1": {
              source: "mcprouter",
              customHeaders: { Existing: "header" },
            },
            "router-2": {
              source: "stdio",
              customHeaders: {},
            },
          })),
          updateMcpServer: vi.fn(async () => undefined),
        },
      });
      const result = await dispatcher("mcp.updateMcpRouterServersAuth", { apiKey: "router-key" });
      expect(result).toEqual({ updated: true });
      expect(configPresenter.getMcpServers).toHaveBeenCalledTimes(1);
      expect(configPresenter.updateMcpServer).toHaveBeenCalledWith("router-1", {
        source: "mcprouter",
        customHeaders: {
          Existing: "header",
          Authorization: "Bearer router-key",
        },
      });
      expect(configPresenter.updateMcpServer).not.toHaveBeenCalledWith(
        "router-2",
        expect.objectContaining({ customHeaders: expect.objectContaining({ Authorization: "Bearer router-key" }) }),
      );
    });

    it("mcp.listPrompts delegates to the daemon MCP runtime", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher({
        mcpRuntime: {
          listPrompts: vi.fn(async () => [
            {
              id: "prompt-1",
              name: "Prompt One",
              description: "Daemon prompt",
              arguments: [],
              files: [],
            },
          ]),
        },
      });
      const result = await dispatcher("mcp.listPrompts", {});
      expect(result).toEqual({
        prompts: [
          expect.objectContaining({
            id: "prompt-1",
            name: "Prompt One",
            description: "Daemon prompt",
          }),
        ],
      });
      expect(mcpRuntime.listPrompts).toHaveBeenCalledTimes(1);
    });

    it("mcp.listResources delegates to the daemon MCP runtime", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher({
        mcpRuntime: {
          listResources: vi.fn(async () => [
            {
              uri: "daemon://resource-1",
              name: "Resource One",
              description: "Daemon resource",
            },
          ]),
        },
      });
      const result = await dispatcher("mcp.listResources", {});
      expect(result).toEqual({
        resources: [
          expect.objectContaining({
            uri: "daemon://resource-1",
            name: "Resource One",
            description: "Daemon resource",
          }),
        ],
      });
      expect(mcpRuntime.listResources).toHaveBeenCalledTimes(1);
    });

    it("mcp.getPrompt delegates to the daemon MCP runtime", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher({
        mcpRuntime: {
          getPrompt: vi.fn(async () => ({ name: "Prompt One", content: "Daemon prompt body" })),
        },
      });
      const result = await dispatcher("mcp.getPrompt", {
        prompt: { name: "Prompt One", client: { name: "client-1" } },
        args: { topic: "headless" },
      } as any);
      expect(result).toEqual({
        result: expect.objectContaining({
          name: "Prompt One",
          content: "Daemon prompt body",
        }),
      });
      expect(mcpRuntime.getPrompt).toHaveBeenCalledTimes(1);
    });

    it("mcp.readResource delegates to the daemon MCP runtime", async () => {
      const { dispatcher, mcpRuntime } = createTestDispatcher({
        mcpRuntime: {
          readResource: vi.fn(async () => ({ uri: "daemon://resource-1", text: "Daemon resource body" })),
        },
      });
      const result = await dispatcher("mcp.readResource", {
        resource: { client: { name: "client-1" }, uri: "daemon://resource-1" },
      } as any);
      expect(result).toEqual({
        resource: expect.objectContaining({
          uri: "daemon://resource-1",
          text: "Daemon resource body",
        }),
      });
      expect(mcpRuntime.readResource).toHaveBeenCalledTimes(1);
    });

    it("mcp.submitSamplingDecision is acknowledged in daemon mode", async () => {
      const { dispatcher } = createTestDispatcher();
      await expect(
        dispatcher("mcp.submitSamplingDecision", { decision: "approve", requestId: "req-1" } as any),
      ).resolves.toEqual({ submitted: true });
    });

    it("mcp.cancelSamplingRequest is acknowledged in daemon mode", async () => {
      const { dispatcher } = createTestDispatcher();
      await expect(dispatcher("mcp.cancelSamplingRequest", { requestId: "req-1" } as any)).resolves.toEqual({
        cancelled: true,
      });
    });
  });

  describe("models.*", () => {
    it("models.getConfig and models.setConfig round-trip through the daemon config", async () => {
      const { dispatcher } = createTestDispatcher();
      const nextConfig = {
        maxTokens: 1024,
        contextLength: 8192,
        vision: true,
        functionCall: true,
        reasoning: false,
        type: "chat",
        imageGeneration: undefined,
        videoGeneration: undefined,
        tts: undefined,
      };

      const setResult = await dispatcher("models.setConfig", {
        modelId: "gpt-4",
        providerId: "openai",
        config: nextConfig,
      });
      expect(setResult).toEqual({ config: expect.objectContaining(nextConfig) });

      const getResult = await dispatcher("models.getConfig", {
        modelId: "gpt-4",
        providerId: "openai",
      });
      expect(getResult).toEqual({ config: expect.objectContaining(nextConfig) });
    });

    it("models.addCustom updates the daemon provider config surface", async () => {
      const { dispatcher, configPresenter } = createTestDispatcher();
      const customModel = {
        id: "custom-1",
        name: "Custom One",
        group: "openai",
        providerId: "openai",
        enabled: true,
        vision: false,
        functionCall: false,
        reasoning: false,
        isCustom: true,
      };

      const result = await dispatcher("models.addCustom", {
        providerId: "openai",
        model: customModel,
      });
      expect(result).toEqual({ model: customModel });
      expect(configPresenter.addCustomModel).toHaveBeenCalledWith("openai", customModel);
    });
  });

  describe("models.*", () => {
    it("models.listRuntime returns enabled models", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("models.listRuntime", { providerId: "openai" });
      expect(result).toEqual({
        models: [expect.objectContaining({ id: "gpt-4", providerId: "openai" })],
      });
    });

    it("models.transcribeAudio throws a specific error", async () => {
      const { dispatcher } = createTestDispatcher();
      await expect(
        dispatcher("models.transcribeAudio", {
          providerId: "openai",
          modelId: "whisper",
          audioBase64: "abc",
          mimeType: "audio/mp3",
        }),
      ).rejects.toSatisfy(expectNoComingSoonError);
    });
  });

  describe("sessions.resumePendingQueue", () => {
    it("resumes the pending queue and returns success", async () => {
      const { dispatcher, sessionRepository } = createTestDispatcher();
      const result = await dispatcher("sessions.resumePendingQueue", { sessionId: "session-1" });
      expect(result).toEqual({ resumed: true });
      expect(sessionRepository.resumePendingQueue).toHaveBeenCalledWith("session-1");
    });
  });

  describe("sessions.trace artifacts", () => {
    it("delegates search results, traces, manifests, and lineage to the daemon session repository", async () => {
      const { dispatcher, sessionRepository } = createTestDispatcher({
        configPresenter: {
          getAcpAgents: vi.fn(async () => []),
        },
      });
      sessionRepository.getSearchResults.mockResolvedValue([{ id: "search-1" }]);
      sessionRepository.listMessageTraces.mockResolvedValue([{ id: "trace-1" }]);
      sessionRepository.getViewManifests.mockResolvedValue([{ id: "manifest-1" }]);
      sessionRepository.getViewLineage.mockResolvedValue([{ id: "lineage-1" }]);

      await expect(
        dispatcher("sessions.getSearchResults", {
          messageId: "message-1",
          searchId: "search-2",
        }),
      ).resolves.toEqual({ results: [{ id: "search-1" }] });
      await expect(dispatcher("sessions.listMessageTraces", { messageId: "message-1" })).resolves.toEqual({
        traces: [{ id: "trace-1" }],
      });
      await expect(dispatcher("sessions.getViewManifests", { sessionId: "session-1" })).resolves.toEqual({
        manifests: [{ id: "manifest-1" }],
      });
      await expect(dispatcher("sessions.getViewLineage", { sessionId: "session-1" })).resolves.toEqual({
        lineage: [{ id: "lineage-1" }],
      });

      expect(sessionRepository.getSearchResults).toHaveBeenCalledWith("message-1", "search-2");
      expect(sessionRepository.listMessageTraces).toHaveBeenCalledWith("message-1");
      expect(sessionRepository.getViewManifests).toHaveBeenCalledWith("session-1");
      expect(sessionRepository.getViewLineage).toHaveBeenCalledWith("session-1");
    });
  });

  describe("chat.*", () => {
    it("chat.steerActiveTurn forwards to provider execution port", async () => {
      const { dispatcher, providerExecutionPort } = createTestDispatcher();
      const result = await dispatcher("chat.steerActiveTurn", { sessionId: "session-1", content: "go left" });
      expect(result).toEqual({ accepted: true });
      expect(providerExecutionPort.steerActiveTurn).toHaveBeenCalledWith("session-1", "go left");
    });

    it("chat.respondToolInteraction forwards to provider execution port", async () => {
      const { dispatcher, providerExecutionPort } = createTestDispatcher();
      const response = { kind: "permission", granted: true } as const;
      const result = await dispatcher("chat.respondToolInteraction", {
        sessionId: "session-1",
        messageId: "msg-1",
        toolCallId: "tool-1",
        response,
      });
      expect(result).toEqual({ accepted: true, resumed: false });
      expect(providerExecutionPort.respondToolInteraction).toHaveBeenCalledWith(
        "session-1",
        "msg-1",
        "tool-1",
        response,
      );
    });
  });

  describe("plugins.*", () => {
    it("plugins.list returns empty list", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("plugins.list", {});
      expect(result).toEqual({ plugins: [] });
    });

    it("plugins.get returns undefined", async () => {
      const { dispatcher } = createTestDispatcher();
      const result = await dispatcher("plugins.get", { pluginId: "p1" });
      expect(result).toEqual({ plugin: undefined });
    });

    it("plugins.enable throws a specific headless-only error", async () => {
      const { dispatcher } = createTestDispatcher();
      await expect(dispatcher("plugins.enable", { pluginId: "p1" })).rejects.toSatisfy(expectNoComingSoonError);
    });

    it("plugins.disable throws a specific headless-only error", async () => {
      const { dispatcher } = createTestDispatcher();
      await expect(dispatcher("plugins.disable", { pluginId: "p1" })).rejects.toSatisfy(expectNoComingSoonError);
    });

    it("plugins.invokeAction throws a specific headless-only error", async () => {
      const { dispatcher } = createTestDispatcher();
      await expect(dispatcher("plugins.invokeAction", { pluginId: "p1", actionId: "a1" })).rejects.toSatisfy(
        expectNoComingSoonError,
      );
    });
  });

  it("no Tier 2 route returns the Coming soon message", async () => {
    const routes = [
      ["providers.listModels", { providerId: "openai" }],
      ["providers.getRateLimitStatus", { providerId: "openai" }],
      ["providers.refreshModels", { providerId: "openai" }],
      ["providers.listOllamaModels", { providerId: "openai" }],
      ["providers.listOllamaRunningModels", { providerId: "openai" }],
      ["providers.pullOllamaModel", { providerId: "openai", modelName: "x" }],
      ["providers.import.scan", {}],
      ["providers.import.apply", { sessionId: "s-1", selections: [] }],
      ["models.listRuntime", { providerId: "openai" }],
      ["models.transcribeAudio", { providerId: "openai", modelId: "w", audioBase64: "a", mimeType: "m" }],
      ["sessions.resumePendingQueue", { sessionId: "s-1" }],
      ["chat.steerActiveTurn", { sessionId: "s-1", content: "hi" }],
      [
        "chat.respondToolInteraction",
        { sessionId: "s-1", messageId: "m", toolCallId: "t", response: { kind: "permission", granted: true } },
      ],
      ["plugins.list", {}],
      ["plugins.get", { pluginId: "p" }],
      ["plugins.enable", { pluginId: "p" }],
      ["plugins.disable", { pluginId: "p" }],
      ["plugins.invokeAction", { pluginId: "p", actionId: "a" }],
    ] as const;

    const { dispatcher } = createTestDispatcher();
    for (const [route, input] of routes) {
      try {
        await dispatcher(route as never, input as never);
      } catch (error) {
        expectNoComingSoonError(error);
      }
    }
  });
});
