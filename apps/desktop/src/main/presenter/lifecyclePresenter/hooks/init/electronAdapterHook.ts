import { LifecycleHook, LifecycleContext } from "@shared/presenter";
import { LifecyclePhase } from "@shared/lifecycle";
import { createElectronHostDependencies } from "@argos/electron-adapter";
import { eventBus } from "@/eventbus";

export const electronAdapterHook: LifecycleHook = {
  name: "electron-adapter-init",
  phase: LifecyclePhase.INIT,
  priority: 3,
  critical: false,
  async execute(context: LifecycleContext) {
    console.log("electronAdapterHook: Initializing electron-adapter host dependencies");

    try {
      const hostDeps = createElectronHostDependencies({
        eventBusInstance: eventBus,
      });

      (context as any).hostDependencies = hostDeps;

      console.log("electronAdapterHook: Electron adapter host dependencies initialized");
      console.log(`  paths: ${hostDeps.paths.getDataDir()}`);
      console.log(`  db path: ${hostDeps.paths.getDatabasePath()}`);
    } catch (error) {
      console.error("electronAdapterHook: Failed to initialize (non-critical):", error);
    }
  },
};
