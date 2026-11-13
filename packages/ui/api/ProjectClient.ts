import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  projectListEnvironmentsRoute,
  projectListRecentRoute,
  projectOpenDirectoryRoute,
  projectPathExistsRoute,
  projectSelectDirectoryRoute,
  projectListSettingsRoute,
  projectUpdateSettingsRoute,
  projectDescribeCheckoutsRoute,
} from "@argos/shared-contracts/routes";
import type { ProjectSettingsPatch } from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

export function createProjectClient(bridge: ArgosBridge = getArgosBridge()) {
  async function listRecent(limit: number = 20) {
    const result = await bridge.invoke(projectListRecentRoute.name, { limit });
    return result.projects;
  }

  async function listEnvironments() {
    const result = await bridge.invoke(projectListEnvironmentsRoute.name, {});
    return result.environments;
  }

  async function openDirectory(path: string) {
    return await bridge.invoke(projectOpenDirectoryRoute.name, { path });
  }

  async function selectDirectory() {
    const result = await bridge.invoke(projectSelectDirectoryRoute.name, {});
    return result.path;
  }

  async function pathExists(path: string) {
    const result = await bridge.invoke(projectPathExistsRoute.name, { path });
    return result.exists;
  }

  async function listSettings() {
    const result = await bridge.invoke(projectListSettingsRoute.name, {});
    return result.projects;
  }

  async function updateSettings(path: string, patch: ProjectSettingsPatch) {
    const result = await bridge.invoke(projectUpdateSettingsRoute.name, { path, patch });
    return result.project;
  }

  async function describeCheckouts(paths: string[]) {
    const result = await bridge.invoke(projectDescribeCheckoutsRoute.name, { paths });
    return result.checkouts;
  }

  return {
    listSettings,
    updateSettings,
    describeCheckouts,
    listRecent,
    listEnvironments,
    openDirectory,
    selectDirectory,
    pathExists,
  };
}

type ProjectClient = ReturnType<typeof createProjectClient>;
