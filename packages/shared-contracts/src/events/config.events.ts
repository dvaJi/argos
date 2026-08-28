import zod from "zod";
import { TimestampMsSchema, defineEventContract } from "../common";
import {
  AcpAgentConfigSchema,
  LanguageDirectionSchema,
  PromptSchema,
  ShortcutKeySettingSchema,
  SystemPromptSchema,
  ThemeModeSchema,
} from "../domainSchemas";

export const configLanguageChangedEvent = defineEventContract({
  name: "config.language.changed",
  payload: zod.object({
    requestedLanguage: zod.string(),
    locale: zod.string(),
    direction: LanguageDirectionSchema,
    version: TimestampMsSchema,
  }),
});

export const configEntriesChangedEvent = defineEventContract({
  name: "config.entries.changed",
  payload: zod.object({
    changedKeys: zod.array(zod.string()).min(1),
    version: TimestampMsSchema,
  }),
});

export const configThemeChangedEvent = defineEventContract({
  name: "config.theme.changed",
  payload: zod.object({
    theme: ThemeModeSchema,
    isDark: zod.boolean(),
    version: TimestampMsSchema,
  }),
});

export const configSystemThemeChangedEvent = defineEventContract({
  name: "config.systemTheme.changed",
  payload: zod.object({
    isDark: zod.boolean(),
    version: TimestampMsSchema,
  }),
});

export const configFloatingButtonChangedEvent = defineEventContract({
  name: "config.floatingButton.changed",
  payload: zod.object({
    enabled: zod.boolean(),
    version: TimestampMsSchema,
  }),
});

export const configSyncSettingsChangedEvent = defineEventContract({
  name: "config.syncSettings.changed",
  payload: zod.object({
    enabled: zod.boolean(),
    folderPath: zod.string(),
    version: TimestampMsSchema,
  }),
});

export const configDefaultProjectPathChangedEvent = defineEventContract({
  name: "config.defaultProjectPath.changed",
  payload: zod.object({
    path: zod.string().nullable(),
    version: TimestampMsSchema,
  }),
});

export const configAgentsChangedEvent = defineEventContract({
  name: "config.agents.changed",
  payload: zod.object({
    enabled: zod.boolean(),
    agents: zod.array(AcpAgentConfigSchema),
    agentIds: zod.array(zod.string()).optional(),
    version: TimestampMsSchema,
  }),
});

export const configShortcutKeysChangedEvent = defineEventContract({
  name: "config.shortcutKeys.changed",
  payload: zod.object({
    shortcuts: ShortcutKeySettingSchema,
    version: TimestampMsSchema,
  }),
});

export const configSystemPromptsChangedEvent = defineEventContract({
  name: "config.systemPrompts.changed",
  payload: zod.object({
    prompts: zod.array(SystemPromptSchema),
    defaultPromptId: zod.string(),
    prompt: zod.string(),
    version: TimestampMsSchema,
  }),
});

export const configCustomPromptsChangedEvent = defineEventContract({
  name: "config.customPrompts.changed",
  payload: zod.object({
    prompts: zod.array(PromptSchema),
    version: TimestampMsSchema,
  }),
});
