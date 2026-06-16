import { LifecycleHook, LifecycleContext } from "@shared/presenter";
import { LifecyclePhase } from "@shared/lifecycle";
import { startSidecar, type SidecarHandle } from "@/presenter/sidecarManager";

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

      sidecarHandle = await startSidecar({
        dataDir: userDataPath,
        host: "127.0.0.1",
        port: 0,
        maxRetries: 3,
        healthCheckIntervalMs: 500,
        healthCheckTimeoutMs: 10000,
        onStatusChange: (status) => {
          console.log(`[sidecar] Status: ${status}`);
        },
        onPortAssigned: (port) => {
          console.log(`[sidecar] Daemon assigned port: ${port}`);
        },
      });

      (context as any).sidecar = sidecarHandle;
      console.log(`daemonSidecarHook: Daemon sidecar started on port ${sidecarHandle.port}`);
    } catch (error) {
      console.error("daemonSidecarHook: Failed to start sidecar (non-critical):", error);
    }
  },
};
