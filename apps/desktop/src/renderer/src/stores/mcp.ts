import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createMcpClient } from "@api/McpClient";
import { createConfigClient } from "../../api/ConfigClient";
import type {
  McpClient as McpRuntimeClient,
  MCPServerConfig,
  MCPToolDefinition,
  PromptListEntry,
  Resource,
  ResourceListEntry,
  Prompt,
} from "@shared/presenter";

const ENABLED_MCP_TOOLS_KEY = "input_enabledMcpTools";

const mcpClient = createMcpClient();
const configClient = createConfigClient();

interface McpState {
  config: {
    mcpServers: Record<string, MCPServerConfig>;
    mcpEnabled: boolean;
    ready: boolean;
  };
  mcpInstallCache: string | null;
  serverStatuses: Record<string, boolean>;
  serverLoadingStates: Record<string, boolean>;
  configLoading: boolean;
  toolLoadingStates: Record<string, boolean>;
  toolInputs: Record<string, Record<string, string>>;
  toolResults: Record<string, string | { type: string; text: string }[]>;
  enabledToolNames: string[];
  tools: MCPToolDefinition[];
  toolsLoading: boolean;
  toolsError: boolean;
  toolsErrorMessage: string;
  clients: McpRuntimeClient[];
  resources: ResourceListEntry[];
  prompts: PromptListEntry[];
}

export const mcpStore = new Store<McpState>({
  config: {
    mcpServers: {},
    mcpEnabled: false,
    ready: false,
  },
  mcpInstallCache: null,
  serverStatuses: {},
  serverLoadingStates: {},
  configLoading: false,
  toolLoadingStates: {},
  toolInputs: {},
  toolResults: {},
  enabledToolNames: [],
  tools: [],
  toolsLoading: false,
  toolsError: false,
  toolsErrorMessage: "",
  clients: [],
  resources: [],
  prompts: [],
});

const normalizeEnabledToolNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
};

const hasSameToolList = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
};

const persistEnabledToolNames = async (names: string[]) => {
  try {
    await configClient.setSetting(ENABLED_MCP_TOOLS_KEY, [...names]);
  } catch (error) {
    console.warn("Failed to persist enabled MCP tools:", error);
  }
};

const setEnabledToolNames = async (names: string[], persist = true): Promise<void> => {
  const normalized = normalizeEnabledToolNames(names);
  if (hasSameToolList(mcpStore.state.enabledToolNames, normalized)) return;
  mcpStore.setState((s) => ({ ...s, enabledToolNames: normalized }));
  if (persist) await persistEnabledToolNames(normalized);
};

const loadEnabledToolNames = async () => {
  try {
    const stored = await configClient.getSetting(ENABLED_MCP_TOOLS_KEY);
    await setEnabledToolNames(normalizeEnabledToolNames(stored), false);
  } catch (error) {
    console.warn("Failed to load enabled MCP tools:", error);
    mcpStore.setState((s) => ({ ...s, enabledToolNames: [] }));
  }
};

const isPluginOwnedServerConfig = (serverConfig?: Partial<MCPServerConfig> | null): boolean =>
  Boolean(serverConfig?.ownerPluginId || serverConfig?.source === "plugin");

export const isPluginOwnedServerName = (serverName?: string | null): boolean => {
  if (!serverName) return false;
  return isPluginOwnedServerConfig(mcpStore.state.config.mcpServers?.[serverName]);
};

export const isVisibleServerName = (serverName?: string | null): boolean => !isPluginOwnedServerName(serverName);

const loadCustomPromptsData = async (): Promise<PromptListEntry[]> => {
  try {
    const configPrompts: Prompt[] = await configClient.getCustomPrompts();
    return configPrompts.map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.parameters || [],
      files: prompt.files || [],
      client: { name: "argos/custom-prompts-server", icon: "⚙️" },
    }));
  } catch (error) {
    console.warn("Failed to load custom prompts from config:", error);
    return [];
  }
};

