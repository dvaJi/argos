import { app } from "electron";
import type { McpHostPorts } from "@argos/mcp-runtime";
import { eventBus, SendTarget } from "#/eventbus";
import { RuntimeHelper } from "#/lib/runtimeHelper";
import { proxyConfig } from "#/presenter/proxyConfig";
import { presenter } from "#/presenter";
import { getPluginToolPolicy } from "#/presenter/pluginPresenter/toolPolicyStore";
import { getInMemoryServer } from "./inMemoryServers/builder";
import { NOTIFICATION_EVENTS } from "#/events";

/**
 * Desktop (Electron main) implementation of the MCP host ports. Bridges the
 * host-agnostic runtime to `app`, `RuntimeHelper`, `eventBus`, `proxyConfig`,
 * the `presenter` singleton (sampling/LLM completion/agent session), the plugin
 * tool-policy store, and the in-memory MCP servers.
 */
export function createDesktopMcpPorts(configPresenter: {
  getMcpServers: () => Promise<Record<string, unknown>>;
  getProviderModels: (providerId: string) => unknown[];
  getCustomModels?: (providerId: string) => unknown[];
}): McpHostPorts {
  const runtimeHelper = RuntimeHelper.getInstance();
  return {
    paths: {
      homeDir: () => app.getPath("home"),
      appVersion: () => app.getVersion(),
    },
    runtime: {
      initializeRuntimes: () => runtimeHelper.initializeRuntimes(),
      expandPath: (target) => runtimeHelper.expandPath(target),
      processCommandWithArgs: (command, args) => runtimeHelper.processCommandWithArgs(command, args),
      normalizePathEnv: (paths) => runtimeHelper.normalizePathEnv(paths),
      getDefaultPaths: (homeDir) => runtimeHelper.getDefaultPaths(homeDir ?? ""),
      getNodeRuntimePath: () => runtimeHelper.getNodeRuntimePath(),
      getUvRuntimePath: () => runtimeHelper.getUvRuntimePath(),
      setNodeRuntimePath: (p) => runtimeHelper.setNodeRuntimePath(p),
      setUvRuntimePath: (p) => runtimeHelper.setUvRuntimePath(p),
    },
    events: {
      broadcast: (channel, payload) => eventBus.send(channel, SendTarget.ALL_WINDOWS, payload),
      broadcastError: (channel, payload) => eventBus.sendToRenderer(channel, SendTarget.ALL_WINDOWS, payload),
      subscribe: (channel, handler) => {
        const listener = () => handler(undefined);
        eventBus.on(channel, listener);
        return () => eventBus.off(channel, listener);
      },
    },
    proxy: {
      getProxyUrl: () => proxyConfig.getProxyUrl(),
    },
    services: {
      handleSamplingRequest: (payload) =>
        presenter.mcpPresenter.handleSamplingRequest(payload as never) as Promise<unknown>,
      cancelSamplingRequest: (requestId, reason) => presenter.mcpPresenter.cancelSamplingRequest(requestId, reason),
      generateCompletionStandalone: (...args) =>
        presenter.llmproviderPresenter.generateCompletionStandalone(
          args[0] as never,
          args[1] as never,
          args[2] as never,
          args[3] as never,
          args[4] as never,
        ) as Promise<string>,
      getProviderModels: (providerId) => configPresenter.getProviderModels(providerId),
      getCustomModels: (providerId) => configPresenter.getCustomModels?.(providerId) ?? [],
      getPluginToolPolicy: (serverId, toolName) => getPluginToolPolicy(serverId, toolName),
      getSession: (conversationId) => presenter.agentSessionPresenter.getSession(conversationId),
      getAcpAgents: () => presenter.configPresenter.getAcpAgents(),
      getAgentMcpSelections: (agentId) => presenter.configPresenter.getAgentMcpSelections(agentId),
      getInMemoryServer: (name, args, env) =>
        getInMemoryServer(name, args, env) as { startServer(transport: unknown): unknown },
      getMcpServers: () => configPresenter.getMcpServers() as Promise<Record<string, never>>,
    },
  };
}

// Re-export so callers can subscribe to the desktop notification channel name.
export { NOTIFICATION_EVENTS };
