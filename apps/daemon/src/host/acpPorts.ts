import { tmpdir, homedir } from "node:os";
import path from "node:path";
import type { AcpHostPorts } from "@argos/acp-runtime";
import type { IEventPublisher } from "@argos/backend-core";
import { shouldRejectAcpTextRead, buildBinaryReadGuidance } from "./acpBinaryGuard";

/**
 * Daemon implementation of the ACP host ports. Resolves paths from the OS and
 * daemon data dir, uses a no-op runtime (agents resolve `npx`/`uvx`/`node` from
 * `$PATH`), bridges events to the daemon `IEventPublisher`, and wires lifecycle
 * to process signals.
 */
export function createDaemonAcpPorts(deps: {
  dataDir: string;
  appVersion: string;
  eventPublisher: IEventPublisher;
}): AcpHostPorts {
  return {
    paths: {
      tempDir: () => tmpdir(),
      homeDir: () => homedir(),
      userDataDir: () => deps.dataDir,
      appVersion: () => deps.appVersion,
    },
    runtime: {
      // v1 daemon ships no bundled runtime; agents use $PATH-resolved tools.
      expandPath: (target) => target,
      resolveCommand: (command) => command,
      buildSpawnEnv: (base) => base,
    },
    events: {
      broadcast: (name, payload) => deps.eventPublisher.publish(name, payload),
      broadcastToAll: (name, payload) => deps.eventPublisher.publish(name, payload),
      publish: (name, payload) => deps.eventPublisher.publish(name, payload),
    },
    lifecycle: {
      onBeforeQuit: (cb) => {
        const handler = () => cb();
        process.on("SIGINT", handler);
        process.on("SIGTERM", handler);
      },
    },
    fs: {
      shouldRejectAcpTextRead: (filePath) => shouldRejectAcpTextRead(filePath),
      buildBinaryReadGuidance: (filePath, mimeType, source) =>
        buildBinaryReadGuidance(filePath, mimeType ?? "", source as "acp" | "agent"),
    },
  };
}

/** Resolve the daemon registry root (used by AcpLaunchSpecService). */
export function daemonRegistryRoot(dataDir: string): string {
  return path.join(dataDir, "acp-registry");
}