const loadMcpPromptsData = async (): Promise<PromptListEntry[]> => {
  try {
    return await mcpClient.getAllPrompts();
  } catch (error) {
    console.warn("Failed to load MCP prompts:", error);
    return [];
  }
};

const applyToolsSnapshot = (toolDefs: MCPToolDefinition[] = []) => {
  const nextInputs = { ...mcpStore.state.toolInputs };
  toolDefs.forEach((tool) => {
    if (!nextInputs[tool.function.name]) {
      nextInputs[tool.function.name] = {};
      if (tool.function.parameters?.properties) {
        Object.keys(tool.function.parameters.properties).forEach((paramName) => {
          nextInputs[tool.function.name][paramName] = "";
        });
      }
      if (tool.function.name === "glob_search") {
        nextInputs[tool.function.name] = {
          pattern: "**/*.md",
          root: "",
          excludePatterns: "",
          maxResults: "1000",
          sortBy: "name",
        };
      }
    }
  });
  mcpStore.setState((s) => ({ ...s, toolInputs: nextInputs }));
};

const syncEnabledToolsWithDefinitions = async (toolDefs: MCPToolDefinition[] = []) => {
  const allToolNames = toolDefs.map((tool) => tool.function.name);
  const availableSet = new Set(allToolNames);
  const filtered = mcpStore.state.enabledToolNames.filter(availableSet.has);
  const next = filtered.length > 0 || allToolNames.length === 0 ? filtered : allToolNames;
  await setEnabledToolNames(next);
};

const syncConfigFromQuery = (data?: { mcpServers: Record<string, MCPServerConfig>; mcpEnabled: boolean } | null) => {
  if (!data) return;

  const previousMcpEnabled = mcpStore.state.config.mcpEnabled;
  const previousReady = mcpStore.state.config.ready;
  const mcpEnabledChanged = previousMcpEnabled !== data.mcpEnabled;

  if (mcpEnabledChanged) {
    console.log(`MCP enabled state changing from ${previousMcpEnabled} to ${data.mcpEnabled}`);
  }

  mcpStore.setState((s) => ({
    ...s,
    config: {
      mcpServers: data.mcpServers ?? {},
      mcpEnabled: data.mcpEnabled,
      ready: true,
    },
  }));

  if (previousReady && mcpEnabledChanged) {
    if (data.mcpEnabled) {
      Promise.all([loadTools(), loadClients(), loadPrompts()]).catch((error) => {
        console.error("Failed to refresh MCP queries after enabling:", error);
      });
    } else {
      mcpStore.setState((s) => ({
        ...s,
        serverStatuses: {},
        toolInputs: {},
        toolResults: {},
        tools: [],
        clients: [],
        resources: [],
        prompts: [],
      }));
      Promise.all([loadTools(), loadClients(), loadResources(), loadPrompts()]).catch((error) => {
        console.error("Failed to refresh MCP queries after disabling:", error);
      });
    }
  }
};

export const loadConfig = async () => {
  mcpStore.setState((s) => ({ ...s, configLoading: true }));
  try {
    const [servers, enabled] = await Promise.all([mcpClient.getMcpServers(), mcpClient.getMcpEnabled()]);
    syncConfigFromQuery({
      mcpServers: servers ?? {},
      mcpEnabled: Boolean(enabled),
    });
    await updateAllServerStatuses();
  } catch (error) {
    console.error("Failed to load MCP config:", error);
  } finally {
    mcpStore.setState((s) => ({ ...s, configLoading: false }));
  }
};

const startEnabledServers = async () => {
  for (const [serverName, serverConfig] of Object.entries(mcpStore.state.config.mcpServers)) {
    if (!serverConfig.enabled || isPluginOwnedServerConfig(serverConfig)) continue;
    try {
      const running = await mcpClient.isServerRunning(serverName);
      if (!running) await mcpClient.startServer(serverName);
    } catch (error) {
      console.error("Failed to auto-start MCP server", serverName, error);
    }
  }
};

