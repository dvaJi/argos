import { app, shell } from "electron";
import path from "path";
import type { SkillHostPorts } from "@argos/skills-runtime";
import { eventBus, SendTarget } from "#/eventbus";
import { publishArgosEvent } from "#/routes/publishArgosEvent";
import type { ArgosEventName } from "@argos/shared-contracts/events";
import { discoverSkillMetadataInWorker } from "./discoveryWorker";

/**
 * Desktop (Electron main) implementation of the skill host ports. Bridges the
 * host-agnostic runtime to Electron `app` paths, the worker-based metadata
 * discovery, `eventBus`/`publishArgosEvent`, and `shell.openPath`.
 */
export function createDesktopSkillPorts(): SkillHostPorts {
  return {
    paths: {
      tempDir: () => app.getPath("temp"),
      homeDir: () => app.getPath("home"),
      bundledSkillRoots: () => {
        if (!app.isPackaged) {
          return [path.join(app.getAppPath(), "resources", "skills")];
        }
        return [
          path.join(process.resourcesPath, "app.asar.unpacked", "resources", "skills"),
          path.join(process.resourcesPath, "resources", "skills"),
          path.join(process.resourcesPath, "skills"),
        ];
      },
    },
    events: {
      broadcast: (channel, payload) => eventBus.sendToRenderer(channel, SendTarget.ALL_WINDOWS, payload),
      publish: (eventName, payload) => publishArgosEvent(eventName as ArgosEventName, payload),
    },
    services: {
      discoverMetadata: (input) =>
        discoverSkillMetadataInWorker(input as never) as Promise<{ skills: never[]; warnings: unknown[] }>,
      openPath: async (target) => {
        await shell.openPath(target);
      },
    },
  };
}
