import { homedir } from "node:os";
import type { McpHostPorts } from "@argos/mcp-runtime";
import type { IEventPublisher } from "@argos/backend-core";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";

/**
 * Daemon implementation of the MCP host ports. Uses OS paths, an identity
 * runtime (PATH-resolved node/npx/uvx — no bundled runtime), bridges events to
 * the daemon publisher, and provides minimal service stubs (no sampling UI,
 * no plugins, no in-memory knowledge servers in v1).
 */
export function createDaemonMcpPorts(deps: {
  appVersion: string;
  eventPublisher: IEventPublisher;
  configPresenter: DaemonConfigPresenter;
}): McpHostPorts {
  const subscribers = new Map<string, Set<(payload: unknown) => void>>();
  const publish = (channel: string, payload: unknown) => {
    deps.eventPublisher.publish(channel, payload);
    subscribers.get(channel)?.forEach((handler) => handler(payload));
  };

  return {
    paths: {
      homeDir: () => homedir(),
      appVersion: () => deps.appVersion,
    },
    runtime: {
      initializeRuntimes: () => {},
      expandPath: (target) => target,
      processCommandWithArgs: (command, args) => ({ command, args }),
      normalizePathEnv: (paths) => ({ key: "PATH", value: paths.join(":") }),
      getDefaultPaths: () => [],
      getNodeRuntimePath: () => null,
      getUvRuntimePath: () => null,
      setNodeRuntimePath: () => {},
      setUvRuntimePath: () => {},
    },
    events: {
      broadcast: publish,
      broadcastError: publish,
      subscribe: (channel, handler) => {
        let set = subscribers.get(channel);
        if (!set) {
          set = new Set();
          subscribers.set(channel, set);
        }
        set.add(handler);
        return () => set?.delete(handler);
      },
    },
    proxy: {
      getProxyUrl: () => null,
    },
    services: {
      getMcpServers: () => deps.configPresenter.getMcpServers() as Promise<Record<string, never>>,
      getProviderModels: (providerId) =>
        (deps.configPresenter as unknown as { getProviderModels?: (id: string) => unknown[] }).getProviderModels?.(
          providerId,
        ) ?? [],
      getCustomModels: () => [],
      // v1 daemon: sampling, plugin policy, agent-session ACP gating, and in-memory
      // knowledge servers are not supported. Servers that require them will error.
    },
  };
}
