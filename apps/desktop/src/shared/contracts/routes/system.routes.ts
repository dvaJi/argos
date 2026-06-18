import { z } from "zod";
import { defineRouteContract } from "../common";

export const SettingsRouteNameSchema = z.enum([
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
  input: z
    .object({
      routeName: SettingsRouteNameSchema.optional(),
      params: z.record(z.string()).optional(),
      section: z.string().optional(),
    })
    .default({}),
  output: z.object({
    windowId: z.number().int().nullable(),
  }),
});

const ProviderInstallPreviewSchema = z.union([
  z.object({
    kind: z.literal("builtin"),
    id: z.string(),
    baseUrl: z.string(),
    apiKey: z.string(),
    maskedApiKey: z.string(),
    iconModelId: z.string(),
    willOverwrite: z.boolean(),
  }),
  z.object({
    kind: z.literal("custom"),
    name: z.string(),
    type: z.string(),
    baseUrl: z.string(),
    apiKey: z.string(),
    maskedApiKey: z.string(),
    iconModelId: z.string(),
  }),
]);

export const systemConsumePendingProviderInstallRoute = defineRouteContract({
  name: "system.consumePendingProviderInstall",
  input: z.object({}).default({}),
  output: z.object({
    preview: ProviderInstallPreviewSchema.nullable(),
  }),
});

export const systemSetPendingProviderInstallRoute = defineRouteContract({
  name: "system.setPendingProviderInstall",
  input: z.object({
    preview: ProviderInstallPreviewSchema,
  }),
  output: z.object({
    success: z.boolean(),
  }),
});
