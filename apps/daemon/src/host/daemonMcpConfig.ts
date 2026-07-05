import { McpConfHelper, McpRouterManager } from "@argos/mcp-runtime";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import { createJsonStoreFactory } from "./jsonStoreFactory";

/**
 * Daemon MCP configuration facade. Owns the shared `McpConfHelper` (JSON store)
 * and `McpRouterManager` (pure fetch). Exposes the config/CRUD + mcprouter +
 * npm-registry surface used by the daemon's `mcp.*` routes.
 *
 * Runtime routes (startServer/callTool/resources/prompts/sampling) are served by
 * a future runtime slice; this facade covers config only.
 */
export class DaemonMcpConfig {
  readonly mcpConfHelper: McpConfHelper;
  private readonly mcprouterManager: McpRouterManager;

  constructor(configDir: string, configPresenter: DaemonConfigPresenter) {
    this.mcpConfHelper = new McpConfHelper(createJsonStoreFactory(configDir));
    this.mcprouterManager = new McpRouterManager(configPresenter as never);
  }

  // ---- server CRUD ----
  async getMcpServers() {
    return this.mcpConfHelper.getMcpServers();
  }
  async getEnabledMcpServers() {
    return this.mcpConfHelper.getEnabledMcpServers();
  }
  async addMcpServer(name: string, config: never) {
    return this.mcpConfHelper.addMcpServer(name, config);
  }
  async updateMcpServer(name: string, config: never) {
    return this.mcpConfHelper.updateMcpServer(name, config);
  }
  async removeMcpServer(name: string) {
    return this.mcpConfHelper.removeMcpServer(name);
  }
  async setMcpServerEnabled(name: string, enabled: boolean) {
    return this.mcpConfHelper.setMcpServerEnabled(name, enabled);
  }
  getMcpEnabled() {
    return this.mcpConfHelper.getMcpEnabled();
  }
  async setMcpEnabled(enabled: boolean) {
    return this.mcpConfHelper.setMcpEnabled(enabled);
  }

  // ---- npm registry ----
  getNpmRegistryCache() {
    return this.mcpConfHelper.getNpmRegistryCache();
  }
  setNpmRegistryCache(cache: unknown) {
    return this.mcpConfHelper.setNpmRegistryCache(cache as never);
  }
  getCustomNpmRegistry() {
    return this.mcpConfHelper.getCustomNpmRegistry();
  }
  setCustomNpmRegistry(registry: string) {
    return this.mcpConfHelper.setCustomNpmRegistry(registry);
  }
  getAutoDetectNpmRegistry() {
    return this.mcpConfHelper.getAutoDetectNpmRegistry();
  }
  setAutoDetectNpmRegistry(enabled: boolean) {
    return this.mcpConfHelper.setAutoDetectNpmRegistry(enabled);
  }
  clearNpmRegistryCache() {
    return this.mcpConfHelper.clearNpmRegistryCache();
  }
  getEffectiveNpmRegistry() {
    return this.mcpConfHelper.getEffectiveNpmRegistry();
  }

  // ---- mcprouter (apiKey is read/written on the config store directly) ----
  async listMcpRouterServers(page: number, limit: number) {
    return this.mcprouterManager.listServers(page, limit);
  }
  async installMcpRouterServer(serverKey: string) {
    return this.mcprouterManager.installServer(serverKey);
  }
}
