import type { Scheduler } from "../scheduler/scheduler";

export interface IConfigPresenterPort {
  getSetting<T>(key: string): T | undefined;
  setSetting<T>(key: string, value: T): void;
  getProviders(): unknown[];
  getProviderById(id: string): unknown;
  getProviderModels(providerId: string): unknown[];
  getCustomModels(providerId: string): unknown[];
  getAgentType(agentId: string): Promise<string | null>;
  getMcpServers(): unknown;
  getLanguage(): string;
  getTheme(): string;
  getShortcutKeys(): unknown;
  listAgents(): unknown[];
  getSystemPrompts(): unknown[];
  getDefaultSystemPrompt(): unknown;
  getDefaultProjectPath(): string | undefined;
  getFloatingButton(): unknown;
  getKnowledgeConfigs(): unknown;
  getSyncSettings(): unknown;
  getVoiceAiConfig(): unknown;
  getGeminiSafety(): unknown;
  getAwsBedrockCredential(): unknown;
  getAzureApiVersion(): string | undefined;
  getEntries(): unknown[];
  updateEntries(changes: unknown[]): void;
}

export interface IProviderPresenterPort {
  check(providerId: string, modelId?: string): Promise<{ isOk: boolean; errorMsg: string | null }>;
  getProviderRateLimitStatus(providerId: string): unknown;
  refreshModels(providerId: string): Promise<void>;
  listOllamaModels(providerId: string): Promise<unknown[]>;
  listOllamaRunningModels(providerId: string): Promise<unknown[]>;
  pullOllamaModels(providerId: string, modelName: string): Promise<boolean>;
  warmupAcpProcess(agentId: string, workdir?: string): Promise<void>;
}

export type Tier1RouteRuntime = {
  configPresenter: IConfigPresenterPort;
  providerPresenter: IProviderPresenterPort;
  scheduler: Scheduler;
};
