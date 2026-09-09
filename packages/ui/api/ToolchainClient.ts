import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  toolchainsCancelInstallRoute,
  toolchainsInstallRoute,
  toolchainsListRoute,
  toolchainsRemoveSourceRoute,
  toolchainsSetSourceRoute,
} from "@argos/shared-contracts/routes";
import type { ArgosRouteInput } from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

export function createToolchainClient(bridge: ArgosBridge = getArgosBridge()) {
  async function list() {
    return await bridge.invoke(toolchainsListRoute.name, {} as ArgosRouteInput<typeof toolchainsListRoute.name>);
  }

  async function setSource(input: ArgosRouteInput<typeof toolchainsSetSourceRoute.name>) {
    return await bridge.invoke(toolchainsSetSourceRoute.name, input);
  }

  async function removeSource(tool: "node" | "uv" | "ripgrep") {
    return await bridge.invoke(toolchainsRemoveSourceRoute.name, { tool });
  }

  async function install(tool: "node" | "uv") {
    return await bridge.invoke(toolchainsInstallRoute.name, { tool });
  }

  async function cancelInstall(tool: "node" | "uv") {
    return await bridge.invoke(toolchainsCancelInstallRoute.name, { tool });
  }

  return {
    list,
    setSource,
    removeSource,
    install,
    cancelInstall,
  };
}

export type ToolchainClient = ReturnType<typeof createToolchainClient>;
