import { BuiltinKnowledgeConfig, MCPServerConfig } from "@argos/shared/presenter";
import { compare } from "compare-versions";
import type { StoreLike, StoreFactory } from "@argos/backend-core";

// NPM Registry cache interface
export interface INpmRegistryCache {
  registry: string;
  lastChecked: number;
  isAutoDetect: boolean;
}

// MCP settings interface
interface IMcpSettings {
  mcpServers: Record<string, MCPServerConfig>;
  defaultServer?: string;
  defaultServers?: string[];
  mcpEnabled: boolean; // Add MCP enabled status field
  npmRegistryCache?: INpmRegistryCache; // NPM registry cache
  customNpmRegistry?: string; // User custom NPM registry
  autoDetectNpmRegistry?: boolean; // Whether to enable auto detection
  removedBuiltInServers?: string[]; // Track built-in servers removed by user
  [key: string]: unknown; // Allow arbitrary keys
}
export type MCPServerType = "stdio" | "sse" | "inmemory" | "http";

// Extended MCP server config with additional properties for ModelScope sync
export interface ExtendedMCPServerConfig {
  name: string;
  description: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  type: MCPServerType;
  package?: string;
  version?: string;
  source?: string;
  logo_url?: string;
  publisher?: string;
  tags?: string[];
  view_count?: number;
}

// Check current system platform
function isMacOS(): boolean {
  return process.platform === "darwin";
}

function isWindows(): boolean {
  return process.platform === "win32";
}

function isLinux(): boolean {
  return process.platform === "linux";
}

// Platform-specific MCP server configurations
const PLATFORM_SPECIFIC_SERVERS: Record<string, Omit<MCPServerConfig, "enabled">> = {
  // macOS specific services
  ...(isMacOS()
    ? {
        "argos/apple-server": {
          args: [],
          descriptions: "Argos built-in Apple system integration service (macOS only)",
          icons: "🍎",
          autoApprove: ["all"],
          type: "inmemory" as MCPServerType,
          command: "argos/apple-server",
          env: {},
          disable: false,
        },
      }
    : {}),

  // Windows specific services (reserved)
  ...(isWindows()
    ? {
        // 'argos-inmemory/windows-server': {
        //   args: [],
        //   descriptions: 'Argos built-in Windows system integration service (Windows only)',
        //   icons: '🪟',
        //   autoApprove: ['all'],
        //   type: 'inmemory' as MCPServerType,
        //   command: 'argos-inmemory/windows-server',
        //   env: {},
        //   disable: false
        // }
      }
    : {}),

  // Linux specific services (reserved)
  ...(isLinux()
    ? {
        // 'argos-inmemory/linux-server': {
        //   args: [],
        //   descriptions: 'Argos built-in Linux system integration service (Linux only)',
        //   icons: '🐧',
        //   autoApprove: ['all'],
        //   type: 'inmemory' as MCPServerType,
        //   command: 'argos-inmemory/linux-server',
        //   env: {},
        //   disable: false
        // }
      }
    : {}),
};

