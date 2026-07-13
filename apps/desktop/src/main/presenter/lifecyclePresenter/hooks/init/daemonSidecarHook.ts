import { LifecycleHook, LifecycleContext } from "@argos/shared/presenter";
import { LifecyclePhase } from "@argos/shared/lifecycle";
import { eventBus, SendTarget } from "#/eventbus";
import { DAEMON_EVENTS } from "#/events";
import { startSidecar, type SidecarHandle } from "#/presenter/sidecarManager";

let sidecarHandle: SidecarHandle | null = null;

export function getSidecarHandle(): SidecarHandle | null {
  return sidecarHandle;
}

export const daemonSidecarHook: LifecycleHook = {
  name: "daemon-sidecar",
  phase: LifecyclePhase.INIT,
  priority: 3,
  critical: false,
  execute: async (context: LifecycleContext) => {
    console.log("daemonSidecarHook: Starting daemon sidecar");

    try {
      const app = await import("electron").then((m) => m.app);
      const userDataPath = app.getPath("userData");

      void startSidecar({
        dataDir: userDataPath,
        host: "127.0.0.1",
        port: 0,
        maxRetries: 3,
        healthCheckIntervalMs: 500,
        healthCheckTimeoutMs: 30000,
        onStatusChange: (status) => {
          console.log(`[sidecar] Status: ${status}`);
          eventBus.sendToRendererIfAvailable(DAEMON_EVENTS.SIDECAR_STATUS_CHANGED, SendTarget.ALL_WINDOWS, {
            status,
          });
        },
        onPortAssigned: (port) => {
          console.log(`[sidecar] Daemon assigned port: ${port}`);
          eventBus.sendToRendererIfAvailable(DAEMON_EVENTS.SIDECAR_PORT_ASSIGNED, SendTarget.ALL_WINDOWS, {
            port,
          });
        },
      })
        .then((handle) => {
          sidecarHandle = handle;
          (context as any).sidecar = handle;
          console.log(`daemonSidecarHook: Daemon sidecar started on port ${handle.port}`);
        })
        .catch((error) => {
          console.error("daemonSidecarHook: Failed to start sidecar (non-critical):", error);
        });
    } catch (error) {
      console.error("daemonSidecarHook: Failed to start sidecar (non-critical):", error);
    }
  },
};
