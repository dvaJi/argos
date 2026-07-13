import { app } from "electron";
import { eventBus, SendTarget } from "#/eventbus";
import { publishArgosEvent } from "#/routes/publishArgosEvent";
import { RuntimeHelper } from "#/lib/runtimeHelper";
import { buildBinaryReadGuidance, shouldRejectAcpTextRead } from "#/lib/binaryReadGuard";
import type { ArgosEventName } from "@argos/shared-contracts/events";
import type { AcpHostPorts } from "@argos/acp-runtime";

/**
 * Desktop (Electron main) implementation of the ACP host ports.
 * Bridges the host-agnostic runtime to Electron `app`, `RuntimeHelper`,
 * `eventBus` / `publishArgosEvent`, and the desktop binary-read guard.
 *
 * The npm/uv registry is wired separately by the ACP provider, so `ports.mcp`
 * is left unset here.
 */
export function createDesktopAcpPorts(): AcpHostPorts {
  const runtimeHelper = RuntimeHelper.getInstance();
  return {
    paths: {
      tempDir: () => app.getPath("temp"),
      homeDir: () => app.getPath("home"),
      userDataDir: () => app.getPath("userData"),
      appVersion: () => app.getVersion(),
      appPath: () => app.getAppPath(),
    },
    runtime: {
      initializeRuntimes: () => runtimeHelper.initializeRuntimes(),
      expandPath: (target) => runtimeHelper.expandPath(target),
      resolveCommand: (command, useBundled, checkExists) =>
        runtimeHelper.replaceWithRuntimeCommand(command, useBundled, checkExists),
      buildSpawnEnv: (base) => runtimeHelper.prependBundledRuntimeToEnv(base),
    },
    events: {
      broadcast: (channel, payload) => eventBus.sendToRenderer(channel, SendTarget.ALL_WINDOWS, payload),
      broadcastToAll: (channel, payload) => eventBus.send(channel, SendTarget.ALL_WINDOWS, payload),
      publish: (name, payload) => publishArgosEvent(name as ArgosEventName, payload),
    },
    lifecycle: {
      onBeforeQuit: (cb) => {
        app.on("before-quit", () => cb());
      },
    },
    fs: {
      shouldRejectAcpTextRead: (filePath) => shouldRejectAcpTextRead(filePath),
      buildBinaryReadGuidance: (filePath, mimeType, source) =>
        buildBinaryReadGuidance(filePath, mimeType ?? "", source as "acp" | "agent"),
    },
  };
}
