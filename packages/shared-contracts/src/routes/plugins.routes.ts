import zod from "zod";
import { defineRouteContract, JsonValueSchema } from "../common";
import type { PluginActionResult, PluginInvokeActionRequest, PluginListItem } from "@argos/shared/types/plugin";

const PluginListItemSchema = zod.custom<PluginListItem>();
const PluginActionResultSchema = zod.custom<PluginActionResult>();

export const pluginsListRoute = defineRouteContract({
  name: "plugins.list",
  input: zod.object({}),
  output: zod.object({
    plugins: zod.array(PluginListItemSchema),
  }),
});

export const pluginsGetRoute = defineRouteContract({
  name: "plugins.get",
  input: zod.object({
    pluginId: zod.string().min(1),
  }),
  output: zod.object({
    plugin: PluginListItemSchema.optional(),
  }),
});

export const pluginsEnableRoute = defineRouteContract({
  name: "plugins.enable",
  input: zod.object({
    pluginId: zod.string().min(1),
  }),
  output: zod.object({
    result: PluginActionResultSchema,
  }),
});

export const pluginsDisableRoute = defineRouteContract({
  name: "plugins.disable",
  input: zod.object({
    pluginId: zod.string().min(1),
  }),
  output: zod.object({
    result: PluginActionResultSchema,
  }),
});

export const pluginsInvokeActionRoute = defineRouteContract({
  name: "plugins.invokeAction",
  input: zod.object({
    pluginId: zod.string().min(1),
    actionId: zod.string().min(1),
    payload: JsonValueSchema.optional(),
  }) satisfies zod.ZodType<PluginInvokeActionRequest>,
  output: zod.object({
    result: PluginActionResultSchema,
  }),
});

// Desktop-only twin of `plugins.invokeAction`. Some plugin actions (opening the
// permission guide, opening a project URL) need Electron capabilities the daemon
// does not have; plugin settings pages learn about the daemon refusal via
// DESKTOP_ONLY_PLUGIN_ACTION_ERROR and retry through this route, which the
// hybrid bridge routes over IPC to the desktop main plugin presenter.
export const pluginsInvokeDesktopActionRoute = defineRouteContract({
  name: "plugins.invokeDesktopAction",
  input: zod.object({
    pluginId: zod.string().min(1),
    actionId: zod.string().min(1),
    payload: JsonValueSchema.optional(),
  }) satisfies zod.ZodType<PluginInvokeActionRequest>,
  output: zod.object({
    result: PluginActionResultSchema,
  }),
});
