import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  pluginsDisableRoute,
  pluginsEnableRoute,
  pluginsGetRoute,
  pluginsInvokeActionRoute,
  pluginsInvokeDesktopActionRoute,
  pluginsListRoute,
} from "@argos/shared-contracts/routes";
import {
  DESKTOP_ONLY_PLUGIN_ACTION_ERROR,
  type PluginActionResult,
  type PluginInvokeActionRequest,
} from "@argos/shared/types/plugin";
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

  /**
   * Runs a plugin action through the desktop main presenter. Used as a fallback
   * when the daemon cannot serve an action: Electron-only actions are refused
   * with DESKTOP_ONLY_PLUGIN_ACTION_ERROR, and runtime-bound actions fail with
   * the "not owned by a plugin runtime" error when the daemon has no driver
   * registered (e.g. the runtime only exists on the desktop side).
   */
  async function invokeDesktopAction(input: PluginInvokeActionRequest) {
    const result = await bridge.invoke(pluginsInvokeDesktopActionRoute.name, input);
    return result.result;
  }

  const RUNTIME_NOT_REGISTERED_PATTERN = /not owned by a plugin runtime/;

  function daemonRuntimeUnavailable(result: PluginActionResult): boolean {
    if (result.error && RUNTIME_NOT_REGISTERED_PATTERN.test(result.error)) {
      return true;
    }
    // checkPermissions-style actions return ok:true and carry the failure in
    // data.error so the plugin UI can render diagnostics.
    const dataError = (result.data as { error?: unknown } | undefined)?.error;
    return typeof dataError === "string" && RUNTIME_NOT_REGISTERED_PATTERN.test(dataError);
  }

  async function invokeActionWithDesktopFallback(input: PluginInvokeActionRequest) {
    const result = await invokeAction(input);
    const shouldFallback =
      (!result.ok && result.error === DESKTOP_ONLY_PLUGIN_ACTION_ERROR) || daemonRuntimeUnavailable(result);
    if (!shouldFallback) {
      return result;
    }
    return invokeDesktopAction(input);
  }

  return {
    listPlugins,
    getPlugin,
    enablePlugin,
    disablePlugin,
    invokeAction,
    invokeDesktopAction,
    invokeActionWithDesktopFallback,
  };
}

type PluginClient = ReturnType<typeof createPluginClient>;
