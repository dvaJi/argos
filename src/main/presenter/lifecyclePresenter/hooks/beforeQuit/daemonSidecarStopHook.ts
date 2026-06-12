import { LifecycleHook } from "@shared/presenter";
import { LifecyclePhase } from "@shared/lifecycle";
import { getSidecarHandle } from "../init/daemonSidecarHook";

export const daemonSidecarStopHook: LifecycleHook = {
  name: "daemon-sidecar-stop",
  phase: LifecyclePhase.BEFORE_QUIT,
  priority: 5,
  critical: false,
  execute: async () => {
    const handle = getSidecarHandle();
    if (handle && handle.isRunning()) {
      console.log("daemonSidecarStopHook: Stopping daemon sidecar");
      await handle.stop();
      console.log("daemonSidecarStopHook: Daemon sidecar stopped");
    }
  },
};
