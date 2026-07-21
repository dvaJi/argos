import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  piPackagesGetProjectTrustRoute,
  piPackagesInstallRoute,
  piPackagesListRoute,
  piPackagesRemoveRoute,
  piPackagesSearchRoute,
  piPackagesSetProjectTrustRoute,
} from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

export function createPiPackageClient(bridge: ArgosBridge = getArgosBridge()) {
  return {
    async list(agentId: string) {
      return (await bridge.invoke(piPackagesListRoute.name, { agentId })).packages;
    },
    async search(query: string) {
      return (await bridge.invoke(piPackagesSearchRoute.name, { query })).packages;
    },
    async install(agentId: string, source: string) {
      return (await bridge.invoke(piPackagesInstallRoute.name, { agentId, package: source })).packages;
    },
    async remove(agentId: string, source: string) {
      return (await bridge.invoke(piPackagesRemoveRoute.name, { agentId, source })).packages;
    },
    async getProjectTrust(agentId: string, projectDir: string) {
      return (await bridge.invoke(piPackagesGetProjectTrustRoute.name, { agentId, projectDir })).trusted;
    },
    async setProjectTrust(agentId: string, projectDir: string, trusted: boolean) {
      return (await bridge.invoke(piPackagesSetProjectTrustRoute.name, { agentId, projectDir, trusted })).trusted;
    },
  };
}