// Extract inmemory type services as constants
const DEFAULT_INMEMORY_SERVERS: Record<string, Omit<MCPServerConfig, "enabled">> = {
  // buildInFileSystem has been removed - filesystem capabilities are now provided via Agent tools
  Artifacts: {
    args: [],
    descriptions: "Argos built-in artifacts MCP service",
    icons: "🎨",
    autoApprove: ["all"],
    type: "inmemory" as MCPServerType,
    command: "artifacts",
    env: {},
    disable: false,
  },
  bochaSearch: {
    args: [],
    descriptions: "Argos built-in Bocha search service",
    icons: "🔍",
    autoApprove: ["all"],
    type: "inmemory" as MCPServerType,
    command: "bochaSearch",
    env: {
      apiKey: "YOUR_BOCHA_API_KEY", // User needs to provide actual API Key
    },
    disable: false,
  },
  braveSearch: {
    args: [],
    descriptions: "Argos built-in Brave search service",
    icons: "🦁",
    autoApprove: ["all"],
    type: "inmemory" as MCPServerType,
    command: "braveSearch",
    env: {
      apiKey: "YOUR_BRAVE_API_KEY", // User needs to provide actual API Key
    },
    disable: false,
  },
  difyKnowledge: {
    args: [],
    descriptions: "Argos built-in Dify knowledge base search service",
    icons: "📚",
    autoApprove: ["all"],
    type: "inmemory" as MCPServerType,
    command: "difyKnowledge",
    env: {
      configs: [
        {
          description: "this is a description for the current knowledge base",
          apiKey: "YOUR_DIFY_API_KEY",
          datasetId: "YOUR_DATASET_ID",
          endpoint: "http://localhost:3000/v1",
        },
      ],
    },
    disable: false,
  },
  ragflowKnowledge: {
    args: [],
    descriptions: "Argos built-in RAGFlow knowledge base search service",
    icons: "📚",
    autoApprove: ["all"],
    type: "inmemory" as MCPServerType,
    command: "ragflowKnowledge",
    env: {
      configs: [
        {
          description: "Default RAGFlow knowledge base",
          apiKey: "YOUR_RAGFLOW_API_KEY",
          datasetIds: ["YOUR_DATASET_ID"],
          endpoint: "http://localhost:8000",
        },
      ],
    },
    disable: false,
  },
  fastGptKnowledge: {
    args: [],
    descriptions: "Argos built-in FastGPT knowledge base search service",
    icons: "📚",
    autoApprove: ["all"],
    type: "inmemory" as MCPServerType,
    command: "fastGptKnowledge",
    env: {
      configs: [
        {
          description: "this is a description for the current knowledge base",
          apiKey: "YOUR_FastGPT_API_KEY",
          datasetId: "YOUR_DATASET_ID",
          endpoint: "http://localhost:3000/api",
        },
      ],
    },
    disable: false,
  },
  builtinKnowledge: {
    args: [],
    descriptions: "Argos built-in knowledge base search service",
    icons: "📚",
    autoApprove: ["all"],
    type: "inmemory" as MCPServerType,
    command: "builtinKnowledge",
    env: {},
    disable: false,
  },
  "argos-inmemory/deep-research-server": {
    args: [],
    descriptions:
      "Argos built-in deep research service, uses Bocha search (this service requires a long-context model; do not use it with short-context models)",
    icons: "🔬",
    autoApprove: ["all"],
    type: "inmemory" as MCPServerType,
    command: "argos-inmemory/deep-research-server",
    env: {
      BOCHA_API_KEY: "YOUR_BOCHA_API_KEY",
    },
    disable: false,
  },
  "argos-inmemory/auto-prompting-server": {
    args: [],
    descriptions: "Argos built-in automatic template prompt service",
    icons: "📜",
    autoApprove: ["all"],
    type: "inmemory" as MCPServerType,
    command: "argos-inmemory/auto-prompting-server",
    env: {},
    disable: false,
  },
  "argos-inmemory/conversation-search-server": {
    args: [],
    descriptions: "Argos built-in conversation history search service",
    icons: "🔍",
    autoApprove: ["all"],
    type: "inmemory" as MCPServerType,
    command: "argos-inmemory/conversation-search-server",
    env: {},
    disable: false,
  },
  // Merge platform-specific services
  ...PLATFORM_SPECIFIC_SERVERS,
};

const DEFAULT_ENABLED_SERVER_NAMES = ["Artifacts", ...(isMacOS() ? ["argos/apple-server"] : [])];

const DEFAULT_MCP_SERVERS = {
  mcpServers: {
    // First define built-in MCP servers
    ...DEFAULT_INMEMORY_SERVERS,
    // Then default third-party MCP servers
    "nowledge-mem": {
      command: "",
      args: [],
      env: {},
      descriptions: "Nowledge Mem MCP",
      icons: "🧠",
      autoApprove: ["all"],
      disable: true,
      type: "http" as MCPServerType,
      baseUrl: "http://localhost:14242/mcp",
      customHeaders: {
        APP: "Argos",
      },
    },
  } satisfies Record<string, Omit<MCPServerConfig, "enabled">>,
  mcpEnabled: false, // MCP functionality is disabled by default
};
const BUILT_IN_SERVER_NAMES = new Set<string>(Object.keys(DEFAULT_MCP_SERVERS.mcpServers));
// This part of MCP has system logic to determine whether to enable, not controlled by user configuration, but by software environment
export const SYSTEM_INMEM_MCP_SERVERS: Record<string, MCPServerConfig> = {
  // custom-prompts-server has been removed, now provides prompt functionality through config data source
};

export class McpConfHelper {
  private mcpStore: StoreLike<IMcpSettings & Record<string, unknown>>;
  private isBuiltinKnowledgeSupported?: () => Promise<boolean>;
  private readonly onChange?: () => void;

