import type { McpHostPorts } from "@argos/mcp-runtime";

/** In-memory MCP host ports for unit tests (no Electron, no real runtime). */
export function createMcpTestPorts(overrides: Partial<McpHostPorts["services"]> = {}): McpHostPorts {
  return {
    paths: {
      homeDir: () => "/tmp",
      appVersion: () => "0.0.0-test",
    },
    runtime: {
      initializeRuntimes: () => {},
      expandPath: (target) => target,
      processCommandWithArgs: (command, args) => ({ command, args }),
      normalizePathEnv: (paths) => ({ key: "PATH", value: paths.join(":") }),
      getDefaultPaths: () => [],
      getBunRuntimePath: () => null,
      getUvRuntimePath: () => null,
      setBunRuntimePath: () => {},
      setUvRuntimePath: () => {},
    },
    events: {
      broadcast: () => {},
      broadcastError: () => {},
      subscribe: () => () => {},
    },
    proxy: {
      getProxyUrl: () => null,
    },
    services: {
      getMcpServers: async () => ({}),
      getProviderModels: () => [],
      getCustomModels: () => [],
      ...overrides,
    },
  };
}
