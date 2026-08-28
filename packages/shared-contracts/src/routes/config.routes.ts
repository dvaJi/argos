import zod from "zod";
import { AgentBootstrapItemSchema, TimestampMsSchema, defineRouteContract } from "../common";
import type { Agent } from "@argos/shared/types/agent-interface";
import {
  AcpAgentConfigSchema,
  AcpAgentInstallStateSchema,
  AcpManualAgentSchema,
  AcpRegistryAgentSchema,
  BuiltinKnowledgeConfigSchema,
  ConfigValueSchema,
  ArgosAgentConfigSchema,
  LanguageDirectionSchema,
  McpServerConfigSchema,
  ModelSelectionSchema,
  PromptSchema,
  ShortcutKeySettingSchema,
  SystemPromptSchema,
  ThemeModeSchema,
} from "../domainSchemas";

const AgentInstallStateSchema = zod.looseObject({
  status: zod.enum(["not_installed", "installing", "installed", "error"]),
  distributionType: zod.enum(["binary", "npx", "uvx", "manual"]).nullable().optional(),
  version: zod.string().nullable().optional(),
  installedAt: TimestampMsSchema.nullable().optional(),
  lastCheckedAt: TimestampMsSchema.nullable().optional(),
  installDir: zod.string().nullable().optional(),
  error: zod.string().nullable().optional(),
});

const AgentSchema = AgentBootstrapItemSchema.extend({
  config: ArgosAgentConfigSchema.nullable().optional(),
  installState: AgentInstallStateSchema.nullable().optional(),
});

const ArgosAgentAvatarSchema = zod.custom<Agent["avatar"]>().nullable().optional();

const CreateArgosAgentInputSchema = zod.object({
  id: zod.string().min(1).optional(),
  name: zod.string().min(1),
  enabled: zod.boolean().optional(),
  description: zod.string().optional(),
  icon: zod.string().optional(),
  avatar: ArgosAgentAvatarSchema,
  config: ArgosAgentConfigSchema.nullable().optional(),
});

const UpdateArgosAgentInputSchema = zod.object({
  name: zod.string().min(1).optional(),
  enabled: zod.boolean().optional(),
  description: zod.string().optional(),
  icon: zod.string().optional(),
  avatar: ArgosAgentAvatarSchema,
  config: ArgosAgentConfigSchema.nullable().optional(),
});

export const CONFIG_ENTRY_KEYS = [
  "init_complete",
  "preferredModel",
  "defaultModel",
  "default_system_prompt",
  "input_deepThinking",
  "input_chatMode",
  "think_collapse",
  "artifact_think_collapse",
  "providerOrder",
  "providerTimestamps",
  "sidebar_group_mode",
  "thread_sidebar_enabled",
  "input_enabledMcpTools",
  "remoteControl",
] as const;

export const ConfigEntryKeySchema = zod.enum(CONFIG_ENTRY_KEYS);

export const ConfigEntryValuesSchema = zod.object({
  init_complete: zod.boolean(),
  preferredModel: ModelSelectionSchema,
  defaultModel: ModelSelectionSchema,
  default_system_prompt: zod.string(),
  input_deepThinking: zod.boolean(),
  input_chatMode: zod.string(),
  think_collapse: zod.boolean(),
  artifact_think_collapse: zod.boolean(),
  providerOrder: zod.array(zod.string()),
  providerTimestamps: zod.record(zod.string(), zod.number().int()),
  sidebar_group_mode: zod.string(),
  thread_sidebar_enabled: zod.boolean(),
  input_enabledMcpTools: zod.array(zod.string()),
  // Remote-control config is a large nested blob owned/validated by
  // @argos/remote-control-runtime (normalizeRemoteControlConfig). Stored
  // permissively here so the daemon config-entries route accepts it.
  remoteControl: zod.unknown(),
});

