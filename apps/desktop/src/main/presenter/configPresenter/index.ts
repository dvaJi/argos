import { eventBus, SendTarget } from "#/eventbus";
import {
  IConfigPresenter,
  LLM_PROVIDER,
  MODEL_META,
  ModelConfig,
  ModelConfigSource,
  RENDERER_MODEL_META,
  MCPServerConfig,
  Prompt,
  SystemPrompt,
  IModelConfig,
  BuiltinKnowledgeConfig,
  AcpAgentConfig,
  AcpAgentInstallState,
  AcpAgentState,
  AcpManualAgent,
  AcpRegistryAgent,
  ProviderDbRefreshResult,
} from "@argos/shared/presenter";
import type { CloudSyncConfigView, CloudSyncConfigInput, ResolvedCloudSyncConfig } from "@argos/shared/presenter";
import { ProviderBatchUpdate } from "@argos/shared/provider-operations";
import { SearchEngineTemplate } from "@argos/shared/chat";
import {
  ModelType,
  isNewApiEndpointType,
  resolveProviderCapabilityProviderId,
  type NewApiEndpointType,
} from "@argos/shared/model";
import { resolveVideoGenerationCompatType } from "@argos/shared/videoGenerationSettings";
import {
  DEFAULT_MODEL_CAPABILITY_FALLBACKS,
  resolveDerivedModelMaxTokens,
  resolveModelContextLength,
  resolveModelFunctionCall,
  resolveModelVision,
} from "@argos/shared/modelConfigDefaults";
import ElectronStore from "electron-store";
import path from "path";
import { app, nativeTheme, shell, safeStorage } from "electron";
import fs from "fs";
import { CONFIG_EVENTS, SYSTEM_EVENTS, FLOATING_BUTTON_EVENTS, SESSION_EVENTS, MCP_EVENTS } from "#/events";
import { McpConfHelper } from "@argos/mcp-runtime";
import { presenter } from "#/presenter";
import { compare } from "compare-versions";
import { defaultShortcutKey, ShortcutKeySetting } from "./shortcutKeySettings";
import { ModelConfigHelper } from "./modelConfig";
import { KnowledgeConfHelper } from "./knowledgeConfHelper";
import { providerDbLoader } from "./providerDbLoader";
import {
  ProviderAggregate,
  ReasoningPortrait,
  type ProviderModel,
  type ReasoningEffort,
  type Verbosity,
} from "@argos/shared/types/model-db";
import { modelCapabilities } from "./modelCapabilities";
import { ProviderHelper } from "./providerHelper";
import { ModelStatusHelper } from "./modelStatusHelper";
import { ProviderModelHelper, PROVIDER_MODELS_DIR } from "./providerModelHelper";
import { SystemPromptHelper, DEFAULT_SYSTEM_PROMPT } from "./systemPromptHelper";
import { UiSettingsHelper } from "./uiSettingsHelper";
import { DEFAULT_PROVIDERS, resolveAcpAgentAlias } from "@argos/backend-core";
import { AgentRepository, BUILTIN_ARGOS_AGENT_ID } from "../agentRepository";
import { normalizeArgosSubagentConfig } from "@argos/shared/lib/argosSubagents";
import type { SettingsKey, SettingsSnapshotValues } from "@argos/shared-contracts/routes";
import { publishArgosEvent } from "#/routes/publishArgosEvent";
import { invokeDaemonRoute } from "#/routes/daemonRouteProxy";
import {
  createMcpSettingsMirror,
  createModelConfigMirror,
  createModelStatusMirror,
  createProviderModelsMirror,
  createProvidersMirror,
  registerMirror,
  DaemonMirrorStore,
  fireAndForgetDaemonWrite,
} from "./daemonMirrorStores";
import {
  configListAgentsRoute,
  configCreateArgosAgentRoute,
  configUpdateArgosAgentRoute,
  configDeleteArgosAgentRoute,
  configGetKnowledgeConfigsRoute,
  configSetKnowledgeConfigsRoute,
  configGetAcpStateRoute,
  configSetAcpEnabledRoute,
  configListAcpRegistryAgentsRoute,
  configRefreshAcpRegistryRoute,
  configGetAcpRegistryIconMarkupRoute,
  configSetAcpAgentEnabledRoute,
  configSetAcpAgentEnvOverrideRoute,
  configEnsureAcpAgentInstalledRoute,
  configRepairAcpAgentRoute,
  configUpdateAcpAgentRoute,
  configUninstallAcpRegistryAgentRoute,
  configListManualAcpAgentsRoute,
  configAddManualAcpAgentRoute,
  configUpdateManualAcpAgentRoute,
  configRemoveManualAcpAgentRoute,
  configGetAgentMcpSelectionsRoute,
  configGetAcpSharedMcpSelectionsRoute,
  configSetAcpSharedMcpSelectionsRoute,
  configListCustomPromptsRoute,
  configSetCustomPromptsRoute,
  configGetSystemPromptsRoute,
  configSetSystemPromptsRoute,
  modelsSetStatusRoute,
} from "@argos/shared-contracts/routes";
import type { HookTestResult, HooksNotificationsSettings } from "@argos/shared/hooksNotifications";
import type {
  Agent,
  AgentType,
  CreateArgosAgentInput,
  ArgosAgentConfig,
  UpdateArgosAgentInput,
} from "@argos/shared/types/agent-interface";
import type { FloatingButtonBounds } from "@argos/shared/types/floating-widget";
import { createDefaultHooksNotificationsConfig, normalizeHooksNotificationsConfig } from "../hooksNotifications/config";
import { normalizeScheduledTasksConfig } from "../scheduledTasks/normalize";
import { createDefaultScheduledTasksSettings, type ScheduledTasksSettings } from "@argos/shared/scheduledTasks";
import type { StoreLike, StoreFactory } from "@argos/backend-core";
import { createLogger } from "@argos/shared/logger";

const log = createLogger("Config");

function createElectronStoreFactory(): StoreFactory {
  return <T>(options: { name: string; defaults?: T }) => {
    return new ElectronStore<Record<string, unknown>>({
      name: options.name,
      defaults: options.defaults as Record<string, unknown> | undefined,
    }) as unknown as StoreLike<T & Record<string, unknown>>;
  };
}

// Define application settings interface
interface IAppSettings {
  // Define your configuration items here, for example:
  language: string;
  closeToQuit: boolean; // Whether to quit the program when clicking the close button
  appVersion?: string; // Used for version checking and data migration
  proxyMode?: string; // Proxy mode: system, none, custom
  customProxyUrl?: string; // Custom proxy address
  customShortKey?: ShortcutKeySetting; // Custom shortcut keys
  artifactsEffectEnabled?: boolean; // Whether artifacts animation effects are enabled
  searchPreviewEnabled?: boolean; // Whether search preview is enabled
  contentProtectionEnabled?: boolean; // Whether content protection is enabled
  privacyModeEnabled?: boolean; // Whether privacy mode is enabled
  syncEnabled?: boolean; // Whether sync functionality is enabled
  syncFolderPath?: string; // Sync folder path
  lastSyncTime?: number; // Last sync time
  customSearchEngines?: string; // Custom search engines JSON string
  copyWithCotEnabled?: boolean;
  autoCompactionEnabled?: boolean;
  autoCompactionTriggerThreshold?: number;
  autoCompactionRetainRecentPairs?: number;
  loggingEnabled?: boolean; // Whether logging is enabled
  floatingButtonEnabled?: boolean; // Whether floating button is enabled
  default_system_prompt?: string; // Default system prompt
  updateChannel?: string; // Update channel: 'stable' | 'beta'
  fontFamily?: string; // Custom UI font
  codeFontFamily?: string; // Custom code font
  skillsPath?: string; // Skills directory path
  enableSkills?: boolean; // Skills system global toggle
  skillDraftSuggestionsEnabled?: boolean; // Whether agent may propose skill drafts after tasks
  hooksNotifications?: HooksNotificationsSettings; // Hooks & notifications settings
  scheduledTasks?: ScheduledTasksSettings; // User-defined scheduled tasks
  defaultModel?: { providerId: string; modelId: string }; // Default model for new conversations
  defaultProjectPath?: string | null;
  acpRegistryMigrationVersion?: number;
  unifiedAgentsMigrationVersion?: number;
  [key: string]: unknown; // Allow arbitrary keys, using unknown type instead of any
}

// Create interface for model storage
const defaultProviders = DEFAULT_PROVIDERS.map((provider) => ({
  id: provider.id,
  name: provider.name,
  apiType: provider.apiType,
  apiKey: provider.apiKey,
  baseUrl: provider.baseUrl,
  enable: provider.enable,
  websites: provider.websites,
  models: provider.models ?? [],
  customModels: provider.customModels ?? [],
  enabledModels: provider.enabledModels ?? [],
  disabledModels: provider.disabledModels ?? [],
}));

const PROVIDERS_STORE_KEY = "providers";
const DEPRECATED_BUILTIN_PROVIDER_IDS = ["qwenlm", "laoshi"] as const;
type AnthropicLegacyProvider = LLM_PROVIDER & { authMode?: "apikey" | "oauth" };
type ModelSelection = { providerId: string; modelId: string };
type ProviderModelSettingKey = "defaultModel" | "assistantModel" | "preferredModel";
type AnthropicModelSettingKey = "defaultModel" | "assistantModel";

const ANTHROPIC_MODEL_SETTING_KEYS: AnthropicModelSettingKey[] = ["defaultModel", "assistantModel"];
const DEPRECATED_PROVIDER_MODEL_SETTING_KEYS: ProviderModelSettingKey[] = [
  "defaultModel",
  "assistantModel",
  "preferredModel",
];

const hasLegacyAnthropicOAuthState = (provider: AnthropicLegacyProvider): boolean =>
  Object.prototype.hasOwnProperty.call(provider, "authMode") || provider.oauthToken !== undefined;

const hasAnthropicApiCredential = (
  provider: AnthropicLegacyProvider,
  envApiKey = process.env.ANTHROPIC_API_KEY,
): boolean => Boolean(provider.apiKey?.trim() || envApiKey?.trim());

const isModelSelection = (value: unknown): value is ModelSelection => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.providerId === "string" && typeof record.modelId === "string";
};

