import { LifecycleHook, LifecycleContext } from "@argos/shared/presenter";
import { LifecyclePhase } from "@argos/shared/lifecycle";
import { eventBus, SendTarget } from "#/eventbus";
import { DAEMON_EVENTS } from "#/events";
import { startSidecar, type SidecarHandle } from "#/presenter/sidecarManager";

let sidecarHandle: SidecarHandle | null = null;
let sidecarStart: Promise<SidecarHandle | null> | null = null;

export function getSidecarHandle(): SidecarHandle | null {
  return sidecarHandle;
}

/**
 * Resolve with the daemon port once the sidecar has actually bound it, or
 * null if no sidecar was started / it failed / the timeout elapsed.
 * Event-driven: callers wait exactly as long as the daemon needs, with no
 * polling and no connection attempts against a port nobody listens on yet.
 */
export async function waitForSidecarListening(timeoutMs = 30000): Promise<number | null> {
  if (!sidecarStart) return null;
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const handle = await Promise.race([
      sidecarStart,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (!handle) return null;
    return await handle.whenListening(Math.max(0, deadline - Date.now()));
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
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

      sidecarStart = startSidecar({
        dataDir: userDataPath,
        host: "127.0.0.1",
        port: 0,
        maxRetries: 3,
        healthCheckIntervalMs: 100,
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
          console.log(`daemonSidecarHook: Daemon sidecar spawned (port ${handle.port})`);
          return handle;
        })
        .catch((error) => {
          console.error("daemonSidecarHook: Failed to start sidecar (non-critical):", error);
          return null;
        });
    } catch (error) {
      console.error("daemonSidecarHook: Failed to start sidecar (non-critical):", error);
    }
  },
};
