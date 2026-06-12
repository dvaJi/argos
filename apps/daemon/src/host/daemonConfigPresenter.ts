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
}

export function notImplemented(method: string): never {
  throw new Error(`DaemonConfigPresenter.${method} is not implemented for daemon mode`);
}