export const ConfigEntryChangeSchema = zod.discriminatedUnion("key", [
  zod.object({
    key: zod.literal("init_complete"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("preferredModel"),
    value: ModelSelectionSchema,
  }),
  zod.object({
    key: zod.literal("defaultModel"),
    value: ModelSelectionSchema,
  }),
  zod.object({
    key: zod.literal("default_system_prompt"),
    value: zod.string(),
  }),
  zod.object({
    key: zod.literal("input_deepThinking"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("input_chatMode"),
    value: zod.string(),
  }),
  zod.object({
    key: zod.literal("think_collapse"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("artifact_think_collapse"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("providerOrder"),
    value: zod.array(zod.string()),
  }),
  zod.object({
    key: zod.literal("providerTimestamps"),
    value: zod.record(zod.string(), zod.number().int()),
  }),
  zod.object({
    key: zod.literal("sidebar_group_mode"),
    value: zod.string(),
  }),
  zod.object({
    key: zod.literal("thread_sidebar_enabled"),
    value: zod.boolean(),
  }),
  zod.object({
    key: zod.literal("input_enabledMcpTools"),
    value: zod.array(zod.string()),
  }),
  zod.object({
    key: zod.literal("remoteControl"),
    value: zod.unknown(),
  }),
]);

export const configGetEntriesRoute = defineRouteContract({
  name: "config.getEntries",
  input: zod
    .object({
      keys: zod.array(ConfigEntryKeySchema).optional(),
    })
    .default({}),
  output: zod.object({
    version: TimestampMsSchema,
    values: ConfigEntryValuesSchema.partial(),
  }),
});

export const configUpdateEntriesRoute = defineRouteContract({
  name: "config.updateEntries",
  input: zod.object({
    changes: zod.array(ConfigEntryChangeSchema).min(1),
  }),
  output: zod.object({
    version: TimestampMsSchema,
    changedKeys: zod.array(ConfigEntryKeySchema).min(1),
    values: ConfigEntryValuesSchema.partial(),
  }),
});

export const configGetLanguageRoute = defineRouteContract({
  name: "config.getLanguage",
  input: zod.object({}).default({}),
  output: zod.object({
    requestedLanguage: zod.string(),
    locale: zod.string(),
    direction: LanguageDirectionSchema,
  }),
});

export const configSetLanguageRoute = defineRouteContract({
  name: "config.setLanguage",
  input: zod.object({
    language: zod.string().min(1),
  }),
  output: zod.object({
    requestedLanguage: zod.string(),
    locale: zod.string(),
    direction: LanguageDirectionSchema,
  }),
});

export const configGetThemeRoute = defineRouteContract({
  name: "config.getTheme",
  input: zod.object({}).default({}),
  output: zod.object({
    theme: ThemeModeSchema,
    isDark: zod.boolean(),
  }),
});

export const configSetThemeRoute = defineRouteContract({
  name: "config.setTheme",
  input: zod.object({
    theme: ThemeModeSchema,
  }),
  output: zod.object({
    theme: ThemeModeSchema,
    isDark: zod.boolean(),
  }),
});

export const configGetFloatingButtonRoute = defineRouteContract({
  name: "config.getFloatingButton",
  input: zod.object({}).default({}),
  output: zod.object({
    enabled: zod.boolean(),
  }),
});

export const configSetFloatingButtonRoute = defineRouteContract({
  name: "config.setFloatingButton",
  input: zod.object({
    enabled: zod.boolean(),
  }),
  output: zod.object({
    enabled: zod.boolean(),
  }),
});

export const configGetSyncSettingsRoute = defineRouteContract({
  name: "config.getSyncSettings",
  input: zod.object({}).default({}),
  output: zod.object({
    enabled: zod.boolean(),
    folderPath: zod.string(),
  }),
});

export const configUpdateSyncSettingsRoute = defineRouteContract({
  name: "config.updateSyncSettings",
  input: zod
    .object({
      enabled: zod.boolean().optional(),
      folderPath: zod.string().optional(),
    })
    .refine((input) => input.enabled !== undefined || input.folderPath !== undefined, {
      message: "At least one sync setting must be provided",
    }),
  output: zod.object({
    enabled: zod.boolean(),
    folderPath: zod.string(),
  }),
});

export const configGetDefaultProjectPathRoute = defineRouteContract({
  name: "config.getDefaultProjectPath",
  input: zod.object({}).default({}),
  output: zod.object({
    path: zod.string().nullable(),
  }),
});

export const configSetDefaultProjectPathRoute = defineRouteContract({
  name: "config.setDefaultProjectPath",
  input: zod.object({
    path: zod.string().nullable(),
  }),
  output: zod.object({
    path: zod.string().nullable(),
  }),
});

export const configGetShortcutKeysRoute = defineRouteContract({
  name: "config.getShortcutKeys",
  input: zod.object({}).default({}),
  output: zod.object({
    shortcuts: ShortcutKeySettingSchema,
  }),
});

export const configSetShortcutKeysRoute = defineRouteContract({
  name: "config.setShortcutKeys",
  input: zod.object({
    shortcuts: ShortcutKeySettingSchema,
  }),
  output: zod.object({
    shortcuts: ShortcutKeySettingSchema,
  }),
});

export const configResetShortcutKeysRoute = defineRouteContract({
  name: "config.resetShortcutKeys",
  input: zod.object({}).default({}),
  output: zod.object({
    shortcuts: ShortcutKeySettingSchema,
  }),
});

export const configListCustomPromptsRoute = defineRouteContract({
  name: "config.listCustomPrompts",
  input: zod.object({}).default({}),
  output: zod.object({
    prompts: zod.array(PromptSchema),
  }),
});

export const configSetCustomPromptsRoute = defineRouteContract({
  name: "config.setCustomPrompts",
  input: zod.object({
    prompts: zod.array(PromptSchema),
  }),
  output: zod.object({
    prompts: zod.array(PromptSchema),
  }),
});

export const configAddCustomPromptRoute = defineRouteContract({
  name: "config.addCustomPrompt",
  input: zod.object({
    prompt: PromptSchema,
  }),
  output: zod.object({
    prompts: zod.array(PromptSchema),
  }),
});

export const configUpdateCustomPromptRoute = defineRouteContract({
  name: "config.updateCustomPrompt",
  input: zod.object({
    promptId: zod.string().min(1),
    updates: PromptSchema.partial(),
  }),
  output: zod.object({
    prompts: zod.array(PromptSchema),
  }),
});

export const configDeleteCustomPromptRoute = defineRouteContract({
  name: "config.deleteCustomPrompt",
  input: zod.object({
    promptId: zod.string().min(1),
  }),
  output: zod.object({
    prompts: zod.array(PromptSchema),
  }),
});

export const configGetSystemPromptsRoute = defineRouteContract({
  name: "config.getSystemPrompts",
  input: zod.object({}).default({}),
  output: zod.object({
    prompts: zod.array(SystemPromptSchema),
    defaultPromptId: zod.string(),
  }),
});

export const configSetSystemPromptsRoute = defineRouteContract({
  name: "config.setSystemPrompts",
  input: zod.object({
    prompts: zod.array(SystemPromptSchema),
  }),
  output: zod.object({
    prompts: zod.array(SystemPromptSchema),
    defaultPromptId: zod.string(),
  }),
});

export const configAddSystemPromptRoute = defineRouteContract({
  name: "config.addSystemPrompt",
  input: zod.object({
    prompt: SystemPromptSchema,
  }),
  output: zod.object({
    prompts: zod.array(SystemPromptSchema),
    defaultPromptId: zod.string(),
  }),
});

export const configUpdateSystemPromptRoute = defineRouteContract({
  name: "config.updateSystemPrompt",
  input: zod.object({
    promptId: zod.string().min(1),
    updates: SystemPromptSchema.partial(),
  }),
  output: zod.object({
    prompts: zod.array(SystemPromptSchema),
    defaultPromptId: zod.string(),
  }),
});

export const configDeleteSystemPromptRoute = defineRouteContract({
  name: "config.deleteSystemPrompt",
  input: zod.object({
    promptId: zod.string().min(1),
  }),
  output: zod.object({
    prompts: zod.array(SystemPromptSchema),
    defaultPromptId: zod.string(),
  }),
});

export const configGetDefaultSystemPromptRoute = defineRouteContract({
  name: "config.getDefaultSystemPrompt",
  input: zod.object({}).default({}),
  output: zod.object({
    prompt: zod.string(),
    defaultPromptId: zod.string(),
  }),
});

export const configSetDefaultSystemPromptRoute = defineRouteContract({
  name: "config.setDefaultSystemPrompt",
  input: zod.object({
    prompt: zod.string(),
  }),
  output: zod.object({
    prompt: zod.string(),
    defaultPromptId: zod.string(),
  }),
});

export const configResetDefaultSystemPromptRoute = defineRouteContract({
  name: "config.resetDefaultSystemPrompt",
  input: zod.object({}).default({}),
  output: zod.object({
    prompt: zod.string(),
    defaultPromptId: zod.string(),
  }),
});

export const configClearDefaultSystemPromptRoute = defineRouteContract({
  name: "config.clearDefaultSystemPrompt",
  input: zod.object({}).default({}),
  output: zod.object({
    prompt: zod.string(),
    defaultPromptId: zod.string(),
  }),
});

export const configSetDefaultSystemPromptIdRoute = defineRouteContract({
  name: "config.setDefaultSystemPromptId",
  input: zod.object({
    promptId: zod.string().min(1),
  }),
  output: zod.object({
    prompts: zod.array(SystemPromptSchema),
    defaultPromptId: zod.string(),
    prompt: zod.string(),
  }),
});

export const configGetAcpStateRoute = defineRouteContract({
  name: "config.getAcpState",
  input: zod.object({}).default({}),
  output: zod.object({
    enabled: zod.boolean(),
    agents: zod.array(AcpAgentConfigSchema),
  }),
});

export const configListAgentsRoute = defineRouteContract({
  name: "config.listAgents",
  input: zod
    .object({
      agentType: zod.enum(["argos", "acp"]).optional(),
      ids: zod.array(zod.string().min(1)).optional(),
    })
    .default({}),
  output: zod.object({
    agents: zod.array(AgentSchema),
  }),
});

export const configResolveArgosAgentConfigRoute = defineRouteContract({
  name: "config.resolveArgosAgentConfig",
  input: zod.object({
    agentId: zod.string().min(1),
  }),
  output: zod.object({
    config: ArgosAgentConfigSchema,
  }),
});

export const configCreateArgosAgentRoute = defineRouteContract({
  name: "config.createArgosAgent",
  input: CreateArgosAgentInputSchema,
  output: zod.object({
    agent: AgentSchema,
  }),
});

export const configUpdateArgosAgentRoute = defineRouteContract({
  name: "config.updateArgosAgent",
  input: zod.object({
    agentId: zod.string().min(1),
    updates: UpdateArgosAgentInputSchema,
  }),
  output: zod.object({
    agent: AgentSchema.nullable(),
  }),
});

export const configDeleteArgosAgentRoute = defineRouteContract({
  name: "config.deleteArgosAgent",
  input: zod.object({
    agentId: zod.string().min(1),
  }),
  output: zod.object({
    removed: zod.boolean(),
  }),
});

export const configGetAgentMcpSelectionsRoute = defineRouteContract({
  name: "config.getAgentMcpSelections",
  input: zod.object({
    agentId: zod.string().min(1),
  }),
  output: zod.object({
    selections: zod.array(zod.string()),
  }),
});

export const configGetAcpSharedMcpSelectionsRoute = defineRouteContract({
  name: "config.getAcpSharedMcpSelections",
  input: zod.object({}).default({}),
  output: zod.object({
    selections: zod.array(zod.string()),
  }),
});

export const configSetAcpSharedMcpSelectionsRoute = defineRouteContract({
  name: "config.setAcpSharedMcpSelections",
  input: zod.object({
    selections: zod.array(zod.string()),
  }),
  output: zod.object({
    selections: zod.array(zod.string()),
  }),
});

export const configGetMcpServersRoute = defineRouteContract({
  name: "config.getMcpServers",
  input: zod.object({}).default({}),
  output: zod.object({
    servers: zod.record(zod.string(), McpServerConfigSchema),
  }),
});

export const configGetKnowledgeConfigsRoute = defineRouteContract({
  name: "config.getKnowledgeConfigs",
  input: zod.object({}).default({}),
  output: zod.object({
    configs: zod.array(BuiltinKnowledgeConfigSchema),
  }),
});

export const configSetKnowledgeConfigsRoute = defineRouteContract({
  name: "config.setKnowledgeConfigs",
  input: zod.object({
    configs: zod.array(BuiltinKnowledgeConfigSchema),
  }),
  output: zod.object({
    configs: zod.array(BuiltinKnowledgeConfigSchema),
  }),
});

export const configGetAcpRegistryIconMarkupRoute = defineRouteContract({
  name: "config.getAcpRegistryIconMarkup",
  input: zod.object({
    agentId: zod.string().min(1),
    iconUrl: zod.string().min(1),
  }),
  output: zod.object({
    markup: zod.string(),
  }),
});

export const configSetAcpEnabledRoute = defineRouteContract({
  name: "config.setAcpEnabled",
  input: zod.object({ enabled: zod.boolean() }),
  output: zod.object({}).default({}),
});

export const configListAcpRegistryAgentsRoute = defineRouteContract({
  name: "config.listAcpRegistryAgents",
  input: zod.object({}).default({}),
  output: zod.object({ agents: zod.array(AcpRegistryAgentSchema) }),
});

export const configRefreshAcpRegistryRoute = defineRouteContract({
  name: "config.refreshAcpRegistry",
  input: zod.object({ force: zod.boolean().optional() }).default({}),
  output: zod.object({ agents: zod.array(AcpRegistryAgentSchema) }),
});

export const configSetAcpAgentEnabledRoute = defineRouteContract({
  name: "config.setAcpAgentEnabled",
  input: zod.object({ agentId: zod.string().min(1), enabled: zod.boolean() }),
  output: zod.object({}).default({}),
});

export const configSetAcpAgentEnvOverrideRoute = defineRouteContract({
  name: "config.setAcpAgentEnvOverride",
  input: zod.object({
    agentId: zod.string().min(1),
    env: zod.record(zod.string(), zod.string()),
  }),
  output: zod.object({}).default({}),
});

export const configEnsureAcpAgentInstalledRoute = defineRouteContract({
  name: "config.ensureAcpAgentInstalled",
  input: zod.object({ agentId: zod.string().min(1) }),
  output: zod.object({ installState: AcpAgentInstallStateSchema }),
});

export const configRepairAcpAgentRoute = defineRouteContract({
  name: "config.repairAcpAgent",
  input: zod.object({ agentId: zod.string().min(1) }),
  output: zod.object({ installState: AcpAgentInstallStateSchema }),
});

export const configUpdateAcpAgentRoute = defineRouteContract({
  name: "config.updateAcpAgent",
  input: zod.object({ agentId: zod.string().min(1) }),
  output: zod.object({ installState: AcpAgentInstallStateSchema }),
});

export const configUninstallAcpRegistryAgentRoute = defineRouteContract({
  name: "config.uninstallAcpRegistryAgent",
  input: zod.object({ agentId: zod.string().min(1) }),
  output: zod.object({}).default({}),
});

export const configListManualAcpAgentsRoute = defineRouteContract({
  name: "config.listManualAcpAgents",
  input: zod.object({}).default({}),
  output: zod.object({ agents: zod.array(AcpManualAgentSchema) }),
});

export const configAddManualAcpAgentRoute = defineRouteContract({
  name: "config.addManualAcpAgent",
  input: AcpManualAgentSchema.omit({ id: true }),
  output: zod.object({ agent: AcpManualAgentSchema }),
});

export const configUpdateManualAcpAgentRoute = defineRouteContract({
  name: "config.updateManualAcpAgent",
  input: zod.object({
    agentId: zod.string().min(1),
    updates: AcpManualAgentSchema.partial(),
  }),
  output: zod.object({ agent: AcpManualAgentSchema.nullable() }),
});

export const configRemoveManualAcpAgentRoute = defineRouteContract({
  name: "config.removeManualAcpAgent",
  input: zod.object({ agentId: zod.string().min(1) }),
  output: zod.object({ removed: zod.boolean() }),
});

const VoiceAiConfigSchema = zod.object({
  audioFormat: zod.string(),
  model: zod.string(),
  language: zod.string(),
  temperature: zod.number(),
  topP: zod.number(),
  agentId: zod.string(),
});

export const configGetVoiceAiConfigRoute = defineRouteContract({
  name: "config.getVoiceAiConfig",
  input: zod.object({}).default({}),
  output: zod.object({
    config: VoiceAiConfigSchema,
  }),
});

export const configUpdateVoiceAiConfigRoute = defineRouteContract({
  name: "config.updateVoiceAiConfig",
  input: zod.object({
    updates: VoiceAiConfigSchema.partial(),
  }),
  output: zod.object({
    config: VoiceAiConfigSchema,
  }),
});

export const configGetGeminiSafetyRoute = defineRouteContract({
  name: "config.getGeminiSafety",
  input: zod.object({
    key: zod.string().min(1),
  }),
  output: zod.object({
    value: zod.string(),
  }),
});

export const configSetGeminiSafetyRoute = defineRouteContract({
  name: "config.setGeminiSafety",
  input: zod.object({
    key: zod.string().min(1),
    value: zod.enum([
      "BLOCK_NONE",
      "BLOCK_ONLY_HIGH",
      "BLOCK_MEDIUM_AND_ABOVE",
      "BLOCK_LOW_AND_ABOVE",
      "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
    ]),
  }),
  output: zod.object({
    value: zod.string(),
  }),
});

export const configGetAzureApiVersionRoute = defineRouteContract({
  name: "config.getAzureApiVersion",
  input: zod.object({}).default({}),
  output: zod.object({
    version: zod.string(),
  }),
});

export const configSetAzureApiVersionRoute = defineRouteContract({
  name: "config.setAzureApiVersion",
  input: zod.object({
    version: zod.string().min(1),
  }),
  output: zod.object({
    version: zod.string(),
  }),
});

export const configGetAwsBedrockCredentialRoute = defineRouteContract({
  name: "config.getAwsBedrockCredential",
  input: zod.object({}).default({}),
  output: zod.object({
    value: ConfigValueSchema.optional(),
  }),
});

export const configSetAwsBedrockCredentialRoute = defineRouteContract({
  name: "config.setAwsBedrockCredential",
  input: zod.object({
    credential: ConfigValueSchema,
  }),
  output: zod.object({
    value: ConfigValueSchema.optional(),
  }),
});

// --- Desktop-resident settings (updater, proxy, logging, hooks) ---
// These settings live in the desktop config store and drive Electron-only
// subsystems; each name is registered verbatim in DESKTOP_ONLY_ROUTE_PREFIXES.

export const configGetUpdateChannelRoute = defineRouteContract({
  name: "config.getUpdateChannel",
  input: zod.object({}).default({}),
  output: zod.object({
    channel: zod.string(),
  }),
});

export const configSetUpdateChannelRoute = defineRouteContract({
  name: "config.setUpdateChannel",
  input: zod.object({
    channel: zod.enum(["stable", "beta"]),
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export const configGetProxyModeRoute = defineRouteContract({
  name: "config.getProxyMode",
  input: zod.object({}).default({}),
  output: zod.object({
    mode: zod.string(),
  }),
});

export const configSetProxyModeRoute = defineRouteContract({
  name: "config.setProxyMode",
  input: zod.object({
    mode: zod.string(),
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export const configGetCustomProxyUrlRoute = defineRouteContract({
  name: "config.getCustomProxyUrl",
  input: zod.object({}).default({}),
  output: zod.object({
    url: zod.string().optional().nullable(),
  }),
});

export const configSetCustomProxyUrlRoute = defineRouteContract({
  name: "config.setCustomProxyUrl",
  input: zod.object({
    url: zod.string().optional().nullable(),
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export const configOpenLoggingFolderRoute = defineRouteContract({
  name: "config.openLoggingFolder",
  input: zod.object({}).default({}),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export const configSetMaxFileSizeRoute = defineRouteContract({
  name: "config.setMaxFileSize",
  input: zod.object({
    size: zod.number(),
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export const configGetMaxFileSizeRoute = defineRouteContract({
  name: "config.getMaxFileSize",
  input: zod.object({}).default({}),
  output: zod.object({
    size: zod.number().nullable(),
  }),
});

export const configGetSkillDraftSuggestionsEnabledRoute = defineRouteContract({
  name: "config.getSkillDraftSuggestionsEnabled",
  input: zod.object({}).default({}),
  output: zod.object({
    enabled: zod.boolean(),
  }),
});

export const configSetSkillDraftSuggestionsEnabledRoute = defineRouteContract({
  name: "config.setSkillDraftSuggestionsEnabled",
  input: zod.object({
    enabled: zod.boolean(),
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export const configGetHooksNotificationsConfigRoute = defineRouteContract({
  name: "config.getHooksNotificationsConfig",
  input: zod.object({}).default({}),
  output: zod.object({
    config: ConfigValueSchema,
  }),
});

export const configSetHooksNotificationsConfigRoute = defineRouteContract({
  name: "config.setHooksNotificationsConfig",
  input: zod.object({
    config: ConfigValueSchema,
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export const configTestHookCommandRoute = defineRouteContract({
  name: "config.testHookCommand",
  input: zod.object({
    hookId: zod.string(),
  }),
  output: zod.object({
    result: zod.unknown(),
  }),
});

export type ConfigEntryKey = zod.infer<typeof ConfigEntryKeySchema>;
export type ConfigEntryValues = zod.infer<typeof ConfigEntryValuesSchema>;
export type ConfigEntryChange = zod.infer<typeof ConfigEntryChangeSchema>;