const normalizeKnownModelId = (modelId: string): string => {
  const normalizedModelId = modelId.trim().toLowerCase();
  return normalizedModelId.replace(/^models\//, "");
};

const normalizeKnownProviderId = (providerId: string): string =>
  modelCapabilities.resolveProviderId(providerId.trim().toLowerCase()) || providerId.trim().toLowerCase();

const normalizeModelSelection = (value: unknown): ModelSelection | null => {
  if (!isModelSelection(value)) {
    return null;
  }

  const providerId = normalizeKnownProviderId(value.providerId);
  const modelId = value.modelId.trim();

  if (!providerId || !modelId) {
    return null;
  }

  return {
    providerId,
    modelId,
  };
};

const isDeprecatedBuiltinProviderId = (
  providerId: string,
  deprecatedProviderIds: readonly string[] = DEPRECATED_BUILTIN_PROVIDER_IDS,
): boolean => deprecatedProviderIds.includes(normalizeKnownProviderId(providerId));

const isDeprecatedBuiltinModelSelection = (
  selection: unknown,
  deprecatedProviderIds: readonly string[] = DEPRECATED_BUILTIN_PROVIDER_IDS,
): boolean => {
  const normalizedSelection = normalizeModelSelection(selection);
  return Boolean(
    normalizedSelection && isDeprecatedBuiltinProviderId(normalizedSelection.providerId, deprecatedProviderIds),
  );
};

const shouldReplaceBuiltinModelSelection = (
  builtinSelection: unknown,
  deprecatedProviderIds: readonly string[] = DEPRECATED_BUILTIN_PROVIDER_IDS,
): boolean =>
  normalizeModelSelection(builtinSelection) === null ||
  isDeprecatedBuiltinModelSelection(builtinSelection, deprecatedProviderIds);

const getLiveLegacyModelSelection = (
  value: unknown,
  deprecatedProviderIds: readonly string[] = DEPRECATED_BUILTIN_PROVIDER_IDS,
): ModelSelection | null => {
  const normalizedSelection = normalizeModelSelection(value);
  if (!normalizedSelection) {
    return null;
  }

  return isDeprecatedBuiltinProviderId(normalizedSelection.providerId, deprecatedProviderIds)
    ? null
    : normalizedSelection;
};

const toTrackedSettingsChangePayload = (
  key: string,
  value: unknown,
): { changedKey: SettingsKey; value: SettingsSnapshotValues[SettingsKey] } | null => {
  switch (key) {
    case "fontSizeLevel":
      return {
        changedKey: "fontSizeLevel",
        value: typeof value === "number" ? value : 1,
      };
    case "fontFamily":
      return {
        changedKey: "fontFamily",
        value: typeof value === "string" ? value : "",
      };
    case "codeFontFamily":
      return {
        changedKey: "codeFontFamily",
        value: typeof value === "string" ? value : "",
      };
    case "artifactsEffectEnabled":
      return {
        changedKey: "artifactsEffectEnabled",
        value: Boolean(value),
      };
    case "autoScrollEnabled":
      return {
        changedKey: "autoScrollEnabled",
        value: Boolean(value),
      };
    case "contentProtectionEnabled":
      return {
        changedKey: "contentProtectionEnabled",
        value: Boolean(value),
      };
    case "privacyModeEnabled":
      return {
        changedKey: "privacyModeEnabled",
        value: Boolean(value),
      };
    case "notificationsEnabled":
      return {
        changedKey: "notificationsEnabled",
        value: Boolean(value),
      };
    case "traceDebugEnabled":
      return {
        changedKey: "traceDebugEnabled",
        value: Boolean(value),
      };
    case "copyWithCotEnabled":
      return {
        changedKey: "copyWithCotEnabled",
        value: Boolean(value),
      };
    default:
      return null;
  }
};

export const getAnthropicModelSelectionKeysToClear = (
  settings: Partial<
    Record<AnthropicModelSettingKey | "preferredModel", { providerId: string; modelId: string } | undefined>
  >,
): AnthropicModelSettingKey[] =>
  ANTHROPIC_MODEL_SETTING_KEYS.filter((key) => {
    const selection = settings[key];
    return isModelSelection(selection) && selection.providerId === "anthropic";
  });

export const removeDeprecatedBuiltinProviders = (
  providers: LLM_PROVIDER[],
  deprecatedProviderIds: readonly string[] = DEPRECATED_BUILTIN_PROVIDER_IDS,
): LLM_PROVIDER[] => {
  const deprecatedProviderIdSet = new Set(deprecatedProviderIds);
  return providers.filter((provider) => !deprecatedProviderIdSet.has(provider.id));
};

export const getDeprecatedProviderModelSelectionKeysToClear = (
  settings: Partial<Record<ProviderModelSettingKey, { providerId: string; modelId: string } | undefined>>,
  deprecatedProviderIds: readonly string[] = DEPRECATED_BUILTIN_PROVIDER_IDS,
): ProviderModelSettingKey[] => {
  const deprecatedProviderIdSet = new Set(deprecatedProviderIds);

  return DEPRECATED_PROVIDER_MODEL_SETTING_KEYS.filter((key) => {
    const selection = settings[key];
    return isModelSelection(selection) && deprecatedProviderIdSet.has(selection.providerId);
  });
};

export const normalizeAnthropicProviderForApiOnly = (
  provider: AnthropicLegacyProvider,
  fallbackBaseUrl = "https://api.anthropic.com",
  envApiKey = process.env.ANTHROPIC_API_KEY,
): LLM_PROVIDER => {
  if (provider.id !== "anthropic") {
    return provider;
  }

  const shouldDisable = hasLegacyAnthropicOAuthState(provider) && !hasAnthropicApiCredential(provider, envApiKey);

  const normalized: AnthropicLegacyProvider = {
    ...provider,
    baseUrl: provider.baseUrl || fallbackBaseUrl,
    enable: shouldDisable ? false : provider.enable,
  };

  delete normalized.authMode;
  delete normalized.oauthToken;

  return normalized;
};

export class ConfigPresenter implements IConfigPresenter {
  private store: ElectronStore<IAppSettings>;
  private customPromptsStore: ElectronStore<{ prompts: Prompt[] }>;
  private systemPromptsStore: ElectronStore<{ prompts: SystemPrompt[] }>;
  private userDataPath: string;
  private currentAppVersion: string;
  private mcpConfHelper: McpConfHelper; // Use MCP configuration helper
  private modelConfigHelper: ModelConfigHelper; // Model configuration helper
  private knowledgeConfHelper: KnowledgeConfHelper; // Knowledge configuration helper
  private providerHelper: ProviderHelper;
  private modelStatusHelper: ModelStatusHelper;
  private providerModelHelper: ProviderModelHelper;
  private systemPromptHelper: SystemPromptHelper;
  private uiSettingsHelper: UiSettingsHelper;
  private agentRepository: AgentRepository | null = null;
  // Daemon-backed mirrors: persistence lives in the daemon; these hold sync
  // snapshots for the desktop runtime (docs/architecture/desktop-config-daemon-ownership).
  private readonly providersMirror = registerMirror(createProvidersMirror(defaultProviders));
  private readonly modelStatusMirror = registerMirror(createModelStatusMirror());
  private readonly promptsCustomMirror = registerMirror(
    new DaemonMirrorStore<{ prompts: Prompt[] }>({
      name: "custom-prompts",
      defaults: { prompts: [] },
      hydrate: async () => {
        const result = await invokeDaemonRoute<{ prompts?: Prompt[] }>(configListCustomPromptsRoute.name, {});
        return { prompts: result.prompts ?? [] };
      },
      persist: ({ next }) => {
        fireAndForgetDaemonWrite(
          "customPrompts",
          invokeDaemonRoute(configSetCustomPromptsRoute.name, { prompts: next.prompts }),
        );
      },
    }),
  );
  private readonly promptsSystemMirror = registerMirror(
    new DaemonMirrorStore<{ prompts: SystemPrompt[] }>({
      name: "system-prompts",
      defaults: {
        prompts: [
          {
            id: "default",
            name: "Argos",
            content: DEFAULT_SYSTEM_PROMPT,
            isDefault: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      },
      hydrate: async () => {
        const result = await invokeDaemonRoute<{ prompts: SystemPrompt[] }>(configGetSystemPromptsRoute.name, {});
        if (result.prompts && result.prompts.length > 0) {
          return { prompts: result.prompts };
        }
        return {
          prompts: [
            {
              id: "default",
              name: "Argos",
              content: DEFAULT_SYSTEM_PROMPT,
              isDefault: true,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        };
      },
      persist: ({ next }) => {
        fireAndForgetDaemonWrite(
          "systemPrompts",
          invokeDaemonRoute(configSetSystemPromptsRoute.name, { prompts: next.prompts }),
        );
      },
    }),
  );
  private readonly mcpSettingsMirror = registerMirror(createMcpSettingsMirror()) as unknown as DaemonMirrorStore<
    Record<string, unknown>
  >;
  // Custom prompts cache for high-frequency read operations
  private customPromptsCache: Prompt[] | null = null;

  constructor() {
    this.userDataPath = app.getPath("userData");
    this.currentAppVersion = app.getVersion();
    // Initialize application settings storage
    this.store = new ElectronStore<IAppSettings>({
      name: "app-settings",
      defaults: {
        language: "system",
        closeToQuit: false,
        customShortKey: defaultShortcutKey,
        proxyMode: "system",
        customProxyUrl: "",
        artifactsEffectEnabled: true,
        searchPreviewEnabled: true,
        contentProtectionEnabled: false,
        privacyModeEnabled: false,
        syncEnabled: false,
        syncFolderPath: path.join(this.userDataPath, "sync"),
        lastSyncTime: 0,
        copyWithCotEnabled: true,
        autoCompactionEnabled: true,
        autoCompactionTriggerThreshold: 80,
        autoCompactionRetainRecentPairs: 2,
        loggingEnabled: false,
        floatingButtonEnabled: false,
        fontFamily: "",
        codeFontFamily: "",
        default_system_prompt: "",
        skillsPath: path.join(app.getPath("home"), ".argos", "skills"),
        enableSkills: true,
        skillDraftSuggestionsEnabled: false,
        // updateChannel is not pre-filled; on first run getUpdateChannel() infers it from the current app version (avoids beta builds defaulting into the stable channel)
        appVersion: this.currentAppVersion,
        hooksNotifications: createDefaultHooksNotificationsConfig(),
        scheduledTasks: createDefaultScheduledTasksSettings(),
      },
    });

    this.providerHelper = new ProviderHelper({
      store: this.providersMirror,
      setSetting: this.setSetting.bind(this),
      defaultProviders,
    });

    this.modelStatusHelper = new ModelStatusHelper({
      store: this.modelStatusMirror,
      setSetting: this.setSetting.bind(this),
      onStatusWrite: (providerId, updates) => {
        for (const update of updates) {
          fireAndForgetDaemonWrite(
            "models.setStatus",
            invokeDaemonRoute(modelsSetStatusRoute.name, {
              providerId,
              modelId: update.modelId,
              enabled: update.enabled,
            }),
          );
        }
      },
    });

    this.initTheme();

    // Initialize custom prompts storage (daemon-backed mirror)
    this.customPromptsStore = this.promptsCustomMirror as unknown as ElectronStore<{ prompts: Prompt[] }>;

    this.systemPromptsStore = this.promptsSystemMirror as unknown as ElectronStore<{
      prompts: SystemPrompt[];
    }>;

    this.systemPromptHelper = new SystemPromptHelper({
      systemPromptsStore: this.systemPromptsStore,
      getSetting: this.getSetting.bind(this),
      setSetting: this.setSetting.bind(this),
    });

    this.uiSettingsHelper = new UiSettingsHelper({
      getSetting: this.getSetting.bind(this),
      setSetting: this.setSetting.bind(this),
    });

    // Initialize MCP configuration helper (daemon-backed mirror)
    this.mcpConfHelper = new McpConfHelper(
      ((options: { name: string }) =>
        options.name === "mcp" || options.name === "mcp-settings"
          ? this.mcpSettingsMirror
          : createMcpSettingsMirror()) as unknown as ReturnType<typeof createElectronStoreFactory>,
      {
        onChange: () => eventBus.send(MCP_EVENTS.CONFIG_CHANGED, SendTarget.ALL_WINDOWS, {}),
      },
    );

    // ACP configuration state is daemon-owned; ConfigPresenter methods proxy to
    // it via invokeDaemonRoute (docs/archives/acp-daemon-state-ownership).

    // Initialize model configuration helper (daemon-backed mirror)
    this.modelConfigHelper = new ModelConfigHelper(this.currentAppVersion, (() =>
      createModelConfigMirror()) as unknown as ReturnType<typeof createElectronStoreFactory>);

    // Initialize knowledge configuration helper
    this.knowledgeConfHelper = new KnowledgeConfHelper(createElectronStoreFactory());

    this.providerModelHelper = new ProviderModelHelper({
      userDataPath: this.userDataPath,
      getModelConfig: (modelId: string, providerId?: string) => this.getModelConfig(modelId, providerId),
      setModelStatus: this.modelStatusHelper.setModelStatus.bind(this.modelStatusHelper),
      deleteModelStatus: this.modelStatusHelper.deleteModelStatus.bind(this.modelStatusHelper),
      storeFactory: ((providerId: string) =>
        registerMirror(createProviderModelsMirror(providerId))) as unknown as ReturnType<
        typeof createElectronStoreFactory
      >,
    });
    this.providerHelper.setCleanupHooks({
      deleteProviderModelStatuses: this.modelStatusHelper.deleteProviderModelStatuses.bind(this.modelStatusHelper),
      clearProviderModelStore: this.providerModelHelper.clearProviderModelStore.bind(this.providerModelHelper),
    });

    // Initialize built-in ACP agents on first run or version upgrade
    // Initialize provider models directory
    this.initProviderModelsDir();

    // Initialize the Provider DB (external aggregated JSON, with the built-in bundle as fallback)
    providerDbLoader.setPrivacyModeResolver(() => this.getPrivacyModeEnabled());
    providerDbLoader.initialize().catch((error) => {
      log.warn("[ConfigPresenter] Failed to initialize provider DB:", error);
    });

    // If application version is updated, update appVersion
    if (this.store.get("appVersion") !== this.currentAppVersion) {
      const oldVersion = this.store.get("appVersion");
      this.store.set("appVersion", this.currentAppVersion);
      // Migrate data
      this.migrateConfigData(oldVersion);
      this.mcpConfHelper.onUpgrade(oldVersion);
    }

    // Migrate minimax provider from OpenAI format to Anthropic format
    this.migrateMinimaxProvider();
    this.migrateAnthropicProviderToApiOnly();
    this.cleanupDeprecatedBuiltinProviders();

    const existingProviders = this.getSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY) || [];
    const newProviders = defaultProviders.filter(
      (defaultProvider) => !existingProviders.some((existingProvider) => existingProvider.id === defaultProvider.id),
    );

    if (newProviders.length > 0) {
      this.setProviders([...existingProviders, ...newProviders]);
    }
  }

  setAgentRepository(agentRepository: AgentRepository): void {
    this.agentRepository = agentRepository;
    this.initializeUnifiedAgents();
    this.reconcileLegacyBuiltinAgentSelections();
    this.cleanupDeprecatedBuiltinAgentSelections();
  }

  private getSettingsStoreForKey(key: string): StoreLike<Record<string, unknown>> {
    if (key === "providers" || key.startsWith("model_status_")) {
      return (key === "providers" ? this.providersMirror : this.modelStatusMirror) as unknown as StoreLike<
        Record<string, unknown>
      >;
    }
    return this.store as unknown as StoreLike<Record<string, unknown>>;
  }

  private getAgentRepositoryOrThrow(): AgentRepository {
    if (!this.agentRepository) {
      this.agentRepository = new AgentRepository();
      this.initializeUnifiedAgents();
    }
    return this.agentRepository;
  }

  private initializeUnifiedAgents(): void {
    const repository = this.getAgentRepositoryOrThrow();

    repository.ensureBuiltinArgosAgent({
      name: "Argos",
      config: this.buildLegacyBuiltinArgosConfig(),
    });

    // Legacy desktop ACP stores are no longer migrated here: ACP configuration
    // state is daemon-owned (docs/archives/acp-daemon-state-ownership).

    // One-time: push desktop-owned custom Argos agents into the daemon so it is
    // the single source of truth for custom agents. The builtin agent stays
    // local (config-entry compat). Fire-and-forget; waits for the daemon sidecar.
    void this.migrateCustomArgosAgentsToDaemon();
    void this.migrateKnowledgeConfigsToDaemon();
  }

  /**
   * One-shot migration: built-in knowledge configs moved to the daemon store
   * (see docs/architecture/daemon-knowledge-runtime). Pushes the desktop-held
   * configs once, merging by id, and never retries after success.
   */
  private async migrateKnowledgeConfigsToDaemon(): Promise<void> {
    if (this.getSetting<number>("knowledgeConfigsMigratedToDaemon") !== undefined) {
      return;
    }
    try {
      const localConfigs = this.getKnowledgeConfigs() ?? [];
      if (localConfigs.length > 0) {
        const current = await invokeDaemonRoute<{ configs: BuiltinKnowledgeConfig[] }>(
          configGetKnowledgeConfigsRoute.name,
          {},
        );
        const daemonConfigs = current?.configs ?? [];
        const daemonIds = new Set(daemonConfigs.map((config) => config.id));
        const merged = [...daemonConfigs, ...localConfigs.filter((config) => !daemonIds.has(config.id))];
        await invokeDaemonRoute(configSetKnowledgeConfigsRoute.name, { configs: merged });
      }
      this.store.set("knowledgeConfigsMigratedToDaemon", 1);
      if (localConfigs.length > 0) {
        log.info("Knowledge configs migrated to the daemon store");
      }
    } catch (error) {
      // Daemon not ready yet or transient failure; retry on next launch.
      log.warn("Knowledge config migration deferred:", error);
    }
  }

  private async migrateCustomArgosAgentsToDaemon(): Promise<void> {
    if ((this.getSetting<number>("argosCustomAgentsMigratedToDaemon") ?? 0) !== 0) {
      return;
    }
    try {
      const customAgents = this.getAgentRepositoryOrThrow()
        .listAgents({ agentType: "argos" })
        .filter((agent) => agent.source === "manual" && agent.id !== BUILTIN_ARGOS_AGENT_ID);

      for (const agent of customAgents) {
        await invokeDaemonRoute(configCreateArgosAgentRoute.name, {
          id: agent.id,
          name: agent.name,
          enabled: agent.enabled,
          description: agent.description,
          icon: agent.icon,
          avatar: agent.avatar,
          config: agent.config,
        });
      }
      this.store.set("argosCustomAgentsMigratedToDaemon", 1);
    } catch (error) {
      // Daemon not ready yet or transient failure; retry on next launch.
      log.warn("Argos custom agent migration deferred:", error);
    }
  }

  private reconcileLegacyBuiltinAgentSelections(): void {
    const config = this.getBuiltinArgosConfig();
    const updates: Partial<ArgosAgentConfig> = {};

    const legacyDefaultModel = getLiveLegacyModelSelection(this.store.get("defaultModel") as unknown);
    if (legacyDefaultModel && shouldReplaceBuiltinModelSelection(config.defaultModelPreset)) {
      updates.defaultModelPreset = legacyDefaultModel;
    }

    const legacyAssistantModel = getLiveLegacyModelSelection(this.store.get("assistantModel") as unknown);
    if (legacyAssistantModel && shouldReplaceBuiltinModelSelection(config.assistantModel)) {
      updates.assistantModel = legacyAssistantModel;
    }

    if (Object.keys(updates).length > 0) {
      this.updateBuiltinArgosConfig(updates);
    }
  }

  private buildLegacyBuiltinArgosConfig(): ArgosAgentConfig {
    const defaultModel = this.store.get("defaultModel") as ModelSelection | undefined;
    const assistantModel = this.store.get("assistantModel") as ModelSelection | undefined;
    const autoCompactionEnabled = this.store.get("autoCompactionEnabled");
    const autoCompactionTriggerThreshold = this.store.get("autoCompactionTriggerThreshold");
    const autoCompactionRetainRecentPairs = this.store.get("autoCompactionRetainRecentPairs");

    return normalizeArgosSubagentConfig({
      defaultModelPreset:
        defaultModel?.providerId && defaultModel?.modelId
          ? {
              providerId: defaultModel.providerId,
              modelId: defaultModel.modelId,
            }
          : null,
      assistantModel:
        assistantModel?.providerId && assistantModel?.modelId
          ? {
              providerId: assistantModel.providerId,
              modelId: assistantModel.modelId,
            }
          : null,
      systemPrompt: (this.store.get("default_system_prompt") as string | undefined) ?? "",
      permissionMode: "full_access",
      disabledAgentTools: [],
      autoCompactionEnabled: typeof autoCompactionEnabled === "boolean" ? autoCompactionEnabled : true,
      autoCompactionTriggerThreshold:
        typeof autoCompactionTriggerThreshold === "number" ? autoCompactionTriggerThreshold : 80,
      autoCompactionRetainRecentPairs:
        typeof autoCompactionRetainRecentPairs === "number" ? autoCompactionRetainRecentPairs : 2,
    });
  }

  private getBuiltinArgosConfig(): ArgosAgentConfig {
    return this.agentRepository?.resolveArgosAgentConfig(BUILTIN_ARGOS_AGENT_ID) ?? {};
  }

  private updateBuiltinArgosConfig(updates: Partial<ArgosAgentConfig>): void {
    if (!this.agentRepository) {
      return;
    }

    this.agentRepository.updateArgosAgent(BUILTIN_ARGOS_AGENT_ID, {
      config: updates,
    });
    this.notifyAcpAgentsChanged();
  }

  private cleanupDeprecatedBuiltinAgentSelections(): void {
    const config = this.getBuiltinArgosConfig();
    const updates: Partial<ArgosAgentConfig> = {};

    if (isDeprecatedBuiltinModelSelection(config.defaultModelPreset)) {
      updates.defaultModelPreset = null;
    }

    if (isDeprecatedBuiltinModelSelection(config.assistantModel)) {
      updates.assistantModel = null;
    }

    if (isDeprecatedBuiltinModelSelection(config.visionModel)) {
      updates.visionModel = null;
    }

    if (isDeprecatedBuiltinModelSelection(config.imageGenerationModel)) {
      updates.imageGenerationModel = null;
    }

    if (Object.keys(updates).length > 0) {
      this.updateBuiltinArgosConfig(updates);
    }
  }

  private initProviderModelsDir(): void {
    const modelsDir = path.join(this.userDataPath, PROVIDER_MODELS_DIR);
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }
  }

  // Expose the aggregated Provider DB (read-only) to the renderer and other modules
  getProviderDb(): ProviderAggregate | null {
    return providerDbLoader.getDb();
  }

  async refreshProviderDb(force = false): Promise<ProviderDbRefreshResult> {
    return providerDbLoader.refreshIfNeeded(force);
  }

  private resolveCapabilityRoute(
    providerId: string,
    modelId: string,
  ): {
    endpointType?: NewApiEndpointType;
    supportedEndpointTypes?: NewApiEndpointType[];
    type?: ModelType;
    providerApiType?: string;
    ownedBy?: string;
  } | null {
    const providerApiType = this.providerHelper?.getProviderById?.(providerId)?.apiType;
    const modelConfig = this.getModelConfig(modelId, providerId);
    if (isNewApiEndpointType(modelConfig.endpointType)) {
      return {
        endpointType: modelConfig.endpointType,
        providerApiType,
        ownedBy: modelConfig.ownedBy,
      };
    }

    const storedModel =
      this.providerModelHelper.getProviderModels(providerId).find((model) => model.id === modelId) ??
      this.getCustomModels(providerId).find((model) => model.id === modelId);

    if (storedModel) {
      return {
        endpointType: storedModel.endpointType,
        supportedEndpointTypes: storedModel.supportedEndpointTypes,
        type: storedModel.type,
        providerApiType,
        ownedBy: storedModel.ownedBy ?? modelConfig.ownedBy,
      };
    }

    return providerApiType
      ? {
          providerApiType,
        }
      : null;
  }

  getCapabilityProviderId(providerId: string, modelId: string): string {
    return resolveProviderCapabilityProviderId(providerId, this.resolveCapabilityRoute(providerId, modelId), modelId);
  }

  supportsReasoningCapability(providerId: string, modelId: string): boolean {
    return modelCapabilities.supportsReasoning(this.getCapabilityProviderId(providerId, modelId), modelId);
  }

  private inferProviderDbModelType(model: ProviderModel): ModelType {
    const videoGenerationType = resolveVideoGenerationCompatType({
      modelId: model.id,
      type: model.type,
      modalities: model.modalities,
    });
    if (videoGenerationType) {
      return videoGenerationType;
    }

    if (Array.isArray(model.modalities?.output) && model.modalities.output.includes("image")) {
      return ModelType.ImageGeneration;
    }

    switch (model.type) {
      case "embedding":
        return ModelType.Embedding;
      case "rerank":
        return ModelType.Rerank;
      case "imageGeneration":
        return ModelType.ImageGeneration;
      case "videoGeneration":
        return ModelType.VideoGeneration;
      case "tts":
        return ModelType.TTS;
      case "chat":
      default:
        return ModelType.Chat;
    }
  }

  getReasoningPortrait(providerId: string, modelId: string): ReasoningPortrait | null {
    return modelCapabilities.getReasoningPortrait(this.getCapabilityProviderId(providerId, modelId), modelId);
  }

  getThinkingBudgetRange(providerId: string, modelId: string): { min?: number; max?: number; default?: number } {
    return modelCapabilities.getThinkingBudgetRange(this.getCapabilityProviderId(providerId, modelId), modelId);
  }

  supportsSearchCapability(providerId: string, modelId: string): boolean {
    return modelCapabilities.supportsSearch(providerId, modelId);
  }

  getTemperatureCapability(providerId: string, modelId: string): boolean | undefined {
    return modelCapabilities.getTemperatureCapability(this.getCapabilityProviderId(providerId, modelId), modelId);
  }

  supportsTemperatureControl(providerId: string, modelId: string): boolean {
    return modelCapabilities.supportsTemperatureControl(this.getCapabilityProviderId(providerId, modelId), modelId);
  }

  getSearchDefaults(
    providerId: string,
    modelId: string,
  ): { default?: boolean; forced?: boolean; strategy?: "turbo" | "max" } {
    return modelCapabilities.getSearchDefaults(providerId, modelId);
  }

  supportsAudioInputCapability(providerId: string, modelId: string): boolean {
    return modelCapabilities.supportsAudioInput(this.getCapabilityProviderId(providerId, modelId), modelId);
  }

  supportsReasoningEffortCapability(providerId: string, modelId: string): boolean {
    return modelCapabilities.supportsReasoningEffort(this.getCapabilityProviderId(providerId, modelId), modelId);
  }

  getReasoningEffortDefault(providerId: string, modelId: string): ReasoningEffort | undefined {
    return modelCapabilities.getReasoningEffortDefault(this.getCapabilityProviderId(providerId, modelId), modelId);
  }

  supportsVerbosityCapability(providerId: string, modelId: string): boolean {
    return modelCapabilities.supportsVerbosity(this.getCapabilityProviderId(providerId, modelId), modelId);
  }

  getVerbosityDefault(providerId: string, modelId: string): Verbosity | undefined {
    return modelCapabilities.getVerbosityDefault(this.getCapabilityProviderId(providerId, modelId), modelId);
  }

  private migrateConfigData(oldVersion: string | undefined): void {
    // Before version 0.2.4, minimax's baseUrl was incorrect and needs to be fixed
    if (oldVersion && compare(oldVersion, "0.2.4", "<")) {
      const providers = this.getProviders();
      for (const provider of providers) {
        if (provider.id === "minimax") {
          provider.baseUrl = "https://api.minimax.chat/v1";
          this.setProviderById("minimax", provider);
        }
      }
    }
    // Before version 0.0.10, model data was stored in app-settings.json
    if (oldVersion && compare(oldVersion, "0.0.10", "<")) {
      // Migrate old model data
      const providers = this.getProviders();

      for (const provider of providers) {
        // Check and fix ollama's baseUrl
        if (provider.id === "ollama" && provider.baseUrl) {
          if (provider.baseUrl.endsWith("/v1")) {
            provider.baseUrl = provider.baseUrl.replace(/\/v1$/, "");
            // Save the modified provider
            this.setProviderById("ollama", provider);
          }
        }

        // Migrate provider models
        const oldProviderModelsKey = `${provider.id}_models`;
        const oldModels = this.getSetting<(MODEL_META & { enabled: boolean })[]>(oldProviderModelsKey);

        if (oldModels && oldModels.length > 0) {
          const store = this.providerModelHelper.getProviderModelStore(provider.id);
          // Iterate through old models, save enabled state
          oldModels.forEach((model) => {
            if (model.enabled) {
              this.setModelStatus(provider.id, model.id, true);
            }
            // @ts-ignore - Need to delete enabled property for independent state storage
            delete model.enabled;
          });
          // Save model list to new storage
          store.set("models", oldModels);
          // Clear old storage
          this.store.delete(oldProviderModelsKey);
        }

        // Migrate custom models
        const oldCustomModelsKey = `custom_models_${provider.id}`;
        const oldCustomModels = this.getSetting<(MODEL_META & { enabled: boolean })[]>(oldCustomModelsKey);

        if (oldCustomModels && oldCustomModels.length > 0) {
          const store = this.providerModelHelper.getProviderModelStore(provider.id);
          // Iterate through old custom models, save enabled state
          oldCustomModels.forEach((model) => {
            if (model.enabled) {
              this.setModelStatus(provider.id, model.id, true);
            }
            // @ts-ignore - Need to delete enabled property for independent state storage
            delete model.enabled;
          });
          // Save custom model list to new storage
          store.set("custom_models", oldCustomModels);
          // Clear old storage
          this.store.delete(oldCustomModelsKey);
        }
      }
    }

    // Before version 0.0.17, need to remove qwenlm provider
    if (oldVersion && compare(oldVersion, "0.0.17", "<")) {
      // Get all current providers
      const providers = this.getProviders();

      // Filter out qwenlm provider
      const filteredProviders = providers.filter((provider) => provider.id !== "qwenlm");

      // If filtered count differs, there was removal operation, need to save updated provider list
      if (filteredProviders.length !== providers.length) {
        this.setProviders(filteredProviders);
      }
    }

    // Before version 0.3.5, handle migration and settings of default system prompt
    if (oldVersion && compare(oldVersion, "0.3.5", "<")) {
      try {
        const currentPrompt = this.getSetting<string>("default_system_prompt");
        if (!currentPrompt || currentPrompt.trim() === "") {
          this.setSetting("default_system_prompt", DEFAULT_SYSTEM_PROMPT);
        }
        const legacyDefault = this.getSetting<string>("default_system_prompt");
        if (
          typeof legacyDefault === "string" &&
          legacyDefault.trim() &&
          legacyDefault.trim() !== DEFAULT_SYSTEM_PROMPT.trim()
        ) {
          const prompts = (this.systemPromptsStore.get("prompts") || []) as SystemPrompt[];
          const now = Date.now();
          const idx = prompts.findIndex((p) => p.id === "default");
          if (idx !== -1) {
            prompts[idx] = {
              ...prompts[idx],
              content: legacyDefault,
              isDefault: true,
              updatedAt: now,
            };
          } else {
            prompts.push({
              id: "default",
              name: "Argos",
              content: legacyDefault,
              isDefault: true,
              createdAt: now,
              updatedAt: now,
            });
          }
          this.systemPromptsStore.set("prompts", prompts);
        }
      } catch (e) {
        log.warn("Failed to migrate legacy default_system_prompt:", e);
      }
    }

    // Before version 0.5.8, split OpenAI Responses and OpenAI Completions semantics
    if (oldVersion && compare(oldVersion, "0.5.8", "<")) {
      const providers = this.getProviders();
      let hasChanges = false;

      const migratedProviders = providers.map((provider) => {
        if (provider.apiType === "openai-compatible") {
          hasChanges = true;
          return { ...provider, apiType: "openai-completions" };
        }

        if (provider.id !== "openai" && provider.id !== "minimax" && provider.apiType === "openai") {
          hasChanges = true;
          return { ...provider, apiType: "openai-completions" };
        }

        return provider;
      });

      if (hasChanges) {
        this.setProviders(migratedProviders);
      }
    }
  }

  private migrateMinimaxProvider(): void {
    const providers = this.getProviders();
    const legacyMinimax = providers.find(
      (provider) => provider.id === "minimax" && (provider.apiType === "openai" || provider.apiType === "minimax"),
    );

    if (!legacyMinimax) {
      return;
    }

    const defaultMinimax = defaultProviders.find((provider) => provider.id === "minimax");
    if (!defaultMinimax) {
      return;
    }

    const updatedProvider: LLM_PROVIDER = {
      ...defaultMinimax,
      apiKey: legacyMinimax.apiKey,
    };

    this.setProviderById("minimax", updatedProvider);

    if (providers.some((provider) => provider.id === "minimax-an")) {
      const filteredProviders = this.getProviders().filter((provider) => provider.id !== "minimax-an");
      this.setProviders(filteredProviders);
    }
  }

  private migrateAnthropicProviderToApiOnly(): void {
    const providers = this.getProviders();
    const defaultAnthropic = defaultProviders.find((provider) => provider.id === "anthropic");
    const fallbackBaseUrl = defaultAnthropic?.baseUrl || "https://api.anthropic.com";
    const envApiKey = process.env.ANTHROPIC_API_KEY;
    let hasChanges = false;
    let shouldClearAnthropicSelections = false;

    const normalizedProviders = providers.map((provider) => {
      if (provider.id !== "anthropic") {
        return provider;
      }

      const legacyProvider = provider as AnthropicLegacyProvider;
      const normalized = normalizeAnthropicProviderForApiOnly(legacyProvider, fallbackBaseUrl, envApiKey);
      const shouldDisableForMissingCredential =
        hasLegacyAnthropicOAuthState(legacyProvider) && !hasAnthropicApiCredential(legacyProvider, envApiKey);

      if (
        hasLegacyAnthropicOAuthState(legacyProvider) ||
        normalized.enable !== legacyProvider.enable ||
        normalized.baseUrl !== legacyProvider.baseUrl
      ) {
        hasChanges = true;
      }

      if (shouldDisableForMissingCredential) {
        shouldClearAnthropicSelections = true;
      }

      return normalized;
    });

    if (hasChanges) {
      this.setProviders(normalizedProviders);
    }

    if (shouldClearAnthropicSelections) {
      const keysToClear = getAnthropicModelSelectionKeysToClear({
        defaultModel: this.getSetting("defaultModel"),
        assistantModel: this.getSetting("assistantModel"),
        preferredModel: this.getSetting("preferredModel"),
      });

      for (const key of keysToClear) {
        this.store.delete(key);
        eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, key, undefined);
      }
    }
  }

  private cleanupDeprecatedBuiltinProviders(): void {
    const providers = this.getProviders();
    const filteredProviders = removeDeprecatedBuiltinProviders(providers);

    if (filteredProviders.length !== providers.length) {
      this.setProviders(filteredProviders);
    }

    const keysToClear = getDeprecatedProviderModelSelectionKeysToClear({
      defaultModel: this.store.get("defaultModel") as ModelSelection | undefined,
      assistantModel: this.store.get("assistantModel") as ModelSelection | undefined,
      preferredModel: this.store.get("preferredModel") as ModelSelection | undefined,
    });

    for (const key of keysToClear) {
      this.store.delete(key);
      eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, key, undefined);
    }
  }

  getSetting<T>(key: string): T | undefined {
    try {
      if (this.agentRepository) {
        if (key === "defaultModel") {
          return this.getDefaultModel() as T | undefined;
        }
        if (key === "assistantModel") {
          return this.getBuiltinArgosConfig().assistantModel as T | undefined;
        }
        if (key === "default_system_prompt") {
          return this.getBuiltinArgosConfig().systemPrompt as T | undefined;
        }
      }
      if (key === "providers") {
        return this.providersMirror.get("providers") as T | undefined;
      }
      if (key.startsWith("model_status_")) {
        return this.modelStatusMirror.get(key) as T | undefined;
      }
      return this.getSettingsStoreForKey(key).get<T>(key);
    } catch (error) {
      log.error(`Failed to get setting ${key}:`, error);
      return undefined;
    }
  }

  setSetting<T>(key: string, value: T): void {
    try {
      if (this.agentRepository) {
        if (key === "defaultModel") {
          this.setDefaultModel(value as { providerId: string; modelId: string } | undefined);
          return;
        }
        if (key === "assistantModel") {
          this.updateBuiltinArgosConfig({
            assistantModel: value as { providerId: string; modelId: string } | null | undefined,
          });
          eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, key, value);
          return;
        }
        if (key === "default_system_prompt") {
          this.updateBuiltinArgosConfig({
            systemPrompt: typeof value === "string" ? value : "",
          });
          eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, key, value);
          return;
        }
      }

      if (key === "providers") {
        this.providersMirror.set("providers", value as unknown as LLM_PROVIDER[]);
        eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, key, value);
        return;
      }
      if (key.startsWith("model_status_")) {
        this.modelStatusMirror.set(key, value);
        eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, key, value);
        return;
      }

      this.getSettingsStoreForKey(key).set(key, value);
      // Trigger setting change event (main process internal use only)
      eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, key, value);

      // Special handling: font size settings need to notify all tabs
      if (key === "fontSizeLevel") {
        eventBus.sendToRenderer(CONFIG_EVENTS.FONT_SIZE_CHANGED, SendTarget.ALL_WINDOWS, value);
      }

      const trackedChange = toTrackedSettingsChangePayload(key, value);
      if (trackedChange) {
        publishArgosEvent("settings.changed", {
          changedKeys: [trackedChange.changedKey],
          version: Date.now(),
          values: {
            [trackedChange.changedKey]: trackedChange.value,
          } as Partial<SettingsSnapshotValues>,
        });
      }
    } catch (error) {
      log.error(`Failed to set setting ${key}:`, error);
    }
  }

  getProviders(): LLM_PROVIDER[] {
    return this.providerHelper.getProviders();
  }

  setProviders(providers: LLM_PROVIDER[]): void {
    this.providerHelper.setProviders(providers);
  }

  getProviderById(id: string): LLM_PROVIDER | undefined {
    return this.providerHelper.getProviderById(id);
  }

  setProviderById(id: string, provider: LLM_PROVIDER): void {
    this.providerHelper.setProviderById(id, provider);
  }

  /**
   * Atomic operation: update a single provider configuration
   * @param id Provider ID
   * @param updates Fields to update
   * @returns Whether the instance needs to be rebuilt
   */
  updateProviderAtomic(id: string, updates: Partial<LLM_PROVIDER>): boolean {
    return this.providerHelper.updateProviderAtomic(id, updates);
  }

  /**
   * Atomic operation: batch update providers
   * @param batchUpdate Batch update request
   */
  updateProvidersBatch(batchUpdate: ProviderBatchUpdate): void {
    this.providerHelper.updateProvidersBatch(batchUpdate);
  }

  /**
   * Atomic operation: add a provider
   * @param provider The new provider
   */
  addProviderAtomic(provider: LLM_PROVIDER): void {
    this.providerHelper.addProviderAtomic(provider);
  }

  /**
   * Atomic operation: remove a provider
   * @param providerId Provider ID
   */
  removeProviderAtomic(providerId: string): void {
    this.providerHelper.removeProviderAtomic(providerId);
  }

  /**
   * Atomic operation: reorder providers
   * @param providers The new provider ordering
   */
  reorderProvidersAtomic(providers: LLM_PROVIDER[]): void {
    this.providerHelper.reorderProvidersAtomic(providers);
  }

  getModelStatus(providerId: string, modelId: string): boolean {
    return this.modelStatusHelper.getModelStatus(providerId, modelId);
  }

  getBatchModelStatus(providerId: string, modelIds: string[]): Record<string, boolean> {
    return this.modelStatusHelper.getBatchModelStatus(providerId, modelIds);
  }

  setModelStatus(providerId: string, modelId: string, enabled: boolean): void {
    this.modelStatusHelper.setModelStatus(providerId, modelId, enabled);
  }

  ensureModelStatus(providerId: string, modelId: string, enabled: boolean): void {
    this.modelStatusHelper.ensureModelStatus(providerId, modelId, enabled);
  }

  enableModel(providerId: string, modelId: string): void {
    this.modelStatusHelper.enableModel(providerId, modelId);
  }

  disableModel(providerId: string, modelId: string): void {
    this.modelStatusHelper.disableModel(providerId, modelId);
  }

  clearModelStatusCache(): void {
    this.modelStatusHelper.clearModelStatusCache();
  }

  clearProviderModelStatusCache(providerId: string): void {
    this.modelStatusHelper.clearProviderModelStatusCache(providerId);
  }

  batchSetModelStatus(providerId: string, modelStatusMap: Record<string, boolean>): void {
    this.modelStatusHelper.batchSetModelStatus(providerId, modelStatusMap);
  }

  batchSetModelStatusQuiet(providerId: string, modelStatusMap: Record<string, boolean>): void {
    this.modelStatusHelper.batchSetModelStatusQuiet(providerId, modelStatusMap);
  }

  getProviderModels(providerId: string): MODEL_META[] {
    const models = this.providerModelHelper.getProviderModels(providerId);
    return models.map((model) => {
      const capabilityProviderId = resolveProviderCapabilityProviderId(
        providerId,
        {
          endpointType: model.endpointType,
          supportedEndpointTypes: model.supportedEndpointTypes,
          type: model.type,
          providerApiType: this.providerHelper?.getProviderById?.(providerId)?.apiType,
          ownedBy: model.ownedBy,
        },
        model.id,
      );

      if (capabilityProviderId === providerId) {
        return model;
      }

      return {
        ...model,
        reasoning: model.reasoning === true || modelCapabilities.supportsReasoning(capabilityProviderId, model.id),
      };
    });
  }

  // Canonical models derived from the aggregated Provider DB (read-only mapping, not persisted)
  getDbProviderModels(providerId: string): RENDERER_MODEL_META[] {
    const db = providerDbLoader.getDb();
    const resolvedId = modelCapabilities.resolveProviderId(providerId.toLowerCase()) || providerId.toLowerCase();
    const provider = db?.providers?.[resolvedId];
    if (!provider || !Array.isArray(provider.models)) return [];
    return provider.models.map((m) => ({
      id: m.id,
      name: m.display_name || m.name || m.id,
      contextLength: resolveModelContextLength(m.limit?.context),
      maxTokens: resolveDerivedModelMaxTokens(m.limit?.output),
      provider: providerId,
      providerId,
      group: "default",
      enabled: false,
      isCustom: false,
      vision: resolveModelVision(
        Array.isArray(m?.modalities?.input) ? m.modalities!.input!.includes("image") : undefined,
      ),
      functionCall: resolveModelFunctionCall(m.tool_call),
      reasoning: this.supportsReasoningCapability(providerId, m.id),
      type: this.inferProviderDbModelType(m),
    }));
  }

  getModelDefaultConfig(modelId: string, providerId?: string): ModelConfig {
    const model = this.getModelConfig(modelId, providerId);
    if (model) {
      return model;
    }
    return {
      ...DEFAULT_MODEL_CAPABILITY_FALLBACKS,
      temperature: 0.6,
      type: ModelType.Chat,
    };
  }

  setProviderModels(providerId: string, models: MODEL_META[]): void {
    this.providerModelHelper.setProviderModels(providerId, models);
  }

  getEnabledProviders(): LLM_PROVIDER[] {
    return this.providerHelper.getEnabledProviders();
  }

  getAllEnabledModels(): Promise<{ providerId: string; models: RENDERER_MODEL_META[] }[]> {
    const enabledProviders = this.getEnabledProviders();
    return Promise.all(
      enabledProviders.map(async (provider) => {
        const providerId = provider.id;
        const allModels = [...this.getProviderModels(providerId), ...this.getCustomModels(providerId)];

        // Batch get model states
        const modelIds = allModels.map((model) => model.id);
        const modelStatusMap = this.getBatchModelStatus(providerId, modelIds);

        // Filter enabled models based on batch retrieved states
        const enabledModels = allModels
          .filter((model) => modelStatusMap[model.id])
          .map((model) => ({
            ...model,
            enabled: true,
            // Ensure capability properties are copied
            vision: model.vision || false,
            functionCall: model.functionCall || false,
            reasoning: model.reasoning || false,
          }));

        return {
          providerId,
          models: enabledModels,
        };
      }),
    );
  }

  getCustomModels(providerId: string): MODEL_META[] {
    return this.providerModelHelper.getCustomModels(providerId);
  }

  isKnownModel(providerId: string, modelId: string): boolean {
    const normalizedProviderId = normalizeKnownProviderId(providerId);
    const normalizedModelId = normalizeKnownModelId(modelId);

    if (!normalizedProviderId || !normalizedModelId) {
      return false;
    }

    const hasKnownModel = (models: Array<{ id: string }> | undefined): boolean =>
      Array.isArray(models) && models.some((model) => normalizeKnownModelId(model.id) === normalizedModelId);

    return (
      this.hasUserModelConfig(normalizedModelId, normalizedProviderId) ||
      hasKnownModel(this.getProviderModels(normalizedProviderId)) ||
      hasKnownModel(this.getCustomModels(normalizedProviderId)) ||
      hasKnownModel(this.getDbProviderModels(normalizedProviderId))
    );
  }

  setCustomModels(providerId: string, models: MODEL_META[]): void {
    this.providerModelHelper.setCustomModels(providerId, models);
  }

  addCustomModel(providerId: string, model: MODEL_META): void {
    this.providerModelHelper.addCustomModel(providerId, model);
  }

  removeCustomModel(providerId: string, modelId: string): void {
    this.providerModelHelper.removeCustomModel(providerId, modelId);
  }

  updateCustomModel(providerId: string, modelId: string, updates: Partial<MODEL_META>): void {
    this.providerModelHelper.updateCustomModel(providerId, modelId, updates);
  }

  getCloseToQuit(): boolean {
    return this.getSetting<boolean>("closeToQuit") ?? false;
  }

  setCloseToQuit(value: boolean): void {
    this.setSetting("closeToQuit", value);
  }

  // Get application current language, considering system language settings
  getLanguage(): string {
    const language = this.getSetting<string>("language") || "system";

    if (language !== "system") {
      return language;
    }

    return this.getSystemLanguage();
  }

  // Set application language
  setLanguage(language: string): void {
    this.setSetting("language", language);
    // Trigger language change event (need to notify all tabs)
    eventBus.send(CONFIG_EVENTS.LANGUAGE_CHANGED, SendTarget.ALL_WINDOWS, language);

    try {
      presenter.floatingButtonPresenter.refreshLanguage();
    } catch (error) {
      log.error("Failed to refresh floating widget language:", error);
    }
  }

  // Get system language and match supported language list
  private getSystemLanguage(): string {
    const systemLang = app.getLocale();
    const supportedLanguages = [
      "zh-CN",
      "zh-TW",
      "en-US",
      "zh-HK",
      "ko-KR",
      "ru-RU",
      "ja-JP",
      "fr-FR",
      "fa-IR",
      "pt-BR",
      "da-DK",
      "he-IL",
      "es-ES",
      "de-DE",
      "tr-TR",
      "id-ID",
      "ms-MY",
      "it-IT",
      "pl-PL",
      "vi-VN",
    ];

    // Exact match
    if (supportedLanguages.includes(systemLang)) {
      return systemLang;
    }

    // Partial match (only match language code)
    const langCode = systemLang.split("-")[0];
    const matchedLang = supportedLanguages.find((lang) => lang.startsWith(langCode));
    if (matchedLang) {
      return matchedLang;
    }

    // Default return English
    return "en-US";
  }

  public getDefaultProviders(): LLM_PROVIDER[] {
    return this.providerHelper.getDefaultProviders();
  }

  // Get proxy mode
  getProxyMode(): string {
    return this.getSetting<string>("proxyMode") || "system";
  }

  // Set proxy mode
  setProxyMode(mode: string): void {
    this.setSetting("proxyMode", mode);
    eventBus.sendToMain(CONFIG_EVENTS.PROXY_MODE_CHANGED, mode);
  }

  // Get custom proxy address
  getCustomProxyUrl(): string {
    return this.getSetting<string>("customProxyUrl") || "";
  }

  // Set custom proxy address
  setCustomProxyUrl(url: string): void {
    this.setSetting("customProxyUrl", url);
    eventBus.sendToMain(CONFIG_EVENTS.CUSTOM_PROXY_URL_CHANGED, url);
  }

  // Get sync function status
  getSyncEnabled(): boolean {
    return this.getSetting<boolean>("syncEnabled") || false;
  }

  // Get log folder path
  getLoggingFolderPath(): string {
    return path.join(this.userDataPath, "logs");
  }

  // Open log folder
  async openLoggingFolder(): Promise<void> {
    const loggingFolderPath = this.getLoggingFolderPath();

    // If folder doesn't exist, create it first
    if (!fs.existsSync(loggingFolderPath)) {
      fs.mkdirSync(loggingFolderPath, { recursive: true });
    }

    // Open folder
    await shell.openPath(loggingFolderPath);
  }

  // Set sync function status
  setSyncEnabled(enabled: boolean): void {
    log.info("setSyncEnabled", enabled);
    this.setSetting("syncEnabled", enabled);
    eventBus.send(CONFIG_EVENTS.SYNC_SETTINGS_CHANGED, SendTarget.ALL_WINDOWS, { enabled });
  }

  // Get sync folder path
  getSyncFolderPath(): string {
    return this.getSetting<string>("syncFolderPath") || path.join(app.getPath("home"), "ArgosSync");
  }

  // Set sync folder path
  setSyncFolderPath(folderPath: string): void {
    this.setSetting("syncFolderPath", folderPath);
    eventBus.send(CONFIG_EVENTS.SYNC_SETTINGS_CHANGED, SendTarget.ALL_WINDOWS, { folderPath });
  }

  // Get last sync time
  getLastSyncTime(): number {
    return this.getSetting<number>("lastSyncTime") || 0;
  }

  // Set last sync time
  setLastSyncTime(time: number): void {
    this.setSetting("lastSyncTime", time);
  }

  // === Cloud sync (S3-compatible) settings ===
  // Non-sensitive fields live in app-settings; the secret is encrypted via safeStorage.
  private readonly CLOUD_SYNC_BASE_KEY = "cloudSyncConfig";
  private readonly CLOUD_SYNC_SECRET_KEY = "cloudSyncSecret";

  isCloudSafeStorageAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  private getCloudSyncBase(): {
    enabled: boolean;
    endpoint: string;
    bucket: string;
    region: string;
    prefix: string;
    accessKeyId: string;
  } {
    const stored = this.getSetting<{
      enabled?: boolean;
      endpoint?: string;
      bucket?: string;
      region?: string;
      prefix?: string;
      accessKeyId?: string;
    }>(this.CLOUD_SYNC_BASE_KEY);
    return {
      enabled: stored?.enabled ?? false,
      endpoint: stored?.endpoint ?? "",
      bucket: stored?.bucket ?? "",
      region: stored?.region ?? "auto",
      prefix: stored?.prefix ?? "argos-backups",
      accessKeyId: stored?.accessKeyId ?? "",
    };
  }

  private getCloudSyncSecret(): string {
    const wrapped = this.getSetting<string>(this.CLOUD_SYNC_SECRET_KEY);
    if (!wrapped) {
      return "";
    }
    try {
      return safeStorage.decryptString(Buffer.from(wrapped, "base64"));
    } catch (error) {
      log.error("Failed to decrypt cloud sync secret:", error);
      return "";
    }
  }

  getCloudSyncConfig(): CloudSyncConfigView {
    const base = this.getCloudSyncBase();
    return {
      ...base,
      hasSecret: Boolean(this.getCloudSyncSecret()),
      safeStorageAvailable: this.isCloudSafeStorageAvailable(),
    };
  }

  private setCloudSyncSetting<T>(key: string, value: T): void {
    this.getSettingsStoreForKey(key).set(key, value);
    eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, key, value);
  }

  private deleteCloudSyncSetting(key: string): void {
    this.getSettingsStoreForKey(key).delete(key);
    eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, key, undefined);
  }

  setCloudSyncConfig(config: CloudSyncConfigInput): CloudSyncConfigView {
    const current = this.getCloudSyncBase();
    const next = {
      enabled: config.enabled ?? current.enabled,
      endpoint: config.endpoint ?? current.endpoint,
      bucket: config.bucket ?? current.bucket,
      region: config.region ?? current.region,
      prefix: config.prefix ?? current.prefix,
      accessKeyId: config.accessKeyId ?? current.accessKeyId,
    };

    // Only update the secret when a non-empty value is provided; empty/undefined keeps the existing one.
    const currentWrappedSecret = this.getSetting<string>(this.CLOUD_SYNC_SECRET_KEY);
    let nextWrappedSecret: string | undefined;
    if (typeof config.secretAccessKey === "string" && config.secretAccessKey.length > 0) {
      if (!this.isCloudSafeStorageAvailable()) {
        throw new Error("sync.error.safeStorageUnavailable");
      }
      nextWrappedSecret = Buffer.from(safeStorage.encryptString(config.secretAccessKey)).toString("base64");
    }

    let secretWritten = false;
    try {
      if (nextWrappedSecret !== undefined) {
        this.setCloudSyncSetting(this.CLOUD_SYNC_SECRET_KEY, nextWrappedSecret);
        secretWritten = true;
      }
      this.setCloudSyncSetting(this.CLOUD_SYNC_BASE_KEY, next);
    } catch (error) {
      if (secretWritten) {
        try {
          if (currentWrappedSecret) {
            this.setCloudSyncSetting(this.CLOUD_SYNC_SECRET_KEY, currentWrappedSecret);
          } else {
            this.deleteCloudSyncSetting(this.CLOUD_SYNC_SECRET_KEY);
          }
        } catch (rollbackError) {
          log.error("Failed to rollback cloud sync secret:", rollbackError);
        }
      }
      throw error;
    }

    return this.getCloudSyncConfig();
  }

  getResolvedCloudSyncConfig(): ResolvedCloudSyncConfig | null {
    const base = this.getCloudSyncBase();
    const secretAccessKey = this.getCloudSyncSecret();
    if (!base.endpoint || !base.bucket || !base.accessKeyId || !secretAccessKey) {
      return null;
    }
    return {
      endpoint: base.endpoint,
      bucket: base.bucket,
      region: base.region,
      prefix: base.prefix,
      accessKeyId: base.accessKeyId,
      secretAccessKey,
    };
  }

  // Skills settings
  getSkillsEnabled(): boolean {
    return this.getSetting<boolean>("enableSkills") ?? true;
  }

  setSkillsEnabled(enabled: boolean): void {
    this.setSetting("enableSkills", enabled);
  }

  getSkillDraftSuggestionsEnabled(): boolean {
    return this.getSetting<boolean>("skillDraftSuggestionsEnabled") ?? false;
  }

  setSkillDraftSuggestionsEnabled(enabled: boolean): void {
    this.setSetting("skillDraftSuggestionsEnabled", enabled);
  }

  getSkillsPath(): string {
    return this.getSetting<string>("skillsPath") || path.join(app.getPath("home"), ".argos", "skills");
  }

  setSkillsPath(skillsPath: string): void {
    this.setSetting("skillsPath", skillsPath);
  }

  getSkillSettings(): {
    skillsPath: string;
    enableSkills: boolean;
    skillDraftSuggestionsEnabled: boolean;
  } {
    return {
      skillsPath: this.getSkillsPath(),
      enableSkills: this.getSkillsEnabled(),
      skillDraftSuggestionsEnabled: this.getSkillDraftSuggestionsEnabled(),
    };
  }

  // Get custom search engines
  async getCustomSearchEngines(): Promise<SearchEngineTemplate[]> {
    try {
      const customEnginesJson = this.store.get("customSearchEngines");
      if (customEnginesJson) {
        return JSON.parse(customEnginesJson as string);
      }
      return [];
    } catch (error) {
      log.error("Failed to get custom search engines:", error);
      return [];
    }
  }

  // Set custom search engines
  async setCustomSearchEngines(engines: SearchEngineTemplate[]): Promise<void> {
    try {
      this.store.set("customSearchEngines", JSON.stringify(engines));
      // Send event to notify search engine update (need to notify all tabs)
      eventBus.send(CONFIG_EVENTS.SEARCH_ENGINES_UPDATED, SendTarget.ALL_WINDOWS, engines);
    } catch (error) {
      log.error("Failed to set custom search engines:", error);
      throw error;
    }
  }

  // Get search preview setting status
  getSearchPreviewEnabled(): Promise<boolean> {
    return this.uiSettingsHelper.getSearchPreviewEnabled();
  }

  setSearchPreviewEnabled(enabled: boolean): void {
    this.uiSettingsHelper.setSearchPreviewEnabled(enabled);
  }

  getAutoScrollEnabled(): boolean {
    return this.uiSettingsHelper.getAutoScrollEnabled();
  }

  setAutoScrollEnabled(enabled: boolean): void {
    this.uiSettingsHelper.setAutoScrollEnabled(enabled);
  }

  getAutoCompactionEnabled(): boolean {
    return this.getBuiltinArgosConfig().autoCompactionEnabled ?? this.uiSettingsHelper.getAutoCompactionEnabled();
  }

  setAutoCompactionEnabled(enabled: boolean): void {
    const nextValue = Boolean(enabled);
    this.updateBuiltinArgosConfig({
      autoCompactionEnabled: nextValue,
    });
    publishArgosEvent("settings.changed", {
      changedKeys: ["autoCompactionEnabled"],
      version: Date.now(),
      values: {
        autoCompactionEnabled: nextValue,
      },
    });
  }

  getAutoCompactionTriggerThreshold(): number {
    return (
      this.getBuiltinArgosConfig().autoCompactionTriggerThreshold ??
      this.uiSettingsHelper.getAutoCompactionTriggerThreshold()
    );
  }

  setAutoCompactionTriggerThreshold(threshold: number): void {
    this.updateBuiltinArgosConfig({
      autoCompactionTriggerThreshold: threshold,
    });
    publishArgosEvent("settings.changed", {
      changedKeys: ["autoCompactionTriggerThreshold"],
      version: Date.now(),
      values: {
        autoCompactionTriggerThreshold: this.getAutoCompactionTriggerThreshold(),
      },
    });
  }

  getAutoCompactionRetainRecentPairs(): number {
    return (
      this.getBuiltinArgosConfig().autoCompactionRetainRecentPairs ??
      this.uiSettingsHelper.getAutoCompactionRetainRecentPairs()
    );
  }

  setAutoCompactionRetainRecentPairs(count: number): void {
    this.updateBuiltinArgosConfig({
      autoCompactionRetainRecentPairs: count,
    });
    publishArgosEvent("settings.changed", {
      changedKeys: ["autoCompactionRetainRecentPairs"],
      version: Date.now(),
      values: {
        autoCompactionRetainRecentPairs: this.getAutoCompactionRetainRecentPairs(),
      },
    });
  }

  getContentProtectionEnabled(): boolean {
    return this.uiSettingsHelper.getContentProtectionEnabled();
  }

  setContentProtectionEnabled(enabled: boolean): void {
    this.uiSettingsHelper.setContentProtectionEnabled(enabled);
  }

  getPrivacyModeEnabled(): boolean {
    return this.uiSettingsHelper.getPrivacyModeEnabled();
  }

  setPrivacyModeEnabled(enabled: boolean): void {
    this.uiSettingsHelper.setPrivacyModeEnabled(enabled);
  }

  getLoggingEnabled(): boolean {
    return this.getSetting<boolean>("loggingEnabled") ?? false;
  }

  setLoggingEnabled(enabled: boolean): void {
    this.setSetting("loggingEnabled", enabled);
    publishArgosEvent("settings.changed", {
      changedKeys: ["loggingEnabled"],
      version: Date.now(),
      values: {
        loggingEnabled: Boolean(enabled),
      },
    });
    setTimeout(() => {
      presenter.devicePresenter.restartApp();
    }, 1000);
  }

  getLaunchAtLoginEnabled(): boolean {
    return app.getLoginItemSettings().openAtLogin;
  }

  setLaunchAtLoginEnabled(enabled: boolean): void {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
    });
    publishArgosEvent("settings.changed", {
      changedKeys: ["launchAtLoginEnabled"],
      version: Date.now(),
      values: {
        launchAtLoginEnabled: this.getLaunchAtLoginEnabled(),
      },
    });
  }

  getCopyWithCotEnabled(): boolean {
    return this.uiSettingsHelper.getCopyWithCotEnabled();
  }

  setCopyWithCotEnabled(enabled: boolean): void {
    this.uiSettingsHelper.setCopyWithCotEnabled(enabled);
  }

  setTraceDebugEnabled(enabled: boolean): void {
    this.uiSettingsHelper.setTraceDebugEnabled(enabled);
  }

  getFontFamily(): string {
    return this.uiSettingsHelper.getFontFamily();
  }

  setFontFamily(fontFamily?: string | null): void {
    this.uiSettingsHelper.setFontFamily(fontFamily);
  }

  getCodeFontFamily(): string {
    return this.uiSettingsHelper.getCodeFontFamily();
  }

  setCodeFontFamily(fontFamily?: string | null): void {
    this.uiSettingsHelper.setCodeFontFamily(fontFamily);
  }

  resetFontSettings(): void {
    this.uiSettingsHelper.resetFontSettings();
  }

  async getSystemFonts(): Promise<string[]> {
    return this.uiSettingsHelper.getSystemFonts();
  }

  // Get floating button switch status
  getFloatingButtonEnabled(): boolean {
    const value = this.getSetting<boolean>("floatingButtonEnabled") ?? false;
    return value === undefined || value === null ? false : value;
  }

  // Set floating button switch status
  setFloatingButtonEnabled(enabled: boolean): void {
    this.setSetting("floatingButtonEnabled", enabled);
    eventBus.send(FLOATING_BUTTON_EVENTS.ENABLED_CHANGED, SendTarget.ALL_WINDOWS, enabled);

    try {
      presenter.floatingButtonPresenter.setEnabled(enabled);
    } catch (error) {
      log.error("Failed to directly call floatingButtonPresenter:", error);
    }
  }

  // Get persisted floating button resting position (docked, fully on-screen)
  getFloatingButtonBounds(): FloatingButtonBounds | null {
    const value = this.getSetting<FloatingButtonBounds>("floatingButtonBounds");
    if (
      !value ||
      typeof value.x !== "number" ||
      typeof value.y !== "number" ||
      (value.dockSide !== "left" && value.dockSide !== "right")
    ) {
      return null;
    }
    return value;
  }

  // Persist floating button resting position so it survives restarts
  setFloatingButtonBounds(bounds: FloatingButtonBounds): void {
    this.setSetting("floatingButtonBounds", bounds);
  }

  // ===================== MCP configuration related methods =====================

  // Set the builtin knowledge support check (deferred to avoid circular import issues)
  setBuiltinKnowledgeSupported(fn: () => Promise<boolean>): void {
    this.mcpConfHelper.setBuiltinKnowledgeSupported(fn);
  }

  // Get MCP server configuration
  async getMcpServers(): Promise<Record<string, MCPServerConfig>> {
    return await this.mcpConfHelper.getMcpServers();
  }

  // Set MCP server configuration
  async setMcpServers(servers: Record<string, MCPServerConfig>): Promise<void> {
    return this.mcpConfHelper.setMcpServers(servers);
  }

  getEnabledMcpServers(): Promise<string[]> {
    return this.mcpConfHelper.getEnabledMcpServers();
  }

  async setMcpServerEnabled(serverName: string, enabled: boolean): Promise<void> {
    return this.mcpConfHelper.setMcpServerEnabled(serverName, enabled);
  }

  // Get MCP enabled status
  getMcpEnabled(): Promise<boolean> {
    return this.mcpConfHelper.getMcpEnabled();
  }

  // Set MCP enabled status
  async setMcpEnabled(enabled: boolean): Promise<void> {
    return this.mcpConfHelper.setMcpEnabled(enabled);
  }

  // Add MCP server
  async addMcpServer(name: string, config: MCPServerConfig): Promise<boolean> {
    return this.mcpConfHelper.addMcpServer(name, config);
  }

  // Remove MCP server
  async removeMcpServer(name: string): Promise<void> {
    return this.mcpConfHelper.removeMcpServer(name);
  }

  // Update MCP server configuration
  async updateMcpServer(name: string, config: Partial<MCPServerConfig>): Promise<void> {
    await this.mcpConfHelper.updateMcpServer(name, config);
  }

  private syncAcpProviderEnabled(enabled: boolean): void {
    const provider = this.getProviderById("acp");
    if (!provider || provider.enable === enabled) {
      return;
    }
    log.info(`[ACP] syncAcpProviderEnabled: updating provider enable state to ${enabled}`);
    this.updateProviderAtomic("acp", { enable: enabled });
  }

  async getAcpEnabled(): Promise<boolean> {
    const state = await invokeDaemonRoute<{ enabled: boolean }>(configGetAcpStateRoute.name, {});
    return state.enabled;
  }

  async setAcpEnabled(enabled: boolean): Promise<void> {
    await invokeDaemonRoute(configSetAcpEnabledRoute.name, { enabled });

    log.info("[ACP] setAcpEnabled: updating global toggle to", enabled);
    this.syncAcpProviderEnabled(enabled);

    if (!enabled) {
      log.info("[ACP] Disabling: clearing provider models and status cache");
      this.providerModelHelper.setProviderModels("acp", []);
      this.clearProviderModelStatusCache("acp");
    }

    this.notifyAcpAgentsChanged();
  }

  // ===================== ACP configuration methods =====================
  // ACP configuration state is daemon-owned; these methods proxy to it.
  // See docs/archives/acp-daemon-state-ownership.
  async listAcpRegistryAgents(): Promise<AcpRegistryAgent[]> {
    const result = await invokeDaemonRoute<{ agents: AcpRegistryAgent[] }>(configListAcpRegistryAgentsRoute.name, {});
    return result.agents ?? [];
  }

  async refreshAcpRegistry(force = true): Promise<AcpRegistryAgent[]> {
    const result = await invokeDaemonRoute<{ agents: AcpRegistryAgent[] }>(configRefreshAcpRegistryRoute.name, {
      force,
    });
    this.notifyAcpAgentsChanged();
    return result.agents ?? [];
  }

  async getAcpRegistryIconMarkup(agentId: string, iconUrl?: string): Promise<string | null> {
    const result = await invokeDaemonRoute<{ markup: string }>(configGetAcpRegistryIconMarkupRoute.name, {
      agentId,
      iconUrl,
    });
    return result.markup || null;
  }

  async getAcpAgentState(agentId: string): Promise<AcpAgentState | null> {
    const agents = await this.listAcpRegistryAgents();
    const agent = agents.find((entry) => entry.id === agentId);
    if (!agent) {
      return null;
    }
    return {
      agentId: agent.id,
      enabled: agent.enabled,
      envOverride: agent.envOverride,
      updatedAt: agent.installState?.lastCheckedAt ?? 0,
    };
  }

  async setAcpAgentEnabled(agentId: string, enabled: boolean): Promise<void> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    await invokeDaemonRoute(configSetAcpAgentEnabledRoute.name, { agentId: resolvedId, enabled });
    this.handleAcpAgentsMutated([resolvedId]);
  }

  async setAcpAgentEnvOverride(agentId: string, env: Record<string, string>): Promise<void> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    await invokeDaemonRoute(configSetAcpAgentEnvOverrideRoute.name, { agentId: resolvedId, env });
    this.handleAcpAgentsMutated([resolvedId]);
  }

  async ensureAcpAgentInstalled(agentId: string): Promise<AcpAgentInstallState> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const installed = await invokeDaemonRoute<AcpAgentInstallState>(configEnsureAcpAgentInstalledRoute.name, {
      agentId: resolvedId,
    });
    this.handleAcpAgentsMutated([resolvedId]);
    return installed;
  }

  async repairAcpAgent(agentId: string): Promise<AcpAgentInstallState> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const repaired = await invokeDaemonRoute<AcpAgentInstallState>(configRepairAcpAgentRoute.name, {
      agentId: resolvedId,
    });
    this.handleAcpAgentsMutated([resolvedId]);
    return repaired;
  }

  async updateAcpAgent(agentId: string): Promise<AcpAgentInstallState> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const updated = await invokeDaemonRoute<AcpAgentInstallState>(configUpdateAcpAgentRoute.name, {
      agentId: resolvedId,
    });
    this.handleAcpAgentsMutated([resolvedId]);
    return updated;
  }

  async uninstallAcpRegistryAgent(agentId: string): Promise<void> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    await invokeDaemonRoute(configUninstallAcpRegistryAgentRoute.name, { agentId: resolvedId });
    this.handleAcpAgentsMutated([resolvedId]);
  }

  async getAcpAgentInstallStatus(agentId: string): Promise<AcpAgentInstallState | null> {
    const agents = await this.listAcpRegistryAgents();
    return agents.find((entry) => entry.id === resolveAcpAgentAlias(agentId))?.installState ?? null;
  }

  async listManualAcpAgents(): Promise<AcpManualAgent[]> {
    const result = await invokeDaemonRoute<{ agents: AcpManualAgent[] }>(configListManualAcpAgentsRoute.name, {});
    return result.agents ?? [];
  }

  async addManualAcpAgent(agent: Omit<AcpManualAgent, "id" | "source"> & { id?: string }): Promise<AcpManualAgent> {
    const result = await invokeDaemonRoute<{ agent: AcpManualAgent }>(
      configAddManualAcpAgentRoute.name,
      agent as never,
    );
    this.handleAcpAgentsMutated([result.agent.id]);
    return result.agent;
  }

  async updateManualAcpAgent(
    agentId: string,
    updates: Partial<Omit<AcpManualAgent, "id" | "source">>,
  ): Promise<AcpManualAgent | null> {
    const result = await invokeDaemonRoute<{ agent: AcpManualAgent | null }>(configUpdateManualAcpAgentRoute.name, {
      agentId,
      updates,
    });
    if (result.agent) {
      this.handleAcpAgentsMutated([result.agent.id]);
    }
    return result.agent;
  }

  async removeManualAcpAgent(agentId: string): Promise<boolean> {
    const result = await invokeDaemonRoute<{ removed: boolean }>(configRemoveManualAcpAgentRoute.name, { agentId });
    if (result.removed) {
      this.handleAcpAgentsMutated([agentId]);
    }
    return result.removed;
  }

  async getAcpAgents(): Promise<AcpAgentConfig[]> {
    const state = await invokeDaemonRoute<{
      enabled: boolean;
      agents: AcpAgentConfig[];
    }>(configGetAcpStateRoute.name, {});
    if (!state.enabled) {
      return [];
    }
    return state.agents ?? [];
  }

  async getAcpSharedMcpSelections(): Promise<string[]> {
    const result = await invokeDaemonRoute<{ selections: string[] }>(configGetAcpSharedMcpSelectionsRoute.name, {});
    return result.selections ?? [];
  }

  async setAcpSharedMcpSelections(mcpIds: string[]): Promise<void> {
    await invokeDaemonRoute(configSetAcpSharedMcpSelectionsRoute.name, { selections: mcpIds });
    this.handleAcpAgentsMutated();
  }

  async listAgents(): Promise<Agent[]> {
    // All agents (Argos + ACP) are daemon-owned.
    try {
      const result = await invokeDaemonRoute<{ agents: Agent[] }>(configListAgentsRoute.name, {});
      return result.agents ?? [];
    } catch (error) {
      log.warn("Failed to list agents from daemon:", error);
      return [];
    }
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    try {
      const result = await invokeDaemonRoute<{ agents: Agent[] }>(configListAgentsRoute.name, {
        ids: [agentId],
      });
      return result.agents?.[0] ?? null;
    } catch (error) {
      log.warn("Failed to get agent from daemon:", error);
      return null;
    }
  }

  async getAgentType(agentId: string): Promise<AgentType | null> {
    const agent = await this.getAgent(agentId);
    return agent?.type ?? null;
  }

  async getArgosAgentConfig(agentId: string): Promise<ArgosAgentConfig | null> {
    // The builtin agent's config is the legacy config-entry compat surface and
    // stays local (written via default-model/system-prompt/compaction entries).
    if (agentId === BUILTIN_ARGOS_AGENT_ID) {
      return this.getAgentRepositoryOrThrow().getArgosAgentConfig(agentId);
    }
    const resolved = await this.resolveArgosAgentConfig(agentId);
    return resolved;
  }

  async resolveArgosAgentConfig(agentId: string): Promise<ArgosAgentConfig> {
    // Builtin config is resolved locally (config-entry compat). Custom agents
    // are resolved by the daemon (single source of truth for custom agents).
    if (!agentId || agentId === BUILTIN_ARGOS_AGENT_ID) {
      return this.getAgentRepositoryOrThrow().resolveArgosAgentConfig(agentId || BUILTIN_ARGOS_AGENT_ID);
    }
    try {
      const result = await invokeDaemonRoute<{ config: ArgosAgentConfig }>("config.resolveArgosAgentConfig", {
        agentId,
      });
      return result.config;
    } catch (error) {
      log.warn("Failed to resolve Argos agent config from daemon:", error);
      return this.getAgentRepositoryOrThrow().resolveArgosAgentConfig(BUILTIN_ARGOS_AGENT_ID);
    }
  }

  async agentSupportsCapability(agentId: string, capability: "vision"): Promise<boolean> {
    if (capability !== "vision") {
      return false;
    }

    const agentConfig = await this.resolveArgosAgentConfig(agentId);
    const providerId = agentConfig.visionModel?.providerId?.trim();
    const modelId = agentConfig.visionModel?.modelId?.trim();

    return Boolean(providerId && modelId && this.getModelConfig(modelId, providerId)?.vision);
  }

  async createArgosAgent(input: CreateArgosAgentInput): Promise<Agent> {
    // Custom Argos agents live in the daemon (single source of truth).
    const result = await invokeDaemonRoute<{ agent: Agent }>(configCreateArgosAgentRoute.name, input as never);
    this.notifyAcpAgentsChanged();
    return result.agent;
  }

  async updateArgosAgent(agentId: string, updates: UpdateArgosAgentInput): Promise<Agent | null> {
    // Builtin config is mirrored: write locally (config-entry compat) and push
    // to the daemon so the daemon-owned builtin listing stays consistent.
    if (agentId === BUILTIN_ARGOS_AGENT_ID) {
      const updated = this.getAgentRepositoryOrThrow().updateArgosAgent(agentId, updates);
      try {
        await invokeDaemonRoute<{ agent: Agent | null }>(configUpdateArgosAgentRoute.name, {
          agentId,
          updates: updates as never,
        });
      } catch (error) {
        log.warn("Failed to mirror builtin agent update to daemon:", error);
      }
      if (updated) this.notifyAcpAgentsChanged();
      return updated;
    }

    const result = await invokeDaemonRoute<{ agent: Agent | null }>(configUpdateArgosAgentRoute.name, {
      agentId,
      updates: updates as never,
    });
    if (result.agent) this.notifyAcpAgentsChanged();
    return result.agent;
  }

  async deleteArgosAgent(agentId: string): Promise<boolean> {
    // The builtin agent is protected and cannot be deleted; custom agents are
    // owned by the daemon.
    const result = await invokeDaemonRoute<{ removed: boolean }>(configDeleteArgosAgentRoute.name, { agentId });
    if (result.removed) this.notifyAcpAgentsChanged();
    return result.removed;
  }

  async getAgentMcpSelections(agentId: string): Promise<string[]> {
    const result = await invokeDaemonRoute<{ selections: string[] }>(configGetAgentMcpSelectionsRoute.name, {
      agentId,
    });
    return result.selections ?? [];
  }

  private handleAcpAgentsMutated(agentIds?: string[]) {
    this.clearProviderModelStatusCache("acp");
    this.notifyAcpAgentsChanged(agentIds);
    void this.refreshAcpProviderAgents(agentIds);
  }

  private async refreshAcpProviderAgents(_agentIds?: string[]): Promise<void> {
    // ACP process lifecycle is now daemon-owned; no desktop-side refresh needed.
  }

  private notifyAcpAgentsChanged(agentIds?: string[]) {
    log.info("[ACP] notifyAcpAgentsChanged: sending MODEL_LIST_CHANGED event for provider acp");
    eventBus.send(CONFIG_EVENTS.MODEL_LIST_CHANGED, SendTarget.ALL_WINDOWS, "acp");
    eventBus.send(CONFIG_EVENTS.AGENTS_CHANGED, SendTarget.ALL_WINDOWS, { agentIds });
    eventBus.sendToRendererIfAvailable(SESSION_EVENTS.LIST_UPDATED, SendTarget.ALL_WINDOWS);
  }

  // Provide getMcpConfHelper method to get MCP configuration helper
  getMcpConfHelper(): McpConfHelper {
    return this.mcpConfHelper;
  }

  /**
   * Get the recommended configuration for the given provider and model
   * @param modelId Model ID
   * @param providerId Optional provider ID; when provided, that provider's specific configuration is preferred
   * @returns ModelConfig The model configuration
   */
  getModelConfig(modelId: string, providerId?: string): ModelConfig {
    return this.modelConfigHelper.getModelConfig(modelId, providerId);
  }

  /**
   * Set custom model configuration for a specific provider and model
   * @param modelId - The model ID
   * @param providerId - The provider ID
   * @param config - The model configuration
   */
  setModelConfig(
    modelId: string,
    providerId: string,
    config: ModelConfig,
    options?: { source?: ModelConfigSource },
  ): void {
    const storedConfig = this.modelConfigHelper.setModelConfig(modelId, providerId, config, options);
    this.providerModelHelper.invalidateProviderModelsCache(providerId);
    // Trigger model configuration change event (need to notify all tabs)
    eventBus.send(CONFIG_EVENTS.MODEL_CONFIG_CHANGED, SendTarget.ALL_WINDOWS, providerId, modelId, storedConfig);
  }

  /**
   * Reset model configuration for a specific provider and model
   * @param modelId - The model ID
   * @param providerId - The provider ID
   */
  resetModelConfig(modelId: string, providerId: string): void {
    this.modelConfigHelper.resetModelConfig(modelId, providerId);
    this.providerModelHelper.invalidateProviderModelsCache(providerId);
    // Emit the model configuration reset event (must notify all tabs)
    eventBus.send(CONFIG_EVENTS.MODEL_CONFIG_RESET, SendTarget.ALL_WINDOWS, providerId, modelId);
  }

  /**
   * Get all user-defined model configurations
   */
  getAllModelConfigs(): Record<string, IModelConfig> {
    return this.modelConfigHelper.getAllModelConfigs();
  }

  /**
   * Get configurations for a specific provider
   * @param providerId - The provider ID
   */
  getProviderModelConfigs(providerId: string): Array<{ modelId: string; config: ModelConfig }> {
    return this.modelConfigHelper.getProviderModelConfigs(providerId);
  }

  /**
   * Check if a model has user-defined configuration
   * @param modelId - The model ID
   * @param providerId - The provider ID
   */
  hasUserModelConfig(modelId: string, providerId: string): boolean {
    return this.modelConfigHelper.hasUserConfig(modelId, providerId);
  }

  /**
   * Export all model configurations for backup/sync
   */
  exportModelConfigs(): Record<string, IModelConfig> {
    return this.modelConfigHelper.exportConfigs();
  }

  /**
   * Import model configurations for restore/sync
   * @param configs - Model configurations to import
   * @param overwrite - Whether to overwrite existing configurations
   */
  importModelConfigs(configs: Record<string, IModelConfig>, overwrite: boolean = false): void {
    this.modelConfigHelper.importConfigs(configs, overwrite);
    this.providerModelHelper.invalidateAllProviderModelsCache();
    // Emit the batch import event (must notify all tabs)
    eventBus.send(CONFIG_EVENTS.MODEL_CONFIGS_IMPORTED, SendTarget.ALL_WINDOWS, overwrite);
  }

  getNotificationsEnabled(): boolean {
    return this.uiSettingsHelper.getNotificationsEnabled();
  }

  setNotificationsEnabled(enabled: boolean): void {
    this.uiSettingsHelper.setNotificationsEnabled(enabled);
  }

  async initTheme() {
    const theme = this.getSetting<string>("appTheme");
    if (theme) {
      nativeTheme.themeSource = theme as "dark" | "light" | "system";
    }
    // Listen for system theme changes
    nativeTheme.on("updated", () => {
      // Re-sync the Windows window controls overlay symbol colors when the theme flips
      try {
        presenter.windowPresenter.syncWindowTitleBarAppearance();
      } catch (error) {
        log.error("Failed to sync window controls overlay theme:", error);
      }
      // Only notify the renderer of system theme changes when the theme is set to "system"
      if (nativeTheme.themeSource === "system") {
        eventBus.sendToMain(SYSTEM_EVENTS.SYSTEM_THEME_UPDATED, nativeTheme.shouldUseDarkColors);

        try {
          void presenter.floatingButtonPresenter.refreshTheme();
        } catch (error) {
          log.error("Failed to refresh floating widget theme:", error);
        }
      }
    });
  }

  async setTheme(theme: "dark" | "light" | "system"): Promise<boolean> {
    nativeTheme.themeSource = theme;
    this.setSetting("appTheme", theme);
    // Re-sync the Windows native window controls overlay after an explicit theme change
    try {
      presenter.windowPresenter.syncWindowTitleBarAppearance();
    } catch (error) {
      log.error("Failed to sync window title bar appearance:", error);
    }
    // Notify all windows that the theme has changed
    eventBus.send(CONFIG_EVENTS.THEME_CHANGED, SendTarget.ALL_WINDOWS, theme);

    try {
      void presenter.floatingButtonPresenter.refreshTheme();
    } catch (error) {
      log.error("Failed to refresh floating widget theme:", error);
    }

    return nativeTheme.shouldUseDarkColors;
  }

  async getTheme(): Promise<string> {
    return this.getSetting<string>("appTheme") || "system";
  }

  async getCurrentThemeIsDark(): Promise<boolean> {
    return nativeTheme.shouldUseDarkColors;
  }

  async getSystemTheme(): Promise<"dark" | "light"> {
    return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  }

  // Get all custom prompts (with cache)
  async getCustomPrompts(): Promise<Prompt[]> {
    // Check cache first
    if (this.customPromptsCache !== null) {
      return this.customPromptsCache;
    }

    // Load from store and cache it
    try {
      const prompts = this.customPromptsStore.get("prompts") || [];
      this.customPromptsCache = prompts;
      log.info(`Custom prompts cache loaded: ${prompts.length} prompts`);
      return prompts;
    } catch (error) {
      log.error("Failed to load custom prompts:", error);
      this.customPromptsCache = [];
      return [];
    }
  }

  // Save custom prompts (with cache update)
  async setCustomPrompts(prompts: Prompt[]): Promise<void> {
    await this.customPromptsStore.set("prompts", prompts);
    this.clearCustomPromptsCache();
    log.info(`Custom prompts cache updated: ${prompts.length} prompts`);
    // Notify all windows about custom prompts change
    eventBus.send(CONFIG_EVENTS.CUSTOM_PROMPTS_CHANGED, SendTarget.ALL_WINDOWS, {
      count: prompts.length,
    });
  }

  // Add a single prompt (optimized with cache)
  async addCustomPrompt(prompt: Prompt): Promise<void> {
    const prompts = await this.getCustomPrompts();
    const updatedPrompts = [...prompts, prompt]; // Create new array
    await this.setCustomPrompts(updatedPrompts);
    log.info(`Added custom prompt: ${prompt.name}`);
  }

  // Update a single prompt (optimized with cache)
  async updateCustomPrompt(promptId: string, updates: Partial<Prompt>): Promise<void> {
    const prompts = await this.getCustomPrompts();
    const index = prompts.findIndex((p) => p.id === promptId);
    if (index !== -1) {
      const updatedPrompts = [...prompts]; // Create new array
      updatedPrompts[index] = { ...updatedPrompts[index], ...updates };
      await this.setCustomPrompts(updatedPrompts);
      log.info(`Updated custom prompt: ${promptId}`);
    } else {
      log.warn(`Custom prompt not found for update: ${promptId}`);
    }
  }

  // Delete a single prompt (optimized with cache)
  async deleteCustomPrompt(promptId: string): Promise<void> {
    const prompts = await this.getCustomPrompts();
    const initialCount = prompts.length;
    const filteredPrompts = prompts.filter((p) => p.id !== promptId);

    if (filteredPrompts.length === initialCount) {
      log.warn(`Custom prompt not found for deletion: ${promptId}`);
      return;
    }

    await this.setCustomPrompts(filteredPrompts);
    log.info(`Deleted custom prompt: ${promptId}`);
  }

  /**
   * Clear the custom prompts cache
   * Forces a reload on the next access
   */
  clearCustomPromptsCache(): void {
    log.info("Clearing custom prompts cache");
    this.customPromptsCache = null;
  }

  // Get the default system prompt
  async getDefaultSystemPrompt(): Promise<string> {
    return this.systemPromptHelper.getDefaultSystemPrompt();
  }

  async setDefaultSystemPrompt(prompt: string): Promise<void> {
    return this.systemPromptHelper.setDefaultSystemPrompt(prompt);
  }

  async resetToDefaultPrompt(): Promise<void> {
    return this.systemPromptHelper.resetToDefaultPrompt();
  }

  async clearSystemPrompt(): Promise<void> {
    return this.systemPromptHelper.clearSystemPrompt();
  }

  async getSystemPrompts(): Promise<SystemPrompt[]> {
    return this.systemPromptHelper.getSystemPrompts();
  }

  async setSystemPrompts(prompts: SystemPrompt[]): Promise<void> {
    return this.systemPromptHelper.setSystemPrompts(prompts);
  }

  async addSystemPrompt(prompt: SystemPrompt): Promise<void> {
    return this.systemPromptHelper.addSystemPrompt(prompt);
  }

  async updateSystemPrompt(promptId: string, updates: Partial<SystemPrompt>): Promise<void> {
    return this.systemPromptHelper.updateSystemPrompt(promptId, updates);
  }

  async deleteSystemPrompt(promptId: string): Promise<void> {
    return this.systemPromptHelper.deleteSystemPrompt(promptId);
  }

  async setDefaultSystemPromptId(promptId: string): Promise<void> {
    return this.systemPromptHelper.setDefaultSystemPromptId(promptId);
  }

  async getDefaultSystemPromptId(): Promise<string> {
    return this.systemPromptHelper.getDefaultSystemPromptId();
  }

  // Get the update channel
  getUpdateChannel(): string {
    const raw = this.getSetting<string>("updateChannel");
    if (raw === "stable" || raw === "beta") {
      return raw;
    }
    // On first launch or when the value is invalid, infer from the current app version: builds with pre-release suffixes such as -alpha/-beta/-rc/-canary default to the beta channel
    const isPrerelease = /-(?:alpha|beta|rc|canary)(?:[.-]\d+)?$/i.test(this.currentAppVersion);
    const inferred = isPrerelease ? "beta" : "stable";
    this.setSetting("updateChannel", inferred);
    return inferred;
  }

  // Set the update channel
  setUpdateChannel(channel: string): void {
    this.setSetting("updateChannel", channel);
  }

  // Get the default shortcut key
  getDefaultShortcutKey(): ShortcutKeySetting {
    return {
      ...defaultShortcutKey,
    };
  }

  // Get the shortcut key
  getShortcutKey(): ShortcutKeySetting {
    return (
      this.getSetting<ShortcutKeySetting>("shortcutKey") || {
        ...defaultShortcutKey,
      }
    );
  }

  // Set the shortcut key
  setShortcutKey(customShortcutKey: ShortcutKeySetting) {
    this.setSetting("shortcutKey", customShortcutKey);
  }

  // Reset the shortcut keys
  resetShortcutKeys() {
    this.setSetting("shortcutKey", { ...defaultShortcutKey });
  }

  // Get knowledge base configuration
  getKnowledgeConfigs(): BuiltinKnowledgeConfig[] {
    const configs = this.knowledgeConfHelper.getKnowledgeConfigs();
    const migratedConfigs = this.mcpConfHelper.migrateBuiltinKnowledgeConfigsFromEnv(configs);

    if (migratedConfigs !== configs) {
      this.knowledgeConfHelper.setKnowledgeConfigs(migratedConfigs);
    }

    return migratedConfigs;
  }

  // Set knowledge base configuration
  setKnowledgeConfigs(configs: BuiltinKnowledgeConfig[]): void {
    this.knowledgeConfHelper.setKnowledgeConfigs(configs);
    void Promise.all([this.getMcpServers(), this.getMcpEnabled()])
      .then(([mcpServers, mcpEnabled]) => {
        eventBus.send(MCP_EVENTS.CONFIG_CHANGED, SendTarget.ALL_WINDOWS, {
          mcpServers,
          mcpEnabled,
        });
      })
      .catch((error) => {
        log.error("Failed to notify MCP config change after knowledge config update:", error);
      });
  }

  // Get the NPM registry cache
  getNpmRegistryCache(): any {
    return this.mcpConfHelper.getNpmRegistryCache();
  }

  // Set the NPM registry cache
  setNpmRegistryCache(cache: any): void {
    return this.mcpConfHelper.setNpmRegistryCache(cache);
  }

  // Check whether the NPM registry cache is valid
  isNpmRegistryCacheValid(): boolean {
    return this.mcpConfHelper.isNpmRegistryCacheValid();
  }

  // Get the effective NPM registry
  getEffectiveNpmRegistry(): string | null {
    return this.mcpConfHelper.getEffectiveNpmRegistry();
  }

  // Get the custom NPM registry
  getCustomNpmRegistry(): string | undefined {
    return this.mcpConfHelper.getCustomNpmRegistry();
  }

  // Set the custom NPM registry
  setCustomNpmRegistry(registry: string | undefined): void {
    this.mcpConfHelper.setCustomNpmRegistry(registry);
  }

  // Get the auto-detect NPM registry setting
  getAutoDetectNpmRegistry(): boolean {
    return this.mcpConfHelper.getAutoDetectNpmRegistry();
  }

  // Set the auto-detect NPM registry setting
  setAutoDetectNpmRegistry(enabled: boolean): void {
    this.mcpConfHelper.setAutoDetectNpmRegistry(enabled);
  }

  // Clear the NPM registry cache
  clearNpmRegistryCache(): void {
    this.mcpConfHelper.clearNpmRegistryCache();
  }

  // Diff knowledge base configuration changes
  diffKnowledgeConfigs(newConfigs: BuiltinKnowledgeConfig[]) {
    return KnowledgeConfHelper.diffKnowledgeConfigs(this.getKnowledgeConfigs(), newConfigs);
  }

  // Batch import MCP servers
  async batchImportMcpServers(
    servers: Array<{
      name: string;
      description: string;
      package: string;
      version?: string;
      type?: any;
      args?: string[];
      env?: Record<string, string>;
      enabled?: boolean;
      source?: string;
      [key: string]: unknown;
    }>,
    options: {
      skipExisting?: boolean;
      enableByDefault?: boolean;
      overwriteExisting?: boolean;
    } = {},
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    return this.mcpConfHelper.batchImportMcpServers(servers, options);
  }

  // Find a server by package name
  async findMcpServerByPackage(packageName: string): Promise<string | null> {
    return this.mcpConfHelper.findServerByPackage(packageName);
  }

  // ===================== Nowledge-mem configuration methods =====================
  async getNowledgeMemConfig(): Promise<{
    baseUrl: string;
    apiKey?: string;
    timeout: number;
  } | null> {
    try {
      return this.getSettingsStoreForKey("nowledgeMemConfig").get("nowledgeMemConfig", null) as {
        baseUrl: string;
        apiKey?: string;
        timeout: number;
      } | null;
    } catch (error) {
      log.error("Failed to get nowledge-mem config:", error);
      return null;
    }
  }

  async setNowledgeMemConfig(config: { baseUrl: string; apiKey?: string; timeout: number }): Promise<void> {
    try {
      this.getSettingsStoreForKey("nowledgeMemConfig").set("nowledgeMemConfig", config);
      eventBus.sendToRenderer(CONFIG_EVENTS.NOWLEDGE_MEM_CONFIG_UPDATED, SendTarget.ALL_WINDOWS, config);
    } catch (error) {
      log.error("Failed to set nowledge-mem config:", error);
      throw error;
    }
  }

  getHooksNotificationsConfig(): HooksNotificationsSettings {
    const store = this.getSettingsStoreForKey("hooksNotifications");
    const raw = store.get("hooksNotifications");
    const normalized = normalizeHooksNotificationsConfig(raw);
    if (!raw || JSON.stringify(raw) !== JSON.stringify(normalized)) {
      store.set("hooksNotifications", normalized);
    }
    return normalized;
  }

  setHooksNotificationsConfig(config: HooksNotificationsSettings): HooksNotificationsSettings {
    const normalized = normalizeHooksNotificationsConfig(config);
    this.getSettingsStoreForKey("hooksNotifications").set("hooksNotifications", normalized);
    return normalized;
  }

  getScheduledTasksConfig(): ScheduledTasksSettings {
    const raw = this.store.get("scheduledTasks");
    const normalized = normalizeScheduledTasksConfig(raw);
    if (!raw || JSON.stringify(raw) !== JSON.stringify(normalized)) {
      this.store.set("scheduledTasks", normalized);
    }
    return normalized;
  }

  setScheduledTasksConfig(config: ScheduledTasksSettings): ScheduledTasksSettings {
    const normalized = normalizeScheduledTasksConfig(config);
    this.store.set("scheduledTasks", normalized);
    return normalized;
  }

  async testHookCommand(hookId: string): Promise<HookTestResult> {
    return await presenter.hooksNotifications.testHookCommand(hookId);
  }

  getDefaultModel(): { providerId: string; modelId: string } | undefined {
    const selection = this.getBuiltinArgosConfig().defaultModelPreset;
    if (selection?.providerId && selection?.modelId) {
      return {
        providerId: selection.providerId,
        modelId: selection.modelId,
      };
    }
    return this.store.get("defaultModel") as { providerId: string; modelId: string } | undefined;
  }

  setDefaultModel(model: { providerId: string; modelId: string } | undefined): void {
    this.updateBuiltinArgosConfig({
      defaultModelPreset:
        model?.providerId && model?.modelId
          ? {
              providerId: model.providerId,
              modelId: model.modelId,
            }
          : null,
    });
    eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, "defaultModel", model);
  }

  getDefaultProjectPath(): string | null {
    const path = this.getSetting<string | null>("defaultProjectPath");
    return path?.trim() ? path.trim() : null;
  }

  setDefaultProjectPath(projectPath: string | null): void {
    const normalized = projectPath?.trim() ? projectPath.trim() : null;
    this.setSetting("defaultProjectPath", normalized);
    eventBus.send(CONFIG_EVENTS.DEFAULT_PROJECT_PATH_CHANGED, SendTarget.ALL_WINDOWS, {
      path: normalized,
    });
  }
}

export { defaultShortcutKey } from "./shortcutKeySettings";
