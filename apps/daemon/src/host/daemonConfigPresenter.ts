import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

type Store = Record<string, unknown>;

const DEFAULTS: Store = {
  language: "en",
  theme: "system",
  floatingButtonEnabled: true,
  syncEnabled: false,
  syncFolderPath: "",
  init_complete: false,
};

export class DaemonConfigPresenter {
  private store: Store;
  private filePath: string;

  constructor(configDir: string) {
    this.filePath = join(configDir, "config.json");
    this.store = this.load();
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

  getProviders(): any[] {
    return (this.store.providers as any[]) ?? [];
  }

  setProviders(providers: any[]): void {
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
    return this.store.mcpServers ?? {};
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
    return (this.store.acpEnabled as boolean) ?? false;
  }

  async getAcpAgents(): Promise<any[]> {
    return (this.store.acpAgents as any[]) ?? [];
  }

  async getAcpSharedMcpSelections(): Promise<string[]> {
    return (this.store.acpSharedMcpSelections as string[]) ?? [];
  }

  async setAcpSharedMcpSelections(mcpIds: string[]): Promise<void> {
    this.store.acpSharedMcpSelections = mcpIds;
    this.save();
  }

  async getAgentMcpSelections(agentId: string, isBuiltin?: boolean): Promise<string[]> {
    const map = (this.store.agentMcpSelections as Record<string, string[]>) ?? {};
    return map[agentId] ?? [];
  }

  async listAgents(): Promise<any[]> {
    return (this.store.agents as any[]) ?? [];
  }

  async resolveDeepChatAgentConfig(agentId: string): Promise<any> {
    return null;
  }

  async getAcpRegistryIconMarkup(agentId: string, iconUrl?: string): Promise<string | null> {
    return null;
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
    return (this.store.autoCompactionTriggerThreshold as number) ?? 0.8;
  }

  setAutoCompactionTriggerThreshold(threshold: number): void {
    this.store.autoCompactionTriggerThreshold = threshold;
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
