import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { DEFAULT_PROVIDERS } from "@argos/backend-core";
import type { LLM_PROVIDER } from "@shared/presenter";
import { DaemonAcpConfig } from "./daemonAcpConfig";
import { DaemonMcpConfig } from "./daemonMcpConfig";

type Store = Record<string, unknown>;

const DEFAULTS: Store = {
  language: "en",
  theme: "system",
  floatingButtonEnabled: true,
  syncEnabled: false,
  syncFolderPath: "",
  init_complete: false,
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

  constructor(configDir: string, dataDir: string = configDir) {
    this.filePath = join(configDir, "config.json");
    this.store = this.load();
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

  setProviderById(id: string, provider: any): void {
    const providers = this.getProviders();
    const idx = providers.findIndex((p: any) => p.id === id);
    if (idx >= 0) {
      providers[idx] = provider;
    } else {
      providers.push(provider);
    }
    this.store.providers = providers;
    this.save();
  }

  addProviderAtomic(provider: any): void {
    const providers = this.getProviders();
    providers.push(provider);
    this.store.providers = providers;
    this.save();
  }

  removeProviderAtomic(providerId: string): void {
    const providers = this.getProviders().filter((p: any) => p.id !== providerId);
    this.store.providers = providers;
    this.save();
  }

  updateProviderAtomic(id: string, updates: any): boolean {
    const providers = this.getProviders();
    const idx = providers.findIndex((p: any) => p.id === id);
    if (idx >= 0) {
      providers[idx] = { ...providers[idx], ...updates };
      this.store.providers = providers;
      this.save();
      return true;
    }
    return false;
  }

  reorderProvidersAtomic(providers: any[]): void {
    this.store.providers = providers;
    this.save();
  }

  getProviderById(id: string): any {
    const providers = this.getProviders() as any[];
    return providers.find((p) => p.id === id);
  }

  getProviderModels(providerId: string): any[] {
    const provider = this.getProviderById(providerId);
    return provider?.models ?? [];
  }

  getCustomModels(providerId: string): any[] {
    const provider = this.getProviderById(providerId);
    return provider?.customModels ?? [];
  }

  async getMcpServers(): Promise<any> {
    return this.mcpConfig.getMcpServers();
  }

  async getEnabledMcpServers(): Promise<any> {
    return this.mcpConfig.getEnabledMcpServers();
  }

  async addMcpServer(name: string, config: any): Promise<any> {
    return this.mcpConfig.addMcpServer(name, config);
  }

  async updateMcpServer(name: string, config: any): Promise<any> {
    return this.mcpConfig.updateMcpServer(name, config);
  }

  async removeMcpServer(name: string): Promise<any> {
    return this.mcpConfig.removeMcpServer(name);
  }

  async setMcpServerEnabled(name: string, enabled: boolean): Promise<any> {
    return this.mcpConfig.setMcpServerEnabled(name, enabled);
  }

  getMcpEnabled(): boolean {
    return this.mcpConfig.getMcpEnabled();
  }

  async setMcpEnabled(enabled: boolean): Promise<any> {
    return this.mcpConfig.setMcpEnabled(enabled);
  }

  getNpmRegistryCache(): any {
    return this.mcpConfig.getNpmRegistryCache();
  }

  setNpmRegistryCache(cache: any): void {
    return this.mcpConfig.setNpmRegistryCache(cache);
  }

  getCustomNpmRegistry(): string | null {
    return this.mcpConfig.getCustomNpmRegistry();
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

  getKnowledgeConfigs(): any[] {
    return (this.store.knowledgeConfigs as any[]) ?? [];
  }

  setKnowledgeConfigs(configs: any[]): void {
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
    return this.acpConfig.getAcpAgents();
  }

  async resolveArgosAgentConfig(_agentId: string): Promise<any> {
    return null;
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

export function notImplemented(method: string): never {
  throw new Error(`DaemonConfigPresenter.${method} is not implemented for daemon mode`);
}
