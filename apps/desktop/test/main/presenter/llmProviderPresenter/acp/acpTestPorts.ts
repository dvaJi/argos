import type { AcpHostPorts } from "@argos/acp-runtime";

/** In-memory ACP host ports for unit tests (no Electron, no real runtime). */
export function createAcpTestPorts(): AcpHostPorts {
  return {
    paths: {
      tempDir: () => "/tmp",
      homeDir: () => "/tmp",
      userDataDir: () => "/tmp/argos-acp-test-userdata",
      appVersion: () => "0.0.0-test",
    },
    runtime: {
      initializeRuntimes: () => {},
      expandPath: (target) => target,
      resolveCommand: (command) => command,
      buildSpawnEnv: (base) => base,
    },
    events: {
      broadcast: () => {},
      broadcastToAll: () => {},
      publish: () => {},
    },
    lifecycle: {
      onBeforeQuit: () => {},
    },
    fs: {
      shouldRejectAcpTextRead: async () => ({ reject: false }),
      buildBinaryReadGuidance: () => "",
    },
  };
}