  constructor(
    storeFactory?: StoreFactory,
    options?: { isBuiltinKnowledgeSupported?: () => Promise<boolean>; onChange?: () => void },
  ) {
    this.isBuiltinKnowledgeSupported = options?.isBuiltinKnowledgeSupported;
    this.onChange = options?.onChange;
    // Initialize MCP settings storage
    if (storeFactory) {
      this.mcpStore = storeFactory<IMcpSettings>({
        name: "mcp-settings",
        defaults: {
          mcpServers: this.buildDefaultServerConfigs(),
          mcpEnabled: DEFAULT_MCP_SERVERS.mcpEnabled,
          autoDetectNpmRegistry: true,
          npmRegistryCache: undefined,
          customNpmRegistry: undefined,
          removedBuiltInServers: [],
        },
      });
    } else {
      // Fallback: create a minimal in-memory store for backward compatibility
      const defaults: IMcpSettings = {
        mcpServers: this.buildDefaultServerConfigs(),
        mcpEnabled: DEFAULT_MCP_SERVERS.mcpEnabled,
        autoDetectNpmRegistry: true,
        npmRegistryCache: undefined,
        customNpmRegistry: undefined,
        removedBuiltInServers: [],
      };
      const data = { ...defaults } as IMcpSettings & Record<string, unknown>;
      this.mcpStore = {
        get: <T>(key: string, defaultValue?: T) => {
          const value = (data as Record<string, unknown>)[key];
          return (value === undefined ? defaultValue : value) as T;
        },
        set: (keyOrValues: string | Record<string, unknown>, value?: unknown) => {
          if (typeof keyOrValues === "string") {
            (data as Record<string, unknown>)[keyOrValues] = value;
          } else {
            Object.assign(data, keyOrValues);
          }
        },
        delete: (key: string) => {
          delete (data as Record<string, unknown>)[key];
        },
        has: (key: string) => key in (data as Record<string, unknown>),
        get store() {
          return data;
        },
      };
    }
  }

  setBuiltinKnowledgeSupported(fn: () => Promise<boolean>): void {
    this.isBuiltinKnowledgeSupported = fn;
  }

  getStoreForMigration(): StoreLike<Record<string, unknown>> {
    return this.mcpStore as StoreLike<Record<string, unknown>>;
  }

  setStore(store: StoreLike<IMcpSettings & Record<string, unknown>>): void {
    this.mcpStore = store;
  }

  private getDefaultEnabledServerNames(): string[] {
    return [...DEFAULT_ENABLED_SERVER_NAMES];
  }

  private buildDefaultServerConfigs(): Record<string, MCPServerConfig> {
    const enabledServers = new Set(this.getDefaultEnabledServerNames());

    return Object.fromEntries(
      Object.entries(DEFAULT_MCP_SERVERS.mcpServers).map(([name, config]) => [
        name,
        {
          ...this.cloneServerConfig(config as unknown as MCPServerConfig),
          enabled: enabledServers.has(name),
        },
      ]),
    );
  }

  private emitConfigChanged(_servers: Record<string, MCPServerConfig>): void {
    this.onChange?.();
  }

  private resolveLegacyEnabledServers(): Set<string> {
    const enabled = new Set<string>();
    const oldDefaultServer = this.mcpStore.get("defaultServer");
    const oldDefaultServersValue = this.mcpStore.get<string[]>("defaultServers", []);
    const oldDefaultServers = Array.isArray(oldDefaultServersValue) ? oldDefaultServersValue : [];

    if (typeof oldDefaultServer === "string" && oldDefaultServer.trim()) {
      enabled.add(oldDefaultServer.trim());
    }

    for (const serverName of oldDefaultServers) {
      if (typeof serverName === "string" && serverName.trim()) {
        enabled.add(serverName.trim());
      }
    }

    return enabled;
  }

  private normalizeServerConfig(
    serverName: string,
    config: MCPServerConfig,
    legacyEnabledServers: Set<string>,
    legacyKeysPresent: boolean,
    defaultEnabledServers: Set<string>,
  ): MCPServerConfig {
    return {
      ...this.cloneServerConfig(config),
      enabled:
        typeof config.enabled === "boolean"
          ? config.enabled
          : legacyKeysPresent
            ? legacyEnabledServers.has(serverName)
            : defaultEnabledServers.has(serverName),
    };
  }

