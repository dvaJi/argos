import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { DEFAULT_PROVIDERS, normalizeScheduledTasksConfig } from "@argos/backend-core";
import type {
  BuiltinKnowledgeConfig,
  IConfigPresenter,
  IModelConfig,
  LLM_PROVIDER,
  MODEL_META,
  ModelConfig,
  ModelConfigSource,
  OllamaModel,
} from "@argos/shared/presenter";
import { normalizeArgosSubagentConfig } from "@argos/shared/lib/argosSubagents";
import type { Agent } from "@argos/shared/types/agent-interface";
import { DaemonAcpConfig } from "./daemonAcpConfig";

/** Minimal SQLite surface for the `model_status` table. */
export interface ModelStatusDb {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes: number };
  };
}
import { DaemonMcpConfig } from "./daemonMcpConfig";
import { ModelType } from "@argos/shared/model";
import type { ScheduledTasksSettings } from "@argos/shared/scheduledTasks";
import type { ArgosAgentRuntime } from "@argos/agent-runtime";

type Store = Record<string, unknown>;

type OllamaApiModel = Partial<OllamaModel> & {
  name?: unknown;
  model?: unknown;
  size?: unknown;
  digest?: unknown;
  modified_at?: unknown;
  details?: unknown;
  model_info?: unknown;
  capabilities?: unknown;
};

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_DETAILS = {
  format: "",
  family: "default",
  families: ["default"],
  parameter_size: "",
  quantization_level: "",
};

const DEFAULTS: Store = {
  language: "en",
  theme: "system",
  floatingButtonEnabled: true,
  syncEnabled: false,
  syncFolderPath: "",
  init_complete: false,
  knowledgeConfigs: [],
  modelConfigs: {},
};

