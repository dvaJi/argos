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
    // Treat the built-in knowledge server as supported so getMcpServers returns
    // the full default set; the headless init below marks every built-in as
    // user-removed so the daemon ships with an empty MCP catalog by default.
    this.mcpConfHelper = new McpConfHelper(createJsonStoreFactory(configDir), {
      isBuiltinKnowledgeSupported: () => Promise.resolve(true),
    });
    this.mcprouterManager = new McpRouterManager(configPresenter as never);
  }

  /**
   * Seed built-in MCP servers (same as desktop). The daemon now exposes the full
   * built-in catalog — most disabled by default, started on-demand only (the
   * daemon never auto-starts servers at construction, so there's no startup risk
   * from missing command binaries). Earlier daemon versions marked every
   * built-in as user-removed; clear that removal list so `McpConfHelper`
   * re-exposes the built-ins. Idempotent.
   */
  async initializeHeadlessDefaults(): Promise<void> {
    try {
      const store = this.mcpConfHelper.getStoreForMigration();
      const existingRemoved = new Set<string>((store.get("removedBuiltInServers") as string[]) ?? []);
      if (existingRemoved.size === 0) return;
      store.set("removedBuiltInServers", []);
    } catch (error) {
      console.warn("[daemon] Failed to restore MCP built-in defaults:", error);
    }
  }

  // ---- server CRUD ----
  async getMcpServers() {
    return this.mcpConfHelper.getMcpServers();
  }
  async getEnabledMcpServers() {
    return this.mcpConfHelper.getEnabledMcpServers();
  }
  async addMcpServer(name: string, config: unknown) {
    return this.mcpConfHelper.addMcpServer(name, config as never);
  }
  async updateMcpServer(name: string, config: unknown) {
    return this.mcpConfHelper.updateMcpServer(name, config as never);
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
  async setMcpEnabled(enabled: boolean): Promise<void> {
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
    return this.mcpConfHelper.getCustomNpmRegistry() ?? null;
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
    const data = await this.mcprouterManager.listServers(page, limit);
    return data?.servers ?? [];
  }
  async installMcpRouterServer(serverKey: string) {
    return this.mcprouterManager.installServer(serverKey);
  }
}