  private removeDeprecatedBuiltInServers(
    servers: Record<string, MCPServerConfig> = {},
  ): Record<string, MCPServerConfig> {
    const deprecatedBuiltInServers = [
      "powerpack",
      "argos-inmemory/meeting-server",
      "imageServer",
      "argos/computer-use",
    ];
    let hasChanges = false;
    const removedBuiltInServers = new Set(this.getRemovedBuiltInServers());
    let removedListChanged = false;

    for (const serverName of deprecatedBuiltInServers) {
      if (servers[serverName]) {
        console.log(`Removing deprecated built-in MCP service: ${serverName}`);
        delete servers[serverName];
        hasChanges = true;
      }

      if (removedBuiltInServers.delete(serverName)) {
        removedListChanged = true;
      }
    }

    if (hasChanges) {
      this.mcpStore.set("mcpServers", servers);
    }

    if (removedListChanged) {
      this.setRemovedBuiltInServers(Array.from(removedBuiltInServers));
    }

    return servers;
  }

  private getRemovedBuiltInServers(): string[] {
    return this.mcpStore.get("removedBuiltInServers") || [];
  }

  private setRemovedBuiltInServers(servers: string[]): void {
    this.mcpStore.set("removedBuiltInServers", Array.from(new Set(servers)));
  }

  private isBuiltInServer(name: string): boolean {
    return BUILT_IN_SERVER_NAMES.has(name);
  }

  private markBuiltInServerRemoved(name: string): void {
    if (!this.isBuiltInServer(name)) return;
    const removed = new Set(this.getRemovedBuiltInServers());
    removed.add(name);
    this.setRemovedBuiltInServers(Array.from(removed));
  }

  private unmarkBuiltInServerRemoved(name: string): void {
    if (!this.isBuiltInServer(name)) return;
    const removed = this.getRemovedBuiltInServers().filter((server) => server !== name);
    this.setRemovedBuiltInServers(removed);
  }

  private cloneServerConfig(config: MCPServerConfig): MCPServerConfig {
    const cloneFn = (
      globalThis as typeof globalThis & {
        structuredClone?: (value: MCPServerConfig) => MCPServerConfig;
      }
    ).structuredClone;

    if (typeof cloneFn === "function") {
      return cloneFn(config);
    }

    return JSON.parse(JSON.stringify(config)) as MCPServerConfig;
  }

  migrateBuiltinKnowledgeConfigsFromEnv(existingConfigs: BuiltinKnowledgeConfig[]): BuiltinKnowledgeConfig[] {
    const mcpServers = this.mcpStore.get<Record<string, MCPServerConfig>>("mcpServers", {}) ?? {};
    const builtinKnowledge = mcpServers.builtinKnowledge;
    const rawEnv = builtinKnowledge?.env as unknown;

    if (!builtinKnowledge || rawEnv === undefined || rawEnv === null) {
      return existingConfigs;
    }

    let env: Record<string, unknown>;
    if (typeof rawEnv === "string") {
      try {
        env = JSON.parse(rawEnv) as Record<string, unknown>;
      } catch (error) {
        console.warn("Failed to parse builtinKnowledge env for migration:", error);
        return existingConfigs;
      }
    } else if (typeof rawEnv === "object") {
      env = rawEnv as Record<string, unknown>;
    } else {
      return existingConfigs;
    }

    if (!Object.prototype.hasOwnProperty.call(env, "configs")) {
      return existingConfigs;
    }

    const legacyConfigs = Array.isArray(env.configs)
      ? (env.configs.filter(
          (config): config is BuiltinKnowledgeConfig =>
            Boolean(config) && typeof config === "object" && typeof (config as { id?: unknown }).id === "string",
        ) as BuiltinKnowledgeConfig[])
      : [];
    const mergedConfigs = [...existingConfigs];
    const existingIds = new Set(existingConfigs.map((config) => config.id));

    for (const config of legacyConfigs) {
      if (!existingIds.has(config.id)) {
        mergedConfigs.push(config);
        existingIds.add(config.id);
      }
    }

    const migratedEnv = { ...env };
    delete migratedEnv.configs;
    mcpServers.builtinKnowledge = {
      ...builtinKnowledge,
      env: migratedEnv,
    };
    this.mcpStore.set("mcpServers", mcpServers);

    return mergedConfigs;
  }

