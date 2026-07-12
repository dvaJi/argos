import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  pluginsDisableRoute,
  pluginsEnableRoute,
  pluginsGetRoute,
  pluginsInvokeActionRoute,
  pluginsListRoute,
} from "@argos/shared-contracts/routes";
import type { PluginInvokeActionRequest } from "@argos/shared/types/plugin";
import { getArgosBridge } from "./core";

export function createPluginClient(bridge: ArgosBridge = getArgosBridge()) {
  async function listPlugins() {
    const result = await bridge.invoke(pluginsListRoute.name, {});
    return result.plugins;
  }

  async function getPlugin(pluginId: string) {
    const result = await bridge.invoke(pluginsGetRoute.name, { pluginId });
    return result.plugin;
  }

  async function enablePlugin(pluginId: string) {
    const result = await bridge.invoke(pluginsEnableRoute.name, { pluginId });
    return result.result;
  }

  async function disablePlugin(pluginId: string) {
    const result = await bridge.invoke(pluginsDisableRoute.name, { pluginId });
    return result.result;
  }

  async function invokeAction(input: PluginInvokeActionRequest) {
    const result = await bridge.invoke(pluginsInvokeActionRoute.name, input);
    return result.result;
  }

  return {
    listPlugins,
    getPlugin,
    enablePlugin,
    disablePlugin,
    invokeAction,
  };
}

export type PluginClient = ReturnType<typeof createPluginClient>;
