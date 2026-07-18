import type { HostDependencies } from "@argos/backend-core";
import { ElectronPathResolver } from "./electronPaths";
import { ElectronConfigStore } from "./electronConfig";
import { ElectronCredentialStore } from "./electronSecrets";
import { ElectronSubprocessRunner } from "./electronSubprocess";
import { ElectronEventPublisher } from "./electronEventPublisher";
import type { eventBus as EventBusType } from "#/eventbus";

export function createElectronHostDependencies(options: {
  configStore?: ElectronConfigStore;
  eventBusInstance?: typeof EventBusType;
}): HostDependencies {
  const paths = new ElectronPathResolver();
  const credentials = new ElectronCredentialStore({
    get: (key: string) => {
      try {
        const electronStore = require("electron-store");
        const store = new electronStore();
        return store.get(`credentials.${key}`);
      } catch {
        return undefined;
      }
    },
    set: (key: string, value: string) => {
      try {
        const electronStore = require("electron-store");
        const store = new electronStore();
        store.set(`credentials.${key}`, value);
      } catch {}
    },
    delete: (key: string) => {
      try {
        const electronStore = require("electron-store");
        const store = new electronStore();
        store.delete(`credentials.${key}`);
      } catch {}
    },
  });
  const config = options.configStore ?? new ElectronConfigStore();
  const subprocess = new ElectronSubprocessRunner();
  const events = options.eventBusInstance
    ? new ElectronEventPublisher(options.eventBusInstance)
    : new ElectronEventPublisher({} as any);

  return { paths, credentials, config, subprocess, events };
}

export type { HostDependencies };