  // Get MCP server configuration
  async getMcpServers(): Promise<Record<string, MCPServerConfig>> {
    const storedServers = this.removeDeprecatedBuiltInServers(
      this.mcpStore.get<Record<string, MCPServerConfig>>("mcpServers", this.buildDefaultServerConfigs()),
    );
    const legacyEnabledServers = this.resolveLegacyEnabledServers();
    const legacyKeysPresent =
      Boolean(this.mcpStore.has?.("defaultServer")) || Boolean(this.mcpStore.has?.("defaultServers"));
    const defaultEnabledServers = new Set(this.getDefaultEnabledServerNames());

    // Check and add missing inmemory services
    const updatedServers = Object.fromEntries(
      Object.entries(storedServers).map(([name, config]) => [
        name,
        this.normalizeServerConfig(name, config, legacyEnabledServers, legacyKeysPresent, defaultEnabledServers),
      ]),
    );
    const removedBuiltInServers = new Set(this.getRemovedBuiltInServers());
    let hasChanges =
      legacyEnabledServers.size > 0 ||
      legacyKeysPresent ||
      Boolean(this.mcpStore.get<Record<string, MCPServerConfig>>("mcpServers", {})?.powerpack);

    const ensureBuiltInServerExists = (serverName: string, serverConfig: Omit<MCPServerConfig, "enabled">): void => {
      if (removedBuiltInServers.has(serverName)) {
        return;
      }
      if (!updatedServers[serverName]) {
        console.log(`Adding missing built-in MCP service: ${serverName}`);
        updatedServers[serverName] = {
          ...this.cloneServerConfig(serverConfig as MCPServerConfig),
          enabled: defaultEnabledServers.has(serverName),
        };
        hasChanges = true;
      }
    };

    // Iterate all default inmemory services to ensure they exist
    // Note: buildInFileSystem is excluded as it's now provided via Agent tools
    for (const [serverName, serverConfig] of Object.entries(DEFAULT_INMEMORY_SERVERS)) {
      ensureBuiltInServerExists(serverName, serverConfig);
    }

    // Ensure services defined in DEFAULT_MCP_SERVERS exist
    for (const [serverName, serverConfig] of Object.entries(DEFAULT_MCP_SERVERS.mcpServers)) {
      ensureBuiltInServerExists(serverName, serverConfig);
    }

    // Remove services not supported on the current platform
    const serversToRemove: string[] = [];
    for (const [serverName, serverConfig] of Object.entries(updatedServers)) {
      if (serverConfig.type === "inmemory") {
        // Check if it's a platform-specific service
        if (serverName === "argos/apple-server" && !isMacOS()) {
          serversToRemove.push(serverName);
        }
        // Add checks for other platform-specific services here
        // if (serverName === 'argos-inmemory/windows-server' && !isWindows()) {
        //   serversToRemove.push(serverName)
        // }
        // if (serverName === 'argos-inmemory/linux-server' && !isLinux()) {
        //   serversToRemove.push(serverName)
        // }
      }
    }

    // Remove unsupported platform-specific services
    for (const serverName of serversToRemove) {
      console.log(`Removing service not supported on current platform: ${serverName}`);
      delete updatedServers[serverName];
      hasChanges = true;
    }

    // Remove incompatible services
    const builtinKnowledgeSupported = this.isBuiltinKnowledgeSupported
      ? await this.isBuiltinKnowledgeSupported()
      : false;
    if (!builtinKnowledgeSupported) {
      console.warn(
        "Built-in knowledge base service is not supported in current environment, removing related services",
      );
      delete updatedServers.builtinKnowledge;
      hasChanges = true;
    }

    // If changed, update the store
    if (
      hasChanges ||
      Object.keys(updatedServers).length !== Object.keys(storedServers).length ||
      Object.entries(updatedServers).some(
        ([serverName, config]) => storedServers[serverName]?.enabled !== config.enabled,
      )
    ) {
      this.mcpStore.set("mcpServers", updatedServers);
      this.mcpStore.delete("defaultServer");
      this.mcpStore.delete("defaultServers");
    }

    return Promise.resolve(updatedServers);
  }

  // Set MCP server config
  async setMcpServers(servers: Record<string, MCPServerConfig>): Promise<void> {
    this.mcpStore.set("mcpServers", servers);
    this.emitConfigChanged(servers);
  }

  async getEnabledMcpServers(): Promise<string[]> {
    const servers = await this.getMcpServers();
    return Object.entries(servers)
      .filter(([, config]) => config.enabled)
      .map(([name]) => name);
  }