export const updateAllServerStatuses = async () => {
  for (const serverName of Object.keys(mcpStore.state.config.mcpServers)) {
    await updateServerStatus(serverName, true);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  await Promise.all([loadTools(), loadClients()]);
};

export const updateServerStatus = async (serverName: string, noRefresh = false) => {
  try {
    const serverConfig = mcpStore.state.config.mcpServers[serverName];
    if (!mcpStore.state.config.mcpEnabled && !isPluginOwnedServerConfig(serverConfig)) {
      mcpStore.setState((s) => ({
        ...s,
        serverStatuses: { ...s.serverStatuses, [serverName]: false },
      }));
      return;
    }

    const isRunning = await mcpClient.isServerRunning(serverName);
    mcpStore.setState((s) => ({
      ...s,
      serverStatuses: { ...s.serverStatuses, [serverName]: isRunning },
    }));

    if (!noRefresh) {
      await Promise.all([loadTools(), loadClients()]);
    }

    if (!mcpStore.state.config.mcpEnabled) return;

    if (isRunning) {
      const serverTools = mcpStore.state.tools
        .filter((tool) => tool.server.name === serverName)
        .map((tool) => tool.function.name);
      if (serverTools.length > 0) {
        const mergedTools = Array.from(new Set([...mcpStore.state.enabledToolNames, ...serverTools]));
        await setEnabledToolNames(mergedTools);
      }
    } else {
      const allServerToolNames = mcpStore.state.tools.map((tool) => tool.function.name);
      const filteredTools = mcpStore.state.enabledToolNames.filter(allServerToolNames.includes);
      await setEnabledToolNames(filteredTools);
    }
  } catch (error) {
    console.error(`Failed to get server status: ${serverName}`, error);
    mcpStore.setState((s) => ({
      ...s,
      serverStatuses: { ...s.serverStatuses, [serverName]: false },
    }));
  }
};

export const loadTools = async () => {
  if (!mcpStore.state.config.ready) return;
  try {
    const toolDefs = (await mcpClient.getAllToolDefinitions()) ?? [];
    if (mcpStore.state.config.mcpEnabled) {
      applyToolsSnapshot(toolDefs);
      await syncEnabledToolsWithDefinitions(toolDefs);
    }
    mcpStore.setState((s) => ({
      ...s,
      tools: toolDefs,
      toolsLoading: false,
      toolsError: false,
      toolsErrorMessage: "",
    }));
  } catch (error) {
    mcpStore.setState((s) => ({
      ...s,
      toolsLoading: false,
      toolsError: true,
      toolsErrorMessage: error instanceof Error ? error.message : String(error),
    }));
    console.error("Failed to load MCP tools:", error);
  }
};

export const loadClients = async () => {
  if (!mcpStore.state.config.ready) return;
  try {
    const clients = (await mcpClient.getMcpClients()) ?? [];
    mcpStore.setState((s) => ({ ...s, clients }));
    await Promise.all([loadPrompts(), loadResources()]);
  } catch (error) {
    console.error("Failed to load MCP clients:", error);
  }
};

export const loadPrompts = async () => {
  try {
    const customPrompts = await loadCustomPromptsData();
    const mcpPrompts = await loadMcpPromptsData();
    const all = [...customPrompts, ...mcpPrompts];
    mcpStore.setState((s) => ({ ...s, prompts: all }));
  } catch (error) {
    console.error("Failed to load MCP prompts:", error);
  }
};

export const loadResources = async () => {
  if (!mcpStore.state.config.ready) return;
  try {
    const resources = (await mcpClient.getAllResources()) ?? [];
    mcpStore.setState((s) => ({ ...s, resources }));
  } catch (error) {
    console.error("Failed to load MCP resources:", error);
  }
};

export const setMcpEnabled = async (enabled: boolean) => {
  try {
    mcpStore.setState((s) => ({
      ...s,
      config: { ...s.config, mcpEnabled: enabled, ready: s.config.ready || true },
    }));

    await mcpClient.setMcpEnabled(enabled);
    await loadConfig();

    if (enabled) {
      await startEnabledServers();
      await updateAllServerStatuses();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await Promise.all([loadTools(), loadClients(), loadPrompts()]);
      setTimeout(async () => {
        if (mcpStore.state.config.mcpEnabled) {
          await Promise.all([loadTools(), loadClients()]);
        }
      }, 1000);
    } else {
      await Promise.allSettled(
        Object.entries(mcpStore.state.config.mcpServers)
          .filter(([, sc]) => !isPluginOwnedServerConfig(sc))
          .map(([sn]) => mcpClient.stopServer(sn)),
      );
      mcpStore.setState((s) => ({
        ...s,
        serverStatuses: Object.fromEntries(
          Object.entries(s.serverStatuses).filter(([sn]) => isPluginOwnedServerName(sn)),
        ),
        toolInputs: {},
        toolResults: {},
      }));
      await Promise.all([loadTools(), loadClients(), loadResources(), loadPrompts()]);
    }

    return true;
  } catch (error) {
    console.error("Failed to set MCP enabled state:", error);
    mcpStore.setState((s) => ({
      ...s,
      config: { ...s.config, mcpEnabled: !enabled },
    }));
    return false;
  }
};

export const addServer = async (serverName: string, serverConfig: MCPServerConfig) => {
  try {
    const success = await mcpClient.addMcpServer(serverName, serverConfig);
    if (success) {
      await loadConfig();
      return { success: true, message: "" };
    }
    return { success: false, message: "Failed to add MCP server" };
  } catch (error) {
    console.error("Failed to add MCP server:", error);
    return { success: false, message: "Failed to add MCP server" };
  }
};

export const updateServer = async (serverName: string, serverConfig: Partial<MCPServerConfig>) => {
  try {
    await mcpClient.updateMcpServer(serverName, serverConfig);
    await loadConfig();
    return true;
  } catch (error) {
    console.error("Failed to update MCP server:", error);
    return false;
  }
};

export const removeServer = async (serverName: string) => {
  try {
    await mcpClient.removeMcpServer(serverName);
    await loadConfig();
    return true;
  } catch (error) {
    console.error("Failed to remove MCP server:", error);
    return false;
  }
};

export const toggleServer = async (serverName: string) => {
  if (mcpStore.state.serverLoadingStates[serverName]) return false;

  const serverConfig = mcpStore.state.config.mcpServers[serverName];
  if (!serverConfig) return false;

  const nextEnabled = !serverConfig.enabled;
  const previousConfig = { ...serverConfig };

  mcpStore.setState((s) => ({
    ...s,
    config: {
      ...s.config,
      mcpServers: {
        ...s.config.mcpServers,
        [serverName]: { ...serverConfig, enabled: nextEnabled },
      },
    },
    serverLoadingStates: { ...s.serverLoadingStates, [serverName]: true },
  }));

  try {
    await mcpClient.setMcpServerEnabled(serverName, nextEnabled);
    await loadConfig();
    await updateServerStatus(serverName);
    return true;
  } catch (error) {
    mcpStore.setState((s) => ({
      ...s,
      config: {
        ...s.config,
        mcpServers: { ...s.config.mcpServers, [serverName]: previousConfig },
      },
    }));
    try {
      await mcpClient.setMcpServerEnabled(serverName, previousConfig.enabled);
    } catch (rollbackError) {
      console.error(`Failed to rollback MCP server state for ${serverName}`, rollbackError);
    }
    console.error(`Failed to toggle MCP server: ${serverName}`, error);
    return false;
  } finally {
    mcpStore.setState((s) => ({
      ...s,
      serverLoadingStates: { ...s.serverLoadingStates, [serverName]: false },
    }));
  }
};

export const updateToolInput = (toolName: string, paramName: string, value: string) => {
  const current = mcpStore.state.toolInputs[toolName] ?? {};
  mcpStore.setState((s) => ({
    ...s,
    toolInputs: { ...s.toolInputs, [toolName]: { ...current, [paramName]: value } },
  }));
};

type CallToolRequest = Parameters<(typeof mcpClient)["callTool"]>[0];
type CallToolResult = Awaited<ReturnType<(typeof mcpClient)["callTool"]>>;

export const callTool = async (toolName: string): Promise<CallToolResult> => {
  mcpStore.setState((s) => ({
    ...s,
    toolLoadingStates: { ...s.toolLoadingStates, [toolName]: true },
  }));
  try {
    const rawParams = mcpStore.state.toolInputs[toolName] || {};
    const params = { ...rawParams } as Record<string, unknown>;

    if (toolName === "glob_search") {
      const pattern = typeof params.pattern === "string" ? params.pattern.trim() : "";
      if (!pattern) params.pattern = "**/*.md";
      if (typeof params.root === "string" && params.root.trim() === "") delete params.root;
      if (typeof params.excludePatterns === "string") {
        const parsed = params.excludePatterns
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        if (parsed.length > 0) params.excludePatterns = parsed;
        else delete params.excludePatterns;
      }
      if (typeof params.maxResults === "string") {
        const parsed = Number(params.maxResults);
        if (!Number.isNaN(parsed)) params.maxResults = parsed;
        else delete params.maxResults;
      }
      if (typeof params.sortBy === "string" && params.sortBy.trim() === "") delete params.sortBy;
    }

    const request: CallToolRequest = {
      id: Date.now().toString(),
      type: "function",
      function: { name: toolName, arguments: JSON.stringify(params) },
    };

    try {
      const result = await mcpClient.callTool(request);
      if (result && toolName) {
        mcpStore.setState((s) => ({
          ...s,
          toolResults: { ...s.toolResults, [toolName]: result.content },
        }));
      }
      return result;
    } catch (error) {
      console.error(`Failed to call tool: ${toolName}`, error);
      if (toolName) {
        mcpStore.setState((s) => ({
          ...s,
          toolResults: { ...s.toolResults, [toolName]: `Tool call error: ${String(error)}` },
        }));
      }
      throw error;
    }
  } finally {
    mcpStore.setState((s) => ({
      ...s,
      toolLoadingStates: { ...s.toolLoadingStates, [toolName]: false },
    }));
  }
};

export const getPrompt = async (prompt: PromptListEntry, args?: Record<string, unknown>): Promise<unknown> => {
  try {
    const isCustomPrompt = prompt.client?.name === "argos/custom-prompts-server";

    if (isCustomPrompt) {
      const customPrompts: Prompt[] = await configClient.getCustomPrompts();
      const matchedPrompt = customPrompts.find((p) => p.name === prompt.name);

      if (!matchedPrompt) throw new Error(`Prompt not found: ${prompt.name}`);
      if (!matchedPrompt.content || matchedPrompt.content.trim() === "")
        throw new Error(`Prompt content is empty: ${prompt.name}`);

      let content = matchedPrompt.content;

      if (args && matchedPrompt.parameters) {
        const requiredParams = matchedPrompt.parameters.filter((param) => param.required).map((param) => param.name);
        const missingParams = requiredParams.filter((paramName) => !(paramName in args));
        if (missingParams.length > 0) throw new Error(`Missing required parameters: ${missingParams.join(", ")}`);

        const validParamNames = matchedPrompt.parameters.map((param) => param.name);
        const invalidParams = Object.keys(args).filter((key) => !validParamNames.includes(key));
        if (invalidParams.length > 0) throw new Error(`Invalid parameters: ${invalidParams.join(", ")}`);

        for (const [key, value] of Object.entries(args)) {
          if (value !== null && value !== undefined) {
            const placeholder = `{{${key}}}`;
            let startPos = 0;
            let pos;
            while ((pos = content.indexOf(placeholder, startPos)) !== -1) {
              content = content.substring(0, pos) + String(value) + content.substring(pos + placeholder.length);
              startPos = pos + String(value).length;
            }
          }
        }
      }

      return { messages: [{ role: "user", content: { type: "text", text: content } }] };
    }

    if (!mcpStore.state.config.mcpEnabled && !isPluginOwnedServerName(prompt.client?.name))
      throw new Error("MCP is disabled");

    return await mcpClient.getPrompt(prompt, args);
  } catch (error) {
    console.error("Failed to get prompt:", error);
    throw error;
  }
};

export const readResource = async (resource: ResourceListEntry): Promise<Resource> => {
  if (!mcpStore.state.config.mcpEnabled && !isPluginOwnedServerName(resource.client?.name))
    throw new Error("MCP is disabled");
  try {
    return await mcpClient.readResource(resource);
  } catch (error) {
    console.error("Failed to read resource:", error);
    throw error;
  }
};

const initEvents = () => {
  mcpClient.onServerStarted(({ serverName }) => {
    console.log(`MCP server started: ${serverName}`);
    updateServerStatus(serverName).then(() => {
      if (mcpStore.state.config.mcpEnabled) {
        loadTools().catch((error) => {
          console.error("Failed to refresh tools after server started:", error);
        });
      }
    });
  });

  mcpClient.onServerStopped(({ serverName }) => {
    console.log(`MCP server stopped: ${serverName}`);
    updateServerStatus(serverName).then(() => {
      if (mcpStore.state.config.mcpEnabled) {
        loadTools().catch((error) => {
          console.error("Failed to refresh tools after server stopped:", error);
        });
      }
    });
  });

  mcpClient.onConfigChanged((payload) => {
    console.log("MCP config changed", payload);
    syncConfigFromQuery(payload);
    updateAllServerStatuses().catch((error) => {
      console.error("Failed to update server statuses after config change:", error);
    });
  });

  mcpClient.onServerStatusChanged(({ serverName, isRunning }) => {
    console.log(`MCP server ${serverName} status changed: ${isRunning}`);
    mcpStore.setState((s) => ({
      ...s,
      serverStatuses: { ...s.serverStatuses, [serverName]: isRunning },
    }));
  });

  mcpClient.onToolCallResult((result) => {
    console.log(`MCP tool call result:`, result.functionName);
    if (result && result.functionName) {
      mcpStore.setState((s) => ({
        ...s,
        toolResults: { ...s.toolResults, [result.functionName as string]: result.content },
      }));
    }
  });

  configClient.onCustomPromptsChanged(() => {
    console.log("Custom prompts changed, reloading prompts list");
    void loadPrompts();
  });
};

export const initMcp = async () => {
  initEvents();
  await loadEnabledToolNames();
  await loadConfig();
  await loadPrompts();

  if (mcpStore.state.config.mcpEnabled) {
    await loadTools();
    await loadClients();
  }
};

export const getNpmRegistryStatus = async () => {
  return await mcpClient.getNpmRegistryStatus();
};

export const refreshNpmRegistry = async (): Promise<string> => {
  return await mcpClient.refreshNpmRegistry();
};

export const setCustomNpmRegistry = async (registry: string | undefined): Promise<void> => {
  await mcpClient.setCustomNpmRegistry(registry);
};

export const setAutoDetectNpmRegistry = async (enabled: boolean): Promise<void> => {
  await mcpClient.setAutoDetectNpmRegistry(enabled);
};

export const clearNpmRegistryCache = async (): Promise<void> => {
  await mcpClient.clearNpmRegistryCache();
};

export const setMcpInstallCache = (value: string | null) => {
  mcpStore.setState((s) => ({ ...s, mcpInstallCache: value }));
};

export const clearMcpInstallCache = () => {
  mcpStore.setState((s) => ({ ...s, mcpInstallCache: null }));
};

export const isToolEnabled = (toolName: string): boolean => mcpStore.state.enabledToolNames.includes(toolName);

export const setToolEnabled = async (toolName: string, enabled: boolean): Promise<void> => {
  const current = mcpStore.state.enabledToolNames;
  if (enabled) {
    await setEnabledToolNames([...current, toolName]);
    return;
  }
  await setEnabledToolNames(current.filter((name) => name !== toolName));
};

export const getVisibleTools = () => mcpStore.state.tools.filter((tool) => isVisibleServerName(tool.server.name));

export const getPluginTools = () => mcpStore.state.tools.filter((tool) => isPluginOwnedServerName(tool.server.name));

export const getVisibleResources = () =>
  mcpStore.state.resources.filter((resource) => isVisibleServerName(resource.client.name));

export const getVisiblePrompts = () =>
  mcpStore.state.prompts.filter((prompt) => isVisibleServerName(prompt.client?.name));

export const getToolsLoading = () => (mcpStore.state.config.mcpEnabled ? mcpStore.state.toolsLoading : false);

export const getToolsError = () => mcpStore.state.toolsError;

export const getToolsErrorMessage = () => mcpStore.state.toolsErrorMessage;

export const getMcpEnabled = () => mcpStore.state.config.mcpEnabled;

export const getAllServerList = () => {
  const { config, serverStatuses, serverLoadingStates } = mcpStore.state;
  const servers = Object.entries(config.mcpServers ?? {}).map(([name, serverConfig]) => ({
    name,
    ...serverConfig,
    isRunning: serverStatuses[name] || false,
    isLoading: serverLoadingStates[name] || false,
  }));

  return servers.sort((a, b) => {
    const aIsInmemory = a.type === "inmemory" || a.source === "argos";
    const bIsInmemory = b.type === "inmemory" || b.source === "argos";
    if (aIsInmemory && !bIsInmemory) return -1;
    if (!aIsInmemory && bIsInmemory) return 1;
    return 0;
  });
};

export const getServerList = () => getAllServerList().filter((server) => !isPluginOwnedServerConfig(server));

export const getPluginServerList = () => getAllServerList().filter(isPluginOwnedServerConfig);

export const getEnabledServers = () =>
  mcpStore.state.config.mcpEnabled ? getServerList().filter((server) => server.enabled) : [];

export const getEnabledPluginServers = () => getPluginServerList().filter((server) => server.enabled);

export const getEnabledServerCount = () => getEnabledServers().length;

export const getToolCount = () => getVisibleTools().length;

export const getHasTools = () => getToolCount() > 0;

export function useMcpStore() {
  const state = useStore(mcpStore);
  return {
    ...state,
    get serverList() {
      return getAllServerList();
    },
    get mcpEnabled() {
      return state.config.mcpEnabled;
    },
    isPluginOwnedServerName,
    isVisibleServerName,
    loadConfig,
    updateAllServerStatuses,
    updateServerStatus,
    loadTools,
    loadClients,
    loadPrompts,
    loadResources,
    setMcpEnabled,
    addServer,
    updateServer,
    removeServer,
    toggleServer,
    updateToolInput,
    callTool,
    getPrompt,
    readResource,
    initMcp,
    getNpmRegistryStatus,
    refreshNpmRegistry,
    setCustomNpmRegistry,
    setAutoDetectNpmRegistry,
    clearNpmRegistryCache,
    setMcpInstallCache,
    clearMcpInstallCache,
    isToolEnabled,
    setToolEnabled,
    getVisibleTools,
    getPluginTools,
    getVisibleResources,
    getVisiblePrompts,
    getToolsLoading,
    getToolsError,
    getToolsErrorMessage,
    getMcpEnabled,
    getAllServerList,
    getServerList,
    getPluginServerList,
    getEnabledServers,
    getEnabledPluginServers,
    getEnabledServerCount,
    getToolCount,
    getHasTools,
  };
}
