import type { MCPServerConfig } from "@argos/shared/presenter";
import type { PluginOwnedServerRegistration, PluginRuntimeStartReason } from "@argos/backend-core";

/** Paths the MCP runtime needs (replaces `app.getPath`/`app.getVersion`). */
export interface McpPathsPort {
  homeDir(): string;
  appVersion(): string;
}

/**
 * Resolves bundled runtime commands (node/uv/npx) for spawned MCP servers.
 * Replaces the Electron-coupled `RuntimeHelper` singleton.
 */
export interface McpRuntimePort {
  initializeRuntimes(): void;
  expandPath(target: string): string;
  processCommandWithArgs(command: string, args: string[]): { command: string; args: string[] };
  normalizePathEnv(paths: string[]): { key: string; value: string };
  getDefaultPaths(homeDir?: string): string[];
  getBunRuntimePath(): string | null;
  getUvRuntimePath(): string | null;
  setBunRuntimePath(path: string | null): void;
  setUvRuntimePath(path: string | null): void;
}

/** Event broadcast + subscription (replaces `eventBus`). */
export interface McpEventPort {
  broadcast(channel: string, payload: unknown): void;
  broadcastError(channel: string, payload: unknown): void;
  subscribe(channel: string, handler: (payload: unknown) => void): () => void;
}

/** Outbound proxy resolution (replaces `#/presenter/proxyConfig`). */
export interface McpProxyPort {
  getProxyUrl(): string | null;
}

/**
 * Plugin-owned MCP runtime supervision (on-demand start, integrity launch
 * guards, static tool catalogs). Optional — hosts without plugin runtimes
 * simply omit it.
 */
export interface McpPluginRuntimePort {
  ensureRunning(serverName: string, reason: PluginRuntimeStartReason): Promise<void>;
  ownsServer(serverName: string): boolean;
  isServerAvailable(serverName: string): boolean;
  getOwnerPluginId(serverName: string): string | undefined;
  getRegistration(serverName: string): PluginOwnedServerRegistration | undefined;
  getAvailableToolCatalogs(): PluginOwnedServerRegistration[];
}

/**
 * Host-specific service hooks. All optional — the runtime degrades gracefully
 * when a host cannot provide them (for example, when a host has no sampling
 * UI or no in-memory knowledge servers).
 */
export interface McpHostServices {
  /** MCP server requests LLM sampling; host resolves via UI + provider. */
  handleSamplingRequest?(payload: unknown): Promise<unknown>;
  cancelSamplingRequest?(requestId: string, reason?: string): Promise<void>;
  generateCompletionStandalone?(...args: unknown[]): Promise<string>;
  getProviderModels?(providerId: string): unknown[];
  getCustomModels?(providerId: string): unknown[];
  /** Plugin tool-permission policy (desktop or daemon plugin host). */
  getPluginToolPolicy?(serverId: string, toolName: string): unknown;
  /** Plugin runtime supervision port (on-demand starts + tool catalogs). */
  pluginRuntime?: McpPluginRuntimePort;
  /** ACP context for per-agent MCP gating. */
  getSession?(conversationId: string): unknown;
  getAcpAgents?(): Promise<unknown[]>;
  getAgentMcpSelections?(agentId: string): Promise<string[]>;
  /** In-memory MCP servers supplied by the host. */
  getInMemoryServer?(
    name: string,
    args: string[],
    env: Record<string, string>,
  ): { startServer(transport: unknown): unknown } | null;
  /** MCP servers map (source of truth, from config). */
  getMcpServers(): Promise<Record<string, MCPServerConfig>>;
}

export interface McpHostPorts {
  paths: McpPathsPort;
  runtime: McpRuntimePort;
  events: McpEventPort;
  proxy: McpProxyPort;
  services: McpHostServices;
}
