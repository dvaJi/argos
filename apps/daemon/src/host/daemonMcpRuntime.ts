import { ServerManager, ToolManager, formatToolCallContent, type McpHostPorts } from "@argos/mcp-runtime";
import type { MCPServerConfig, MCPToolDefinition, McpClient } from "@argos/shared/presenter";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";

/**
 * Daemon MCP runtime facade. Owns the shared `ServerManager` + `ToolManager`
 * and exposes the runtime operations backing the daemon's `mcp.*` runtime
 * routes (start/stop/callTool/tools/resources/prompts).
 */
export class DaemonMcpRuntime {
  readonly serverManager: ServerManager;
  readonly toolManager: ToolManager;
  private readonly configPresenter: DaemonConfigPresenter;

  constructor(configPresenter: DaemonConfigPresenter, ports: McpHostPorts) {
    this.configPresenter = configPresenter;
    this.serverManager = new ServerManager(configPresenter as never, ports);
    this.toolManager = new ToolManager(configPresenter as never, this.serverManager, ports);
  }

  async startServer(serverName: string) {
    await this.serverManager.startServer(serverName);
  }

  async startEnabledServers(): Promise<{ started: string[]; failed: Array<{ serverName: string; error: string }> }> {
    if (!(await this.configPresenter.getMcpEnabled())) return { started: [], failed: [] };

    const servers = (await this.configPresenter.getMcpServers()) as Record<string, MCPServerConfig>;
    const candidates = Object.entries(servers).filter(
      ([, config]) => config.enabled && !config.ownerPluginId && config.source !== "plugin",
    );
    const started: string[] = [];
    const failed: Array<{ serverName: string; error: string }> = [];

    await Promise.all(
      candidates.map(async ([serverName]) => {
        try {
          await this.startServer(serverName);
          started.push(serverName);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failed.push({ serverName, error: message });
          console.error(`[MCP] Failed to auto-start ${serverName}:`, error);
        }
      }),
    );

    return { started, failed };
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

  async refreshNpmRegistry(): Promise<string> {
    return await this.serverManager.refreshNpmRegistry();
  }

  async getClients(): Promise<McpClient[]> {
    const enabled = await this.configPresenter.getMcpEnabled();
    const servers = (await this.configPresenter.getMcpServers()) as Record<string, MCPServerConfig>;
    const clients = (await this.toolManager.getRunningClients()).filter(
      (client) =>
        enabled ||
        Boolean(
          servers[client.serverName]?.ownerPluginId ||
          (servers[client.serverName]?.source === "plugin" && servers[client.serverName]?.sourceId),
        ),
    );

    return await Promise.all(
      clients.map(async (client) => {
        const tools = await client.listTools();
        const toolDefinitions: MCPToolDefinition[] = (tools ?? []).map((tool) => {
          const properties = Object.fromEntries(
            Object.entries(tool.inputSchema.properties ?? {}).map(([name, property]) => {
              const normalizedProperty =
                property && typeof property === "object" ? { ...(property as Record<string, unknown>) } : property;
              if (
                normalizedProperty &&
                typeof normalizedProperty === "object" &&
                !("description" in normalizedProperty)
              ) {
                normalizedProperty.description = `Params of ${name}`;
              }
              return [name, normalizedProperty];
            }),
          );

          return {
            type: "function",
            function: {
              name: tool.name,
              description: tool.description ?? "",
              parameters: {
                type: "object",
                properties,
                required: Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required : [],
              },
            },
            server: {
              name: client.serverName,
              icons: String(client.serverConfig.icons ?? ""),
              description: String(client.serverConfig.description ?? client.serverConfig.descriptions ?? ""),
            },
          };
        });

        const summary: McpClient = {
          name: client.serverName,
          icon: String(client.serverConfig.icons ?? ""),
          isRunning: client.isServerRunning(),
          tools: toolDefinitions,
        };

        if (typeof client.listPrompts === "function") {
          const prompts = await client.listPrompts().catch(() => []);
          if (prompts?.length) {
            summary.prompts = prompts.map((prompt) => ({
              id: prompt.name,
              name: prompt.name,
              content: prompt.description ?? "",
              description: prompt.description ?? "",
              arguments: prompt.arguments ?? [],
              client: {
                name: client.serverName,
                icon: String(client.serverConfig.icons ?? ""),
              },
            }));
          }
        }

        if (typeof client.listResources === "function") {
          const resources = await client.listResources().catch(() => []);
          if (resources?.length) {
            summary.resources = resources;
          }
        }

        return summary;
      }),
    );
  }

  async callTool(request: unknown) {
    const result = await this.toolManager.callTool(request as never, undefined as never);
    // Adapt to the mcp.callTool route contract: flatten content to a string and
    // keep the raw response in rawData (mirrors the desktop McpPresenter).
    return {
      content: formatToolCallContent(result),
      rawData: { ...result } as never,
    };
  }

  /** Execute after the Pi/Argos permission gate has approved this call. */
  async callApprovedTool(request: unknown) {
    const toolCall = request as Parameters<ToolManager["callTool"]>[0];
    const permission = await this.toolManager.preCheckToolPermission(toolCall);
    if (permission) {
      await this.toolManager.grantPermission(
        permission.serverName,
        permission.permissionType === "command" ? "all" : permission.permissionType,
        false,
        toolCall.conversationId,
      );
    }
    const result = await this.toolManager.callTool(toolCall);
    return {
      content: formatToolCallContent(result),
      rawData: { ...result } as never,
    };
  }

  async listPrompts() {
    const enabled = await this.configPresenter.getMcpEnabled();
    const servers = await this.configPresenter.getMcpServers();
    const clients = (await this.toolManager.getRunningClients()).filter(
      (client) => enabled || Boolean(servers[client.serverName]?.ownerPluginId || servers[client.serverName]?.sourceId),
    );

    const prompts: Array<Record<string, unknown> & { client: { name: string; icon: string } }> = [];
    for (const client of clients) {
      if (typeof client.listPrompts !== "function") continue;
      const clientPrompts = await client.listPrompts().catch(() => []);
      for (const prompt of clientPrompts ?? []) {
        prompts.push({
          id: prompt.name,
          name: prompt.name,
          description: prompt.description || "",
          arguments: prompt.arguments || [],
          files: prompt.files || [],
          client: {
            name: client.serverName,
            icon: client.serverConfig["icons"] as string,
          },
        });
      }
    }
    return prompts;
  }

  async getPrompt(prompt: unknown, args?: Record<string, unknown>) {
    const typedPrompt = prompt as { name: string; client: { name: string } };
    const enabled = await this.configPresenter.getMcpEnabled();
    const servers = await this.configPresenter.getMcpServers();
    if (!enabled && !(servers[typedPrompt.client.name]?.ownerPluginId || servers[typedPrompt.client.name]?.sourceId)) {
      throw new Error("MCP functionality is disabled");
    }
    if (typedPrompt.client.name === "argos/custom-prompts-server") {
      const customPrompts = await this.configPresenter.getCustomPrompts();
      const foundPrompt = customPrompts?.find((entry: any) => entry.name === typedPrompt.name);
      if (!foundPrompt) throw new Error(`Custom prompt "${typedPrompt.name}" not found`);
      return {
        name: foundPrompt.name,
        description: foundPrompt.description,
        content: foundPrompt.content || "",
        messages: foundPrompt.messages || [],
        arguments: foundPrompt.parameters || [],
      };
    }
    return this.toolManager.getPromptByClient(typedPrompt.client.name, typedPrompt.name, args);
  }

  async listResources() {
    const enabled = await this.configPresenter.getMcpEnabled();
    const servers = await this.configPresenter.getMcpServers();
    const clients = (await this.toolManager.getRunningClients()).filter(
      (client) => enabled || Boolean(servers[client.serverName]?.ownerPluginId || servers[client.serverName]?.sourceId),
    );

    const resources: Array<Record<string, unknown> & { client: { name: string; icon: string } }> = [];
    for (const client of clients) {
      if (typeof client.listResources !== "function") continue;
      const clientResources = await client.listResources().catch(() => []);
      for (const resource of clientResources ?? []) {
        resources.push({
          ...resource,
          client: {
            name: client.serverName,
            icon: client.serverConfig["icons"] as string,
          },
        });
      }
    }
    return resources;
  }

  async readResource(resource: unknown) {
    const typedResource = resource as { client: { name: string }; uri: string };
    const enabled = await this.configPresenter.getMcpEnabled();
    const servers = await this.configPresenter.getMcpServers();
    if (
      !enabled &&
      !(servers[typedResource.client.name]?.ownerPluginId || servers[typedResource.client.name]?.sourceId)
    ) {
      throw new Error("MCP functionality is disabled");
    }
    return this.toolManager.readResourceByClient(typedResource.client.name, typedResource.uri);
  }
}