  async setMcpServerEnabled(serverName: string, enabled: boolean): Promise<void> {
    const mcpServers = await this.getMcpServers();
    const server = mcpServers[serverName];
    if (!server) {
      throw new Error(`MCP server ${serverName} not found`);
    }
    if (server.enabled === enabled) {
      return;
    }
    mcpServers[serverName] = { ...server, enabled };
    await this.setMcpServers(mcpServers);
  }

  // Set MCP enabled state
  async setMcpEnabled(enabled: boolean): Promise<void> {
    this.mcpStore.set("mcpEnabled", enabled);
    this.emitConfigChanged(await this.getMcpServers());
  }

  // Get MCP enabled state
  getMcpEnabled(): Promise<boolean> {
    return Promise.resolve(this.mcpStore.get("mcpEnabled") ?? DEFAULT_MCP_SERVERS.mcpEnabled);
  }

  // Add MCP server
  async addMcpServer(name: string, config: MCPServerConfig): Promise<boolean> {
    const mcpServers = await this.getMcpServers();
    mcpServers[name] = this.normalizeServerConfig(
      name,
      config,
      new Set<string>(),
      false,
      new Set(this.getDefaultEnabledServerNames()),
    );
    if (this.isBuiltInServer(name)) {
      this.unmarkBuiltInServerRemoved(name);
    }
    await this.setMcpServers(mcpServers);
    return true;
  }

  // Get NPM Registry cache
  getNpmRegistryCache(): INpmRegistryCache | undefined {
    return this.mcpStore.get("npmRegistryCache");
  }

  // Set NPM Registry cache
  setNpmRegistryCache(cache: INpmRegistryCache): void {
    this.mcpStore.set("npmRegistryCache", cache);
  }

  // Check if cache is valid (within 24 hours)
  isNpmRegistryCacheValid(): boolean {
    const cache = this.getNpmRegistryCache();
    if (!cache) return false;
    const now = Date.now();
    const cacheAge = now - cache.lastChecked;
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    return cacheAge < CACHE_DURATION;
  }

  // Get effective NPM Registry (priority: custom > cache > default)
  getEffectiveNpmRegistry(): string | null {
    const customRegistry = this.getCustomNpmRegistry();
    if (customRegistry) {
      console.log(`[NPM Registry] Using custom registry: ${customRegistry}`);
      return customRegistry;
    }

    if (this.getAutoDetectNpmRegistry() && this.isNpmRegistryCacheValid()) {
      const cache = this.getNpmRegistryCache();
      if (cache?.registry) {
        console.log(`[NPM Registry] Using cached registry: ${cache.registry}`);
        return cache.registry;
      }
    }

    console.log("[NPM Registry] No effective registry found, will use default or detect");
    return null;
  }

  // Get custom NPM Registry
  getCustomNpmRegistry(): string | undefined {
    return this.mcpStore.get("customNpmRegistry");
  }

  // Normalize NPM Registry URL
  private normalizeNpmRegistryUrl(registry: string): string {
    let normalized = registry.trim();
    if (!normalized.endsWith("/")) {
      normalized += "/";
    }
    return normalized;
  }

  // Set custom NPM Registry
  setCustomNpmRegistry(registry: string | undefined): void {
    if (registry === undefined) {
      this.mcpStore.delete("customNpmRegistry");
    } else {
      const normalizedRegistry = this.normalizeNpmRegistryUrl(registry);
      this.mcpStore.set("customNpmRegistry", normalizedRegistry);
      console.log(`[NPM Registry] Normalized custom registry: ${registry} -> ${normalizedRegistry}`);
    }
  }

  // Get auto-detect NPM Registry setting
  getAutoDetectNpmRegistry(): boolean {
    return this.mcpStore.get("autoDetectNpmRegistry") ?? true;
  }

  // Set auto-detect NPM Registry
  setAutoDetectNpmRegistry(enabled: boolean): void {
    this.mcpStore.set("autoDetectNpmRegistry", enabled);
  }

  // Clear NPM Registry cache
  clearNpmRegistryCache(): void {
    this.mcpStore.delete("npmRegistryCache");
  }

  // Remove MCP server
  async removeMcpServer(name: string): Promise<void> {
    const mcpServers = await this.getMcpServers();
    delete mcpServers[name];
    if (this.isBuiltInServer(name)) {
      this.markBuiltInServerRemoved(name);
    }
    await this.setMcpServers(mcpServers);
  }

