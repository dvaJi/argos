import zod from "zod";
import { TimestampMsSchema, defineRouteContract } from "../common";

export const SETTINGS_KEYS = [
  "fontSizeLevel",
  "fontFamily",
  "codeFontFamily",
  "artifactsEffectEnabled",
  "autoScrollEnabled",
  "autoCompactionEnabled",
  "autoCompactionTriggerThreshold",
  "autoCompactionRetainRecentPairs",
  "contentProtectionEnabled",
  "privacyModeEnabled",
  "notificationsEnabled",
  "launchAtLoginEnabled",
  "traceDebugEnabled",
  "copyWithCotEnabled",
  "loggingEnabled",
  "showContinueIndicator",
  "hideReasoningOnFinishedTurn",
] as const;

export const SettingsKeySchema = zod.enum(SETTINGS_KEYS);

export const SettingsSnapshotValuesSchema = zod.object({
  fontSizeLevel: zod.number().int(),
  fontFamily: zod.string(),
  codeFontFamily: zod.string(),
  artifactsEffectEnabled: zod.boolean(),
  autoScrollEnabled: zod.boolean(),
  autoCompactionEnabled: zod.boolean(),
  autoCompactionTriggerThreshold: zod.number().int(),
  autoCompactionRetainRecentPairs: zod.number().int(),
  contentProtectionEnabled: zod.boolean(),
  privacyModeEnabled: zod.boolean(),
  notificationsEnabled: zod.boolean(),
  launchAtLoginEnabled: zod.boolean(),
  traceDebugEnabled: zod.boolean(),
  copyWithCotEnabled: zod.boolean(),
  loggingEnabled: zod.boolean(),
  showContinueIndicator: zod.boolean(),
  hideReasoningOnFinishedTurn: zod.boolean(),
});

export const SettingsChangeSchema = zod.discriminatedUnion("key", [
  zod.object({
    key: zod.literal("fontSizeLevel"),
    value: zod.number().int().min(0).max(4),
  }),
  zod.object({
    key: zod.literal("fontFamily"),
    value: zod.string(),
  }),
  zod.object({
    key: zod.literal("codeFontFamily"),
    value: zod.string(),
  }),
  zod.object({
    key: zod.literal("artifactsEffectEnabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("autoScrollEnabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("autoCompactionEnabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("autoCompactionTriggerThreshold"),
    value: zod.number().int().min(5).max(95),
  }),
  zod.object({
    key: zod.literal("autoCompactionRetainRecentPairs"),
    value: zod.number().int().min(1).max(10),
  }),
  zod.object({
    key: zod.literal("contentProtectionEnabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("privacyModeEnabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("notificationsEnabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("launchAtLoginEnabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("traceDebugEnabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("copyWithCotEnabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("loggingEnabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("showContinueIndicator"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("hideReasoningOnFinishedTurn"),
    value: zod.boolean(),
  }),
]);

export const settingsGetSnapshotRoute = defineRouteContract({
  name: "settings.getSnapshot",
  input: zod
    .object({
      keys: zod.array(SettingsKeySchema).optional(),
    })
    .default({}),
  output: zod.object({
    version: TimestampMsSchema,
    values: SettingsSnapshotValuesSchema.partial(),
  }),
});

export const settingsListSystemFontsRoute = defineRouteContract({
  name: "settings.listSystemFonts",
  input: zod.object({}).default({}),
  output: zod.object({
    fonts: zod.array(zod.string()),
  }),
});

export const settingsUpdateRoute = defineRouteContract({
  name: "settings.update",
  input: zod.object({
    changes: zod.array(SettingsChangeSchema).min(1),
  }),
  output: zod.object({
    version: TimestampMsSchema,
    changedKeys: zod.array(SettingsKeySchema).min(1),
    values: SettingsSnapshotValuesSchema.partial(),
  }),
});

export const SettingsActivityCategorySchema = zod.enum([
  "provider",
  "model",
  "mcp",
  "data",
  "privacy",
  "appearance",
  "agent",
  "knowledge",
  "prompt",
  "shortcut",
  "system",
]);

export const SettingsActivityActionSchema = zod.enum([
  "created",
  "updated",
  "enabled",
  "disabled",
  "verified",
  "refreshed",
  "backup_created",
  "imported",
  "reset",
  "repaired",
  "cleared",
  "removed",
]);

export const SettingsActivityRecordSchema = zod.object({
  id: zod.string(),
  category: SettingsActivityCategorySchema,
  action: SettingsActivityActionSchema,
  targetType: zod.string(),
  targetId: zod.string().nullable(),
  targetLabel: zod.string(),
  routeName: zod.string().nullable(),
  routeParams: zod.record(zod.string(), zod.string()),
  summaryKey: zod.string(),
  summaryParams: zod.record(zod.string(), zod.union([zod.string(), zod.number(), zod.boolean()])),
  createdAt: TimestampMsSchema,
});

export const SettingsActivityInputSchema = SettingsActivityRecordSchema.omit({
  id: true,
  createdAt: true,
}).partial({
  targetId: true,
  targetLabel: true,
  routeName: true,
  routeParams: true,
  summaryParams: true,
});

export const settingsActivityListRoute = defineRouteContract({
  name: "settings.activity.list",
  input: zod
    .object({
      limit: zod.number().int().min(1).max(200).optional(),
    })
    .default({}),
  output: zod.object({
    activities: zod.array(SettingsActivityRecordSchema),
  }),
});

export const settingsActivityRecordRoute = defineRouteContract({
  name: "settings.activity.record",
  input: SettingsActivityInputSchema,
  output: zod.object({
    activity: SettingsActivityRecordSchema,
  }),
});

export type SettingsKey = zod.infer<typeof SettingsKeySchema>;
export type SettingsSnapshotValues = zod.infer<typeof SettingsSnapshotValuesSchema>;
export type SettingsChange = zod.infer<typeof SettingsChangeSchema>;
export type SettingsActivityCategory = zod.infer<typeof SettingsActivityCategorySchema>;
export type SettingsActivityAction = zod.infer<typeof SettingsActivityActionSchema>;
export type SettingsActivityRecord = zod.infer<typeof SettingsActivityRecordSchema>;
export type SettingsActivityInput = zod.infer<typeof SettingsActivityInputSchema>;