const defaultProviders: LLM_PROVIDER[] = DEFAULT_PROVIDERS.map((provider) => ({
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

export class DaemonConfigPresenter {
  private store: Store;
  private filePath: string;
  private readonly acpConfig: DaemonAcpConfig;
  private readonly mcpConfig: DaemonMcpConfig;
  private argosAgentRuntime: ArgosAgentRuntime | null = null;
  private readonly db?: ModelStatusDb;

  constructor(configDir: string, dataDir: string = configDir, db?: ModelStatusDb) {
    this.filePath = join(configDir, "config.json");
    this.store = this.load();
    this.db = db;
    this.acpConfig = new DaemonAcpConfig({
      configDir,
      dataDir,
      isPrivacyModeEnabled: () => this.getPrivacyModeEnabled(),
    });
    this.mcpConfig = new DaemonMcpConfig(configDir, this);
  }

  private load(): Store {
    if (!existsSync(this.filePath)) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      return { ...DEFAULTS };
    }
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
  }

  getSetting<T>(key: string): T | undefined {
    return this.store[key] as T | undefined;
  }

  setSetting<T>(key: string, value: T): void {
    this.store[key] = value;
    this.save();
  }

  getLanguage(): string {
    return (this.store.language as string) || "en";
  }

  setLanguage(language: string): void {
    this.store.language = language;
    this.save();
  }

  async getTheme(): Promise<string> {
    return (this.store.theme as string) || "system";
  }

  async setTheme(theme: string): Promise<boolean> {
    this.store.theme = theme;
    this.save();
    return true;
  }

  async getCurrentThemeIsDark(): Promise<boolean> {
    return this.store.theme === "dark";
  }

  getFloatingButtonEnabled(): boolean {
    return (this.store.floatingButtonEnabled as boolean) ?? true;
  }

  setFloatingButtonEnabled(enabled: boolean): void {
    this.store.floatingButtonEnabled = enabled;
    this.save();
  }

  getSyncEnabled(): boolean {
    return (this.store.syncEnabled as boolean) ?? false;
  }

  setSyncEnabled(enabled: boolean): void {
    this.store.syncEnabled = enabled;
    this.save();
  }

  getSyncFolderPath(): string {
    return (this.store.syncFolderPath as string) || "";
  }

  setSyncFolderPath(folderPath: string): void {
    this.store.syncFolderPath = folderPath;
    this.save();
  }

  getDefaultProjectPath(): string | null {
    return (this.store.defaultProjectPath as string) ?? null;
  }

  setDefaultProjectPath(path: string | null): void {
    this.store.defaultProjectPath = path;
    this.save();
  }

  getDefaultModel(): { providerId: string; modelId: string } | undefined {
    const selection = this.store.defaultModel as { providerId?: string; modelId?: string } | undefined;
    if (selection?.providerId && selection?.modelId) {
      return {
        providerId: selection.providerId,
        modelId: selection.modelId,
      };
    }
    return undefined;
  }

  setDefaultModel(model: { providerId: string; modelId: string } | undefined): void {
    this.store.defaultModel = model?.providerId && model?.modelId ? model : undefined;
    this.save();
  }

  getShortcutKey(): any {
    return this.store.shortcutKey ?? {};
  }

  setShortcutKey(customShortcutKey: any): void {
    this.store.shortcutKey = customShortcutKey;
    this.save();
  }

  resetShortcutKeys(): void {
    this.store.shortcutKey = undefined;
    this.save();
  }

  getSkillsEnabled(): boolean {
    return (this.store.skillsEnabled as boolean) ?? true;
  }

  setSkillsEnabled(enabled: boolean): void {
    this.store.skillsEnabled = enabled;
    this.save();
  }

  getSkillDraftSuggestionsEnabled(): boolean {
    return (this.store.skillDraftSuggestionsEnabled as boolean) ?? false;
  }

  setSkillDraftSuggestionsEnabled(enabled: boolean): void {
    this.store.skillDraftSuggestionsEnabled = enabled;
    this.save();
  }

  getSkillsPath(): string {
    const stored = (this.store.skillsPath as string) ?? "";
    return stored || join(homedir(), ".argos", "skills");
  }

  setSkillsPath(skillsPath: string): void {
    this.store.skillsPath = skillsPath;
    this.save();
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

  private getPersistedProviders(): LLM_PROVIDER[] {
    return Array.isArray(this.store.providers) ? (this.store.providers as LLM_PROVIDER[]) : [];
  }

  getDefaultProviders(): LLM_PROVIDER[] {
    return defaultProviders.map((provider) => ({ ...provider }));
  }

  getProviders(): LLM_PROVIDER[] {
    const persisted = this.getPersistedProviders();
    if (persisted.length === 0) {
      return this.getDefaultProviders();
    }

    const defaultsById = new Map(defaultProviders.map((provider) => [provider.id, provider]));
    const mergedProviders: LLM_PROVIDER[] = [];
    const seen = new Set<string>();

    for (const provider of persisted) {
      if (!provider || typeof provider.id !== "string") continue;
      const template = defaultsById.get(provider.id);
      mergedProviders.push(template ? { ...template, ...provider } : { ...provider });
      seen.add(provider.id);
    }

    for (const provider of defaultProviders) {
      if (!seen.has(provider.id)) {
        mergedProviders.push({ ...provider });
      }
    }

    return mergedProviders;
  }

  setProviders(providers: LLM_PROVIDER[]): void {
    this.store.providers = providers;
    this.save();
  }

  setProviderById(id: string, provider: LLM_PROVIDER): void {
    const providers = this.getProviders();
    const idx = providers.findIndex((p) => p.id === id);
    if (idx >= 0) {
      providers[idx] = provider;
    } else {
      providers.push(provider);
    }
    this.store.providers = providers;
    this.save();
  }

  addProviderAtomic(provider: LLM_PROVIDER): void {
    const providers = this.getProviders();
    providers.push(provider);
    this.store.providers = providers;
    this.save();
  }

  removeProviderAtomic(providerId: string): void {
    const providers = this.getProviders().filter((p) => p.id !== providerId);
    this.store.providers = providers;
    this.save();
  }

  updateProviderAtomic(id: string, updates: Partial<LLM_PROVIDER>): boolean {
    const providers = this.getProviders();
    const idx = providers.findIndex((p) => p.id === id);
    if (idx >= 0) {
      providers[idx] = { ...providers[idx], ...updates };
      this.store.providers = providers;
      this.save();
      return true;
    }
    return false;
  }

  reorderProvidersAtomic(providers: LLM_PROVIDER[]): void {
    this.store.providers = providers;
    this.save();
  }

  getProviderById(id: string): LLM_PROVIDER | undefined {
    return this.getProviders().find((p) => p.id === id);
  }

  getProviderModels(providerId: string): MODEL_META[] {
    const provider = this.getProviderById(providerId);
    return provider?.models ?? [];
  }

  /**
   * Per-model enabled/disabled state, persisted in the `model_status` SQLite table.
   * The model picker toggles call `setModelStatus`; `getModelStatusMap` feeds the
   * `modelStatusMap` returned by `models.getProviderCatalog`.
   */
  setModelStatus(providerId: string, modelId: string, enabled: boolean): void {
    if (!this.db) return;
    const now = Date.now();
    this.db
      .prepare(
        "INSERT OR REPLACE INTO model_status (model_id, provider_id, enabled, created_at, updated_at) VALUES (?, ?, ?, COALESCE((SELECT created_at FROM model_status WHERE model_id = ? AND provider_id = ?), ?), ?)",
      )
      .run(modelId, providerId, enabled ? 1 : 0, modelId, providerId, now, now);
  }

  getModelStatusMap(providerId?: string): Record<string, boolean> {
    if (!this.db) return {};
    const map: Record<string, boolean> = {};
    if (providerId) {
      const rows = this.db
        .prepare("SELECT model_id, enabled FROM model_status WHERE provider_id = ?")
        .all(providerId) as Array<{ model_id: string; enabled: number }>;
      for (const row of rows) {
        map[row.model_id] = Boolean(row.enabled);
      }
    } else {
      const rows = this.db.prepare("SELECT model_id, provider_id, enabled FROM model_status").all() as Array<{
        model_id: string;
        provider_id: string;
        enabled: number;
      }>;
      for (const row of rows) {
        map[`${row.provider_id}:${row.model_id}`] = Boolean(row.enabled);
      }
    }
    return map;
  }

  setProviderModels(providerId: string, models: MODEL_META[]): void {
    const provider = this.getProviderById(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    provider.models = models;
    this.setProviderById(providerId, provider);
  }

  getCustomModels(providerId: string): MODEL_META[] {
    const provider = this.getProviderById(providerId);
    return provider?.customModels ?? [];
  }

  setCustomModels(providerId: string, models: MODEL_META[]): void {
    const provider = this.getProviderById(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    provider.customModels = models;
    this.setProviderById(providerId, provider);
  }

  addCustomModel(providerId: string, model: MODEL_META): void {
    const models = this.getCustomModels(providerId);
    models.push(model);
    this.setCustomModels(providerId, models);
  }

  removeCustomModel(providerId: string, modelId: string): void {
    const models = this.getCustomModels(providerId).filter((model) => model.id !== modelId);
    this.setCustomModels(providerId, models);
  }

  updateCustomModel(providerId: string, modelId: string, updates: Partial<MODEL_META>): void {
    const models = this.getCustomModels(providerId);
    const idx = models.findIndex((model) => model.id === modelId);
    if (idx >= 0) {
      models[idx] = { ...models[idx], ...updates };
      this.setCustomModels(providerId, models);
    }
  }

  private getModelConfigStore(): Record<string, IModelConfig> {
    return (this.store.modelConfigs as Record<string, IModelConfig> | undefined) ?? {};
  }

  private modelConfigKey(providerId: string, modelId: string): string {
    return `${providerId}::${modelId}`;
  }

  private defaultModelConfig(): ModelConfig {
    return {
      maxTokens: 0,
      contextLength: 0,
      vision: false,
      functionCall: false,
      reasoning: false,
      type: ModelType.Chat,
      imageGeneration: undefined,
      videoGeneration: undefined,
      tts: undefined,
    };
  }

  getModelConfig(modelId: string, providerId?: string): ModelConfig {
    const effectiveProviderId = providerId ?? "";
    const key = this.modelConfigKey(effectiveProviderId, modelId);
    const stored = this.getModelConfigStore()[key];
    if (stored?.config) {
      return { ...this.defaultModelConfig(), ...stored.config, isUserDefined: stored.source === "user" };
    }
    return this.defaultModelConfig();
  }

  setModelConfig(
    modelId: string,
    providerId: string,
    config: ModelConfig,
    options?: { source?: ModelConfigSource },
  ): ModelConfig {
    const source: ModelConfigSource = options?.source ?? "user";
    const normalized = {
      ...this.defaultModelConfig(),
      ...config,
      isUserDefined: source === "user",
    };
    const key = this.modelConfigKey(providerId, modelId);
    const modelConfigs = this.getModelConfigStore();
    modelConfigs[key] = {
      id: modelId,
      providerId,
      config: normalized,
      source,
    };
    this.store.modelConfigs = modelConfigs;
    this.save();
    return normalized;
  }

  resetModelConfig(modelId: string, providerId: string): void {
    const modelConfigs = this.getModelConfigStore();
    delete modelConfigs[this.modelConfigKey(providerId, modelId)];
    this.store.modelConfigs = modelConfigs;
    this.save();
  }

  getAllModelConfigs(): Record<string, IModelConfig> {
    return { ...this.getModelConfigStore() };
  }

  getProviderModelConfigs(providerId: string): Array<{ modelId: string; config: ModelConfig }> {
    return Object.values(this.getModelConfigStore())
      .filter((entry) => entry.providerId === providerId)
      .map((entry) => ({ modelId: entry.id, config: entry.config }));
  }

  hasUserModelConfig(modelId: string, providerId: string): boolean {
    const entry = this.getModelConfigStore()[this.modelConfigKey(providerId, modelId)];
    return Boolean(entry && (entry.source === "user" || entry.config.isUserDefined));
  }

  exportModelConfigs(): Record<string, IModelConfig> {
    return this.getAllModelConfigs();
  }

  importModelConfigs(configs: Record<string, IModelConfig>, overwrite = false): void {
    const current = overwrite ? {} : this.getModelConfigStore();
    for (const [key, value] of Object.entries(configs)) {
      if (!value) continue;
      current[key] = {
        ...value,
        source: value.source ?? (value.config.isUserDefined ? "user" : "provider"),
        config: {
          ...this.defaultModelConfig(),
          ...value.config,
          isUserDefined: value.source === "user" || value.config.isUserDefined === true,
        },
      };
    }
    this.store.modelConfigs = current;
    this.save();
  }

  async refreshProviderModels(providerId: string): Promise<MODEL_META[]> {
    const provider = this.getProviderById(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    if (!provider.baseUrl) {
      throw new Error(`Provider ${providerId} has no baseUrl configured`);
    }
    if (!provider.apiKey) {
      throw new Error(`Provider ${providerId} has no API key configured`);
    }

    const models = await this.fetchProviderModels(provider);
    this.setProviderModels(providerId, models);
    return models;
  }

  async listOllamaModels(providerId: string): Promise<OllamaModel[]> {
    const provider = this.getProviderById(providerId);
    if (!provider || provider.apiType !== "ollama" || !provider.baseUrl) {
      return [];
    }

    return this.fetchOllamaModels(provider.baseUrl, provider.apiKey, "/api/tags");
  }

  async listOllamaRunningModels(providerId: string): Promise<OllamaModel[]> {
    const provider = this.getProviderById(providerId);
    if (!provider || provider.apiType !== "ollama" || !provider.baseUrl) {
      return [];
    }

    return this.fetchOllamaModels(provider.baseUrl, provider.apiKey, "/api/ps");
  }

  async pullOllamaModel(providerId: string, modelName: string): Promise<boolean> {
    const provider = this.getProviderById(providerId);
    if (!provider || provider.apiType !== "ollama" || !provider.baseUrl) {
      return false;
    }

    try {
      const response = await fetch(this.resolveOllamaEndpoint(provider.baseUrl, "/api/pull"), {
        method: "POST",
        headers: this.buildOllamaHeaders(provider.apiKey),
        body: JSON.stringify({
          name: modelName,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "Unknown error");
        console.warn(
          `Failed to pull Ollama model ${modelName} for ${providerId} (${response.status}): ${errorBody.slice(0, 500)}`,
        );
        return false;
      }

      await response.text().catch(() => "");
      return true;
    } catch (error) {
      console.warn(`Failed to pull Ollama model ${modelName} for ${providerId}:`, error);
      return false;
    }
  }

  private resolveModelsEndpoint(baseUrl: string): string {
    let base = baseUrl.trim().replace(/\/+$/, "");
    if (!base) {
      throw new Error("Provider has no base URL configured");
    }
    if (base.endsWith("/chat/completions")) {
      base = base.replace(/\/chat\/completions$/, "");
    }
    if (!base.endsWith("/v1")) {
      base += "/v1";
    }
    return `${base}/models`;
  }

  private resolveOllamaBaseUrl(baseUrl: string): string {
    const normalized = (baseUrl || DEFAULT_OLLAMA_BASE_URL).trim().replace(/\/+$/, "");
    if (!normalized) {
      return DEFAULT_OLLAMA_BASE_URL;
    }

    try {
      const parsed = new URL(normalized.includes("://") ? normalized : `http://${normalized}`);
      parsed.search = "";
      parsed.hash = "";
      parsed.pathname = parsed.pathname.replace(/\/+$/, "").replace(/\/(?:api|v1)$/i, "") || "/";
      return parsed.toString().replace(/\/+$/, "");
    } catch {
      return normalized.replace(/\/(?:api|v1)$/i, "") || DEFAULT_OLLAMA_BASE_URL;
    }
  }

  private resolveOllamaEndpoint(baseUrl: string, suffix: "/api/tags" | "/api/ps" | "/api/pull"): string {
    return `${this.resolveOllamaBaseUrl(baseUrl)}${suffix}`;
  }

  private buildOllamaHeaders(apiKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey && apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
  }

  private normalizeOllamaModel(model: OllamaApiModel, fallbackName: string): OllamaModel {
    const details =
      typeof model.details === "object" && model.details
        ? (model.details as Partial<OllamaModel["details"]>)
        : undefined;
    const modelInfo =
      typeof model.model_info === "object" && model.model_info
        ? (model.model_info as Partial<NonNullable<OllamaModel["model_info"]>>)
        : undefined;

    return {
      name:
        typeof model.name === "string" && model.name.trim()
          ? model.name
          : typeof model.model === "string" && model.model.trim()
            ? model.model
            : fallbackName,
      ...(typeof model.model === "string" && model.model.trim() ? { model: model.model } : {}),
      size: typeof model.size === "number" ? model.size : 0,
      digest: typeof model.digest === "string" ? model.digest : "",
      modified_at:
        typeof model.modified_at === "string" || model.modified_at instanceof Date ? model.modified_at : new Date(),
      details: {
        format: typeof details?.format === "string" ? details.format : DEFAULT_OLLAMA_DETAILS.format,
        family: typeof details?.family === "string" ? details.family : DEFAULT_OLLAMA_DETAILS.family,
        families: Array.isArray(details?.families)
          ? details.families.filter((entry): entry is string => typeof entry === "string")
          : DEFAULT_OLLAMA_DETAILS.families,
        parameter_size:
          typeof details?.parameter_size === "string" ? details.parameter_size : DEFAULT_OLLAMA_DETAILS.parameter_size,
        quantization_level:
          typeof details?.quantization_level === "string"
            ? details.quantization_level
            : DEFAULT_OLLAMA_DETAILS.quantization_level,
      },
      ...(modelInfo ? { model_info: modelInfo as OllamaModel["model_info"] } : {}),
      ...(Array.isArray(model.capabilities)
        ? {
            capabilities: model.capabilities.filter((entry): entry is string => typeof entry === "string"),
          }
        : {}),
    };
  }

  private async fetchOllamaModels(
    baseUrl: string,
    apiKey: string,
    suffix: "/api/tags" | "/api/ps",
  ): Promise<OllamaModel[]> {
    try {
      const response = await fetch(this.resolveOllamaEndpoint(baseUrl, suffix), {
        method: "GET",
        headers: this.buildOllamaHeaders(apiKey),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "Unknown error");
        console.warn(`Failed to query Ollama ${suffix} (${response.status}): ${errorBody.slice(0, 500)}`);
        return [];
      }

      const payload = (await response.json()) as {
        models?: OllamaApiModel[];
        data?: OllamaApiModel[];
      };
      const rawModels = Array.isArray(payload.models)
        ? payload.models
        : Array.isArray(payload.data)
          ? payload.data
          : [];

      return rawModels.map((model, index) =>
        this.normalizeOllamaModel(
          model,
          typeof model.name === "string" && model.name.trim() ? model.name : `model-${index + 1}`,
        ),
      );
    } catch (error) {
      console.warn(`Failed to query Ollama models at ${suffix}:`, error);
      return [];
    }
  }

  private async fetchProviderModels(provider: {
    id: string;
    apiType: string;
    apiKey: string;
    baseUrl: string;
  }): Promise<MODEL_META[]> {
    const url = this.resolveModelsEndpoint(provider.baseUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (provider.apiType === "anthropic") {
      headers["x-api-key"] = provider.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    }

    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`Failed to refresh models for ${provider.id} (${response.status}): ${errorBody.slice(0, 500)}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{
        id?: unknown;
        name?: unknown;
        display_name?: unknown;
        owned_by?: unknown;
        description?: unknown;
        type?: unknown;
        supported_endpoint_types?: unknown;
        context_length?: unknown;
        max_tokens?: unknown;
        max_output_tokens?: unknown;
        input_token_limit?: unknown;
        output_token_limit?: unknown;
      }>;
    };
    const data = Array.isArray(payload.data) ? payload.data : [];

    return data
      .filter((model): model is NonNullable<(typeof data)[number]> & { id: string } => {
        return typeof model.id === "string" && model.id.trim().length > 0;
      })
      .map((model) => ({
        id: model.id,
        name:
          typeof model.display_name === "string"
            ? model.display_name
            : typeof model.name === "string"
              ? model.name
              : model.id,
        group: typeof model.owned_by === "string" && model.owned_by.trim() ? model.owned_by : "default",
        providerId: provider.id,
        vision: undefined,
        functionCall: undefined,
        reasoning: undefined,
        type:
          typeof model.type === "string" && model.type.toLowerCase().includes("embedding")
            ? ModelType.Embedding
            : undefined,
        contextLength:
          typeof model.context_length === "number"
            ? model.context_length
            : typeof model.input_token_limit === "number"
              ? model.input_token_limit
              : undefined,
        maxTokens:
          typeof model.max_tokens === "number"
            ? model.max_tokens
            : typeof model.max_output_tokens === "number"
              ? model.max_output_tokens
              : typeof model.output_token_limit === "number"
                ? model.output_token_limit
                : undefined,
        description: typeof model.description === "string" ? model.description : undefined,
        supportedEndpointTypes: Array.isArray(model.supported_endpoint_types)
          ? (model.supported_endpoint_types.filter((entry) => typeof entry === "string") as any)
          : undefined,
      }));
  }

  async initializeMcpHeadlessDefaults(): Promise<void> {
    return this.mcpConfig.initializeHeadlessDefaults();
  }

  async getMcpServers(): Promise<any> {
    return this.mcpConfig.getMcpServers();
  }

  async getEnabledMcpServers(): Promise<any> {
    return this.mcpConfig.getEnabledMcpServers();
  }

  async addMcpServer(name: string, config: unknown): Promise<any> {
    return this.mcpConfig.addMcpServer(name, config);
  }

  async updateMcpServer(name: string, config: unknown): Promise<any> {
    return this.mcpConfig.updateMcpServer(name, config);
  }

  async removeMcpServer(name: string): Promise<any> {
    return this.mcpConfig.removeMcpServer(name);
  }

  async setMcpServerEnabled(name: string, enabled: boolean): Promise<any> {
    return this.mcpConfig.setMcpServerEnabled(name, enabled);
  }

  async getMcpEnabled(): Promise<boolean> {
    return await this.mcpConfig.getMcpEnabled();
  }

  async setMcpEnabled(enabled: boolean): Promise<void> {
    return this.mcpConfig.setMcpEnabled(enabled);
  }

  getNpmRegistryCache(): any {
    return this.mcpConfig.getNpmRegistryCache();
  }

  setNpmRegistryCache(cache: any): void {
    return this.mcpConfig.setNpmRegistryCache(cache);
  }

  getCustomNpmRegistry(): string | undefined {
    const value = this.mcpConfig.getCustomNpmRegistry();
    return value ?? undefined;
  }

  setCustomNpmRegistry(registry: string): void {
    return this.mcpConfig.setCustomNpmRegistry(registry);
  }

  getAutoDetectNpmRegistry(): boolean {
    return this.mcpConfig.getAutoDetectNpmRegistry();
  }

  setAutoDetectNpmRegistry(enabled: boolean): void {
    return this.mcpConfig.setAutoDetectNpmRegistry(enabled);
  }

  clearNpmRegistryCache(): void {
    return this.mcpConfig.clearNpmRegistryCache();
  }

  getEffectiveNpmRegistry(): string | null {
    return this.mcpConfig.getEffectiveNpmRegistry();
  }

  async listMcpRouterServers(page: number, limit: number): Promise<any> {
    return this.mcpConfig.listMcpRouterServers(page, limit);
  }

  async installMcpRouterServer(serverKey: string): Promise<any> {
    return this.mcpConfig.installMcpRouterServer(serverKey);
  }

  async getSystemPrompts(): Promise<any[]> {
    return (this.store.systemPrompts as any[]) ?? [];
  }

  async getDefaultSystemPrompt(): Promise<string> {
    return (this.store.defaultSystemPrompt as string) ?? "";
  }

  async setDefaultSystemPrompt(prompt: string): Promise<void> {
    this.store.defaultSystemPrompt = prompt;
    this.save();
  }

  async getDefaultSystemPromptId(): Promise<string> {
    return (this.store.defaultSystemPromptId as string) ?? "";
  }

  async setDefaultSystemPromptId(promptId: string): Promise<void> {
    this.store.defaultSystemPromptId = promptId;
    this.save();
  }

  getScheduledTasksConfig(): ScheduledTasksSettings {
    const raw = this.getSetting("scheduledTasks");
    const normalized = normalizeScheduledTasksConfig(raw);
    this.setSetting("scheduledTasks", normalized);
    return normalized;
  }

  setScheduledTasksConfig(config: ScheduledTasksSettings): ScheduledTasksSettings {
    const normalized = normalizeScheduledTasksConfig(config);
    this.setSetting("scheduledTasks", normalized);
    return normalized;
  }

  getKnowledgeConfigs(): BuiltinKnowledgeConfig[] {
    return Array.isArray(this.store.knowledgeConfigs) ? (this.store.knowledgeConfigs as BuiltinKnowledgeConfig[]) : [];
  }

  setKnowledgeConfigs(configs: BuiltinKnowledgeConfig[]): void {
    this.store.knowledgeConfigs = configs;
    this.save();
  }

  async getCustomPrompts(): Promise<any[]> {
    return (this.store.customPrompts as any[]) ?? [];
  }

  async setCustomPrompts(prompts: any[]): Promise<void> {
    this.store.customPrompts = prompts;
    this.save();
  }

  async addCustomPrompt(prompt: any): Promise<void> {
    const prompts = await this.getCustomPrompts();
    prompts.push(prompt);
    this.store.customPrompts = prompts;
    this.save();
  }

  async updateCustomPrompt(promptId: string, updates: any): Promise<void> {
    const prompts = await this.getCustomPrompts();
    const idx = prompts.findIndex((p: any) => p.id === promptId);
    if (idx >= 0) {
      prompts[idx] = { ...prompts[idx], ...updates };
      this.store.customPrompts = prompts;
      this.save();
    }
  }

  async deleteCustomPrompt(promptId: string): Promise<void> {
    const prompts = await this.getCustomPrompts();
    this.store.customPrompts = prompts.filter((p: any) => p.id !== promptId);
    this.save();
  }

  async setSystemPrompts(prompts: any[]): Promise<void> {
    this.store.systemPrompts = prompts;
    this.save();
  }

  async addSystemPrompt(prompt: any): Promise<void> {
    const prompts = await this.getSystemPrompts();
    prompts.push(prompt);
    this.store.systemPrompts = prompts;
    this.save();
  }

  async updateSystemPrompt(promptId: string, updates: any): Promise<void> {
    const prompts = await this.getSystemPrompts();
    const idx = prompts.findIndex((p: any) => p.id === promptId);
    if (idx >= 0) {
      prompts[idx] = { ...prompts[idx], ...updates };
      this.store.systemPrompts = prompts;
      this.save();
    }
  }

  async deleteSystemPrompt(promptId: string): Promise<void> {
    const prompts = await this.getSystemPrompts();
    this.store.systemPrompts = prompts.filter((p: any) => p.id !== promptId);
    this.save();
  }

  async resetToDefaultPrompt(): Promise<void> {
    this.store.defaultSystemPrompt = undefined;
    this.store.defaultSystemPromptId = undefined;
    this.save();
  }

  async clearSystemPrompt(): Promise<void> {
    this.store.defaultSystemPrompt = "";
    this.save();
  }

  async getAcpEnabled(): Promise<boolean> {
    return this.acpConfig.getAcpEnabled();
  }

  async setAcpEnabled(enabled: boolean): Promise<void> {
    return this.acpConfig.setAcpEnabled(enabled);
  }

  async getAcpAgents(): Promise<any[]> {
    return this.acpConfig.getAcpAgents();
  }

  async listAcpRegistryAgents(): Promise<any[]> {
    return this.acpConfig.listAcpRegistryAgents();
  }

  async refreshAcpRegistry(force = true): Promise<any[]> {
    return this.acpConfig.refreshAcpRegistry(force);
  }

  async getAcpAgentState(agentId: string): Promise<any> {
    return this.acpConfig.getAcpAgentState(agentId);
  }

  async setAcpAgentEnabled(agentId: string, enabled: boolean): Promise<void> {
    return this.acpConfig.setAcpAgentEnabled(agentId, enabled);
  }

  async setAcpAgentEnvOverride(agentId: string, env: Record<string, string>): Promise<void> {
    return this.acpConfig.setAcpAgentEnvOverride(agentId, env);
  }

  async getAcpAgentInstallStatus(agentId: string): Promise<any> {
    return this.acpConfig.getAcpAgentInstallStatus(agentId);
  }

  async ensureAcpAgentInstalled(agentId: string): Promise<any> {
    return this.acpConfig.ensureAcpAgentInstalled(agentId);
  }

  async repairAcpAgent(agentId: string): Promise<any> {
    return this.acpConfig.repairAcpAgent(agentId);
  }

  async uninstallAcpRegistryAgent(agentId: string): Promise<void> {
    return this.acpConfig.uninstallAcpRegistryAgent(agentId);
  }

  async listManualAcpAgents(): Promise<any[]> {
    return this.acpConfig.listManualAcpAgents();
  }

  async addManualAcpAgent(agent: any): Promise<any> {
    return this.acpConfig.addManualAcpAgent(agent);
  }

  async updateManualAcpAgent(agentId: string, updates: any): Promise<any> {
    return this.acpConfig.updateManualAcpAgent(agentId, updates);
  }

  async removeManualAcpAgent(agentId: string): Promise<boolean> {
    return this.acpConfig.removeManualAcpAgent(agentId);
  }

  async resolveAcpLaunchSpec(agentId: string, workdir?: string): Promise<any> {
    return this.acpConfig.resolveAcpLaunchSpec(agentId, workdir);
  }

  async getAcpSharedMcpSelections(): Promise<string[]> {
    return this.acpConfig.getAcpSharedMcpSelections();
  }

  async setAcpSharedMcpSelections(mcpIds: string[]): Promise<void> {
    return this.acpConfig.setAcpSharedMcpSelections(mcpIds);
  }

  async getAgentMcpSelections(agentId: string, _isBuiltin?: boolean): Promise<string[]> {
    return this.acpConfig.getAgentMcpSelections(agentId);
  }

  async listAgents(): Promise<any[]> {
    // Tag ACP agents with their type — AcpAgentConfig does not carry a `type`
    // field but the Agent route contract requires `type: "argos" | "acp"`.
    const acpAgents = (await this.acpConfig.getAcpAgents()).map((agent) => ({
      ...agent,
      type: "acp" as const,
      agentType: "acp" as const,
    }));
    const argosAgents = this.argosAgentRuntime ? this.argosAgentRuntime.listAgents() : [];
    return [...acpAgents, ...argosAgents];
  }

  /**
   * Inject the daemon-owned Argos agent runtime. Once set, `listAgents` includes
   * Argos agents and the Argos CRUD/config-resolution methods delegate to it.
   */
  setArgosAgentRuntime(runtime: ArgosAgentRuntime): void {
    this.argosAgentRuntime = runtime;
  }

  async getArgosAgent(agentId: string): Promise<Agent | null> {
    return this.argosAgentRuntime ? this.argosAgentRuntime.getAgent(agentId) : null;
  }

  async getArgosAgentConfig(agentId: string): Promise<any> {
    return this.argosAgentRuntime ? this.argosAgentRuntime.getArgosAgentConfig(agentId) : null;
  }

  async resolveArgosAgentConfig(agentId: string): Promise<any> {
    if (this.argosAgentRuntime) {
      return this.argosAgentRuntime.resolveArgosAgentConfig(agentId);
    }
    const defaultModel = this.getDefaultModel();
    return normalizeArgosSubagentConfig({
      defaultModelPreset: defaultModel ? { ...defaultModel } : undefined,
      systemPrompt: (this.store.defaultSystemPrompt as string) ?? "",
      defaultProjectPath: this.getDefaultProjectPath(),
      subagentEnabled: true,
      disabledAgentTools: [],
      enabledMcpServerIds: [],
      enabledPluginIds: [],
      enabledSkillNames: [],
    });
  }

  async createArgosAgent(input: any): Promise<Agent> {
    if (!this.argosAgentRuntime) {
      throw new Error("Argos agent runtime is not available");
    }
    return this.argosAgentRuntime.createArgosAgent(input);
  }

  async updateArgosAgent(agentId: string, updates: any): Promise<Agent | null> {
    if (!this.argosAgentRuntime) {
      throw new Error("Argos agent runtime is not available");
    }
    return this.argosAgentRuntime.updateArgosAgent(agentId, updates);
  }

  async deleteArgosAgent(agentId: string): Promise<boolean> {
    if (!this.argosAgentRuntime) {
      throw new Error("Argos agent runtime is not available");
    }
    return this.argosAgentRuntime.deleteArgosAgent(agentId);
  }

  async getAcpRegistryIconMarkup(agentId: string, iconUrl?: string): Promise<string | null> {
    return this.acpConfig.getAcpRegistryIconMarkup(agentId, iconUrl);
  }

  supportsReasoningCapability(providerId: string, modelId: string): boolean {
    return false;
  }

  getReasoningPortrait(providerId: string, modelId: string): any {
    return null;
  }

  getThinkingBudgetRange(providerId: string, modelId: string): any {
    return null;
  }

  getTemperatureCapability(providerId: string, modelId: string): boolean | undefined {
    return undefined;
  }

  supportsTemperatureControl(providerId: string, modelId: string): boolean {
    return false;
  }

  supportsSearchCapability(providerId: string, modelId: string): boolean {
    return false;
  }

  getSearchDefaults(providerId: string, modelId: string): any {
    return null;
  }

  supportsAudioInputCapability(providerId: string, modelId: string): boolean {
    return false;
  }

  getFontFamily(): string {
    return (this.store.fontFamily as string) ?? "";
  }

  setFontFamily(fontFamily?: string | null): void {
    this.store.fontFamily = fontFamily ?? "";
    this.save();
  }

  getCodeFontFamily(): string {
    return (this.store.codeFontFamily as string) ?? "";
  }

  setCodeFontFamily(fontFamily?: string | null): void {
    this.store.codeFontFamily = fontFamily ?? "";
    this.save();
  }

  getAutoScrollEnabled(): boolean {
    return (this.store.autoScrollEnabled as boolean) ?? true;
  }

  setAutoScrollEnabled(enabled: boolean): void {
    this.store.autoScrollEnabled = enabled;
    this.save();
  }

  getAutoCompactionEnabled(): boolean {
    return (this.store.autoCompactionEnabled as boolean) ?? false;
  }

  setAutoCompactionEnabled(enabled: boolean): void {
    this.store.autoCompactionEnabled = enabled;
    this.save();
  }

  getAutoCompactionTriggerThreshold(): number {
    const stored = this.store.autoCompactionTriggerThreshold as number | undefined;
    if (typeof stored !== "number" || !Number.isFinite(stored)) {
      return 80;
    }
    return Math.round(stored <= 1 ? stored * 100 : stored);
  }

  setAutoCompactionTriggerThreshold(threshold: number): void {
    this.store.autoCompactionTriggerThreshold = Math.round(threshold);
    this.save();
  }

  getAutoCompactionRetainRecentPairs(): number {
    return (this.store.autoCompactionRetainRecentPairs as number) ?? 2;
  }

  setAutoCompactionRetainRecentPairs(count: number): void {
    this.store.autoCompactionRetainRecentPairs = count;
    this.save();
  }

  getContentProtectionEnabled(): boolean {
    return (this.store.contentProtectionEnabled as boolean) ?? false;
  }

  setContentProtectionEnabled(enabled: boolean): void {
    this.store.contentProtectionEnabled = enabled;
    this.save();
  }

  getPrivacyModeEnabled(): boolean {
    return (this.store.privacyModeEnabled as boolean) ?? false;
  }

  setPrivacyModeEnabled(enabled: boolean): void {
    this.store.privacyModeEnabled = enabled;
    this.save();
  }

  getNotificationsEnabled(): boolean {
    return (this.store.notificationsEnabled as boolean) ?? true;
  }

  setNotificationsEnabled(enabled: boolean): void {
    this.store.notificationsEnabled = enabled;
    this.save();
  }

  getLaunchAtLoginEnabled(): boolean {
    return (this.store.launchAtLoginEnabled as boolean) ?? false;
  }

  setLaunchAtLoginEnabled(enabled: boolean): void {
    this.store.launchAtLoginEnabled = enabled;
    this.save();
  }

  getCopyWithCotEnabled(): boolean {
    return (this.store.copyWithCotEnabled as boolean) ?? false;
  }

  setCopyWithCotEnabled(enabled: boolean): void {
    this.store.copyWithCotEnabled = enabled;
    this.save();
  }

  getLoggingEnabled(): boolean {
    return (this.store.loggingEnabled as boolean) ?? false;
  }

  setLoggingEnabled(enabled: boolean): void {
    this.store.loggingEnabled = enabled;
    this.save();
  }

  async getSystemFonts(): Promise<string[]> {
    return [];
  }

  setTraceDebugEnabled(enabled: boolean): void {
    this.store.traceDebugEnabled = enabled;
    this.save();
  }
}
