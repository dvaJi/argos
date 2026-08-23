import { ILifecycleManager } from "@argos/shared/presenter";
import { createLogger } from "@argos/shared/logger";
import * as hooks from "./hooks";

const log = createLogger("Lifecycle");

/**
 * Register core application hooks with the lifecycle manager
 * This function should be called during lifecycle manager initialization
 */
export function registerCoreHooks(lifecycleManager: ILifecycleManager): void {
  log.info("Registering core application lifecycle hooks");
  Object.keys(hooks).forEach((key) => {
    lifecycleManager.registerHook(hooks[key]);
  });
}
