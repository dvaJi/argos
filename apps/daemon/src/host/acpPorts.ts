import { tmpdir, homedir } from "node:os";
import path from "node:path";
import type { AcpHostPorts } from "@argos/acp-runtime";
import type { IEventPublisher } from "@argos/backend-core";
import { shouldRejectAcpTextRead, buildBinaryReadGuidance } from "./acpBinaryGuard";
import type { ToolchainService } from "./toolchains/service";
/**
 * Daemon implementation of the ACP host ports. Resolves paths from the OS and
 * daemon data dir, resolves `npx`/`uvx`/`node`/`uv` through the managed
 * toolchain service (falling through to `$PATH` when unconfigured), bridges
 * events to the daemon `IEventPublisher`, and wires lifecycle to process
 * signals.
 */
export function createDaemonAcpPorts(deps: {
  dataDir: string;
  appVersion: string;
  eventPublisher: IEventPublisher;
  toolchains: ToolchainService;
}): AcpHostPorts {
  return {
    paths: {
      tempDir: () => tmpdir(),
      homeDir: () => homedir(),
      userDataDir: () => deps.dataDir,
      appVersion: () => deps.appVersion,
    },
    runtime: {
      expandPath: (target) => target,
      resolveCommand: (command) => command,
      resolveCommandWithArgs: async ({ command, args }) => {
        const resolved = await deps.toolchains.resolveCommand(command, args);
        if (resolved.command === command) {
          return null;
        }
        return resolved;
      },
      buildSpawnEnv: (base) => {
        const dirs = deps.toolchains.binDirsSync();
        if (dirs.length === 0) {
          return base;
        }
        const existingKey = Object.keys(base).find((key) => key.toLowerCase() === "path");
        const key = existingKey ?? (process.platform === "win32" ? "Path" : "PATH");
        return {
          ...base,
          [key]: [...dirs, base[key] ?? ""].filter(Boolean).join(path.delimiter),
        };
      },
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
function daemonRegistryRoot(dataDir: string): string {
  return path.join(dataDir, "acp-registry");
}
