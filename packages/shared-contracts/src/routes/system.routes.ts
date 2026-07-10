import zod from "zod";
import { defineRouteContract } from "../common";

export const SettingsRouteNameSchema = zod.enum([
  "settings-overview",
  "settings-common",
  "settings-display",
  "settings-environments",
  "settings-provider",
  "settings-dashboard",
  "settings-mcp",
  "settings-argos-agents",
  "settings-acp",
  "settings-remote",
  "settings-server",
  "settings-notifications-hooks",
  "settings-scheduled-tasks",
  "settings-plugins",
  "settings-skills",
  "settings-prompt",
  "settings-knowledge-base",
  "settings-database",
  "settings-shortcut",
  "settings-about",
]);

export const systemOpenSettingsRoute = defineRouteContract({
  name: "system.openSettings",
  input: zod
    .object({
      routeName: SettingsRouteNameSchema.optional(),
      params: zod.record(zod.string(), zod.string()).optional(),
      section: zod.string().optional(),
    })
    .default({}),
  output: zod.object({
    windowId: zod.number().int().nullable(),
  }),
});

const ProviderInstallPreviewSchema = zod.union([
  zod.object({
    kind: zod.literal("builtin"),
    id: zod.string(),
    baseUrl: zod.string(),
    apiKey: zod.string(),
    maskedApiKey: zod.string(),
    iconModelId: zod.string(),
    willOverwrite: zod.boolean(),
  }),
  zod.object({
    kind: zod.literal("custom"),
    name: zod.string(),
    type: zod.string(),
    baseUrl: zod.string(),
    apiKey: zod.string(),
    maskedApiKey: zod.string(),
    iconModelId: zod.string(),
  }),
]);

export const systemConsumePendingProviderInstallRoute = defineRouteContract({
  name: "system.consumePendingProviderInstall",
  input: zod.object({}).default({}),
  output: zod.object({
    preview: ProviderInstallPreviewSchema.nullable(),
  }),
});

export const systemSetPendingProviderInstallRoute = defineRouteContract({
  name: "system.setPendingProviderInstall",
  input: zod.object({
    preview: ProviderInstallPreviewSchema,
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});
