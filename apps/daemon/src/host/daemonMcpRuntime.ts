import { ServerManager, ToolManager, type McpHostPorts } from "@argos/mcp-runtime";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";

/**
 * Daemon MCP runtime facade. Owns the shared `ServerManager` + `ToolManager`
 * and exposes the runtime operations backing the daemon's `mcp.*` runtime
 * routes (start/stop/callTool/tools/resources/prompts).
 */
export class DaemonMcpRuntime {
  readonly serverManager: ServerManager;
  readonly toolManager: ToolManager;

  constructor(configPresenter: DaemonConfigPresenter, ports: McpHostPorts) {
    this.serverManager = new ServerManager(configPresenter as never, ports);
    this.toolManager = new ToolManager(configPresenter as never, this.serverManager, ports);
  }

  async startServer(serverName: string) {
    await this.serverManager.startServer(serverName);
  }

  async stopServer(serverName: string) {
    await this.serverManager.stopServer(serverName);
  }

  isServerRunning(serverName: string) {
    return this.serverManager.isServerRunning(serverName);
  }

  async listToolDefinitions(enabledMcpTools?: string[]) {
    return this.toolManager.getAllToolDefinitions(enabledMcpTools);
  }

  async getClients() {
    return this.toolManager.getRunningClients();
  }

  async callTool(request: unknown) {
    return this.toolManager.callTool(request as never, undefined as never);
  }

  async listPrompts() {
    return this.toolManager.getAllPrompts();
  }

  async getPrompt(prompt: unknown, args?: Record<string, unknown>) {
    return this.toolManager.getPrompt(prompt as never, args);
  }

  async listResources() {
    return this.toolManager.getAllResources();
  }

  async readResource(resource: unknown) {
    return this.toolManager.readResource(resource as never);
  }
}