  // Update MCP server config
  async updateMcpServer(name: string, config: Partial<MCPServerConfig>): Promise<void> {
    const mcpServers = await this.getMcpServers();
    if (!mcpServers[name]) {
      throw new Error(`MCP server ${name} not found`);
    }
    mcpServers[name] = {
      ...mcpServers[name],
      ...config,
    };
    await this.setMcpServers(mcpServers);
  }

  /**
   * Batch import MCP servers from external source (like ModelScope)
   * @param servers - Array of MCP server configs to import
   * @param options - Import options
   * @returns Promise<{ imported: number; skipped: number; errors: string[] }>
   */
  async batchImportMcpServers(
    servers: Array<{
      name: string;
      description: string;
      package: string;
      version?: string;
      type?: MCPServerType;
      args?: string[];
      env?: Record<string, string>;
      enabled?: boolean;
      source?: string;
      [key: string]: unknown;
    }>,
    options: {
      skipExisting?: boolean;
      enableByDefault?: boolean;
      overwriteExisting?: boolean;
    } = {},
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const { skipExisting = true, enableByDefault = false, overwriteExisting = false } = options;
    const result = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    const existingServers = await this.getMcpServers();

    for (const serverConfig of servers) {
      try {
        // Generate unique server name based on package name
        const serverName = this.generateUniqueServerName(serverConfig.package, existingServers);
        const existingServer = existingServers[serverName];

        // Check if server already exists
        if (existingServer && !overwriteExisting) {
          if (skipExisting) {
            console.log(`Skipping existing MCP server: ${serverName}`);
            result.skipped++;
            continue;
          } else {
            result.errors.push(`Server ${serverName} already exists`);
            continue;
          }
        }

        // Create MCP server config
        const mcpConfig: ExtendedMCPServerConfig = {
          name: serverConfig.name,
          description: serverConfig.description,
          args: serverConfig.args || [],
          env: serverConfig.env || {},
          enabled: serverConfig.enabled ?? enableByDefault,
          type: (serverConfig.type as MCPServerType) || "stdio",
          package: serverConfig.package,
          version: serverConfig.version || "latest",
          source: serverConfig.source as string | undefined,
          logo_url: serverConfig.logo_url as string | undefined,
          publisher: serverConfig.publisher as string | undefined,
          tags: serverConfig.tags as string[] | undefined,
          view_count: serverConfig.view_count as number | undefined,
        };

        // Add or update the server
        const success = await this.addMcpServer(serverName, mcpConfig as unknown as MCPServerConfig);
        if (success || overwriteExisting) {
          if (existingServer && overwriteExisting) {
            await this.updateMcpServer(serverName, mcpConfig as unknown as Partial<MCPServerConfig>);
            console.log(`Updated MCP server: ${serverName}`);
          } else {
            console.log(`Imported MCP server: ${serverName}`);
          }
          result.imported++;
        } else {
          result.errors.push(`Failed to import server: ${serverName}`);
        }
      } catch (error) {
        const errorMsg = `Error importing server ${serverConfig.name}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    console.log(
      `MCP batch import completed. Imported: ${result.imported}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`,
    );

    // Notify host that the import changed config
    this.onChange?.();

    return result;
  }

  /**
   * Generate a unique server name based on package name
   * @param packageName - The package name to base the server name on
   * @param existingServers - Existing servers to check against
   * @returns Unique server name
   */
  private generateUniqueServerName(packageName: string, existingServers: Record<string, MCPServerConfig>): string {
    // Clean up package name to create a suitable server name
    let baseName = packageName
      .replace(/[#/]/g, "-")
      .replace(/[^a-zA-Z0-9-_]/g, "")
      .toLowerCase();

    // If the base name doesn't exist, use it directly
    if (!existingServers[baseName]) {
      return baseName;
    }

    // If it exists, append a number suffix
    let counter = 1;
    let uniqueName = `${baseName}-${counter}`;
    while (existingServers[uniqueName]) {
      counter++;
      uniqueName = `${baseName}-${counter}`;
    }

    return uniqueName;
  }

  /**
   * Check if a server with given package already exists
   * @param packageName - Package name to check
   * @returns Promise<string | null> - Returns server name if exists, null otherwise
   */
  async findServerByPackage(packageName: string): Promise<string | null> {
    const servers = await this.getMcpServers();

    for (const [serverName, config] of Object.entries(servers)) {
      const extendedConfig = config as unknown as ExtendedMCPServerConfig;
      if (extendedConfig.package === packageName) {
        return serverName;
      }
    }

    return null;
  }

  public onUpgrade(oldVersion: string | undefined): void {
    console.log("onUpgrade", oldVersion);

    // Migrate filesystem/buildInFileSystem servers - these are now provided via Agent tools
    // Remove for all versions < 0.6.0
    if (oldVersion && compare(oldVersion, "0.6.0", "<")) {
      try {
        const mcpServers = this.mcpStore.get<Record<string, MCPServerConfig>>("mcpServers", {}) ?? {};
        let hasChanges = false;

        // Check if servers exist before deletion (for tracking)
        const hadFilesystem = !!mcpServers.filesystem;
        const hadBuildInFileSystem = !!mcpServers.buildInFileSystem;

        // Remove old filesystem server
        if (mcpServers.filesystem) {
          console.log("Removing old filesystem MCP server (now provided via Agent tools)");
          delete mcpServers.filesystem;
          hasChanges = true;
        }

        // Remove buildInFileSystem server
        if (mcpServers.buildInFileSystem) {
          console.log("Removing buildInFileSystem MCP server (now provided via Agent tools)");
          delete mcpServers.buildInFileSystem;
          hasChanges = true;
        }

        // Mark as removed for tracking
        if (hadFilesystem || hadBuildInFileSystem) {
          this.markBuiltInServerRemoved("buildInFileSystem");
        }

        if (hasChanges) {
          this.mcpStore.set("mcpServers", mcpServers);
          console.log("Migration: filesystem MCP servers removed (now available via Agent tools)");
        }
      } catch (error) {
        console.error("Error occurred while migrating filesystem server:", error);
      }
    }

    // Remove custom-prompts-server service (version < 0.3.5)
    if (oldVersion && compare(oldVersion, "0.3.5", "<")) {
      try {
        const mcpServers = this.mcpStore.get<Record<string, MCPServerConfig>>("mcpServers", {}) ?? {};
        const customPromptsServerName = "argos-inmemory/custom-prompts-server";

        if (mcpServers[customPromptsServerName]) {
          console.log("Detected old version custom-prompts-server, starting removal");
          delete mcpServers[customPromptsServerName];
          this.mcpStore.set("mcpServers", mcpServers);

          console.log("Removal of custom-prompts-server completed");
        }
      } catch (error) {
        console.error("Error occurred while removing custom-prompts-server:", error);
      }
    }

    try {
      this.removeDeprecatedBuiltInServers(this.mcpStore.get<Record<string, MCPServerConfig>>("mcpServers", {}));
    } catch (error) {
      console.error("Error occurred while removing deprecated built-in MCP servers:", error);
    }

    // Check and add platform-specific services after upgrade
    try {
      const mcpServers = this.mcpStore.get<Record<string, MCPServerConfig>>("mcpServers", {}) ?? {};
      const removedBuiltInServers = new Set(this.getRemovedBuiltInServers());
      let hasChanges = false;

      // Check whether to add platform-specific services
      if (isMacOS() && !mcpServers["argos/apple-server"] && !removedBuiltInServers.has("argos/apple-server")) {
        console.log("Detected macOS platform, adding Apple system integration service");
        mcpServers["argos/apple-server"] = {
          ...(PLATFORM_SPECIFIC_SERVERS["argos/apple-server"] as MCPServerConfig),
          enabled: true,
        };
        hasChanges = true;
      }

      // Remove services not supported on the current platform
      const serversToRemove: string[] = [];
      for (const [serverName] of Object.entries(mcpServers)) {
        if (serverName === "argos/apple-server" && !isMacOS()) {
          serversToRemove.push(serverName);
        }
        // Add checks for other platform-specific services here
      }

      for (const serverName of serversToRemove) {
        console.log(`Removing service not supported on current platform: ${serverName}`);
        delete mcpServers[serverName];
        hasChanges = true;
      }

      if (hasChanges) {
        this.mcpStore.set("mcpServers", mcpServers);
        console.log("Platform-specific service upgrade completed");
      }
    } catch (error) {
      console.error("Error occurred while upgrading platform-specific services:", error);
    }

    this.mcpStore.delete("defaultServer");
    this.mcpStore.delete("defaultServers");
  }
}
