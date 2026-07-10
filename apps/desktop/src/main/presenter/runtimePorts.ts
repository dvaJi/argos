import type { AcpConfigState, HistorySearchHit } from "@shared/presenter";
import type {
  AgentTransferImpact,
  MessageTraceRecord,
  SessionCompactionState,
  SessionWithState,
} from "@shared/types/agent-interface";
import type { SearchResult } from "@shared/types/core/search";
import type { ArgosTapeViewManifestRecord } from "@shared/types/tape-view-manifest";
import type { ConversationExportFormat } from "./exporter/formats/conversationExporter";

type ModelIdentity = {
  id: string;
  name?: string | null;
};

export type SessionPermissionRequest = {
  permissionType: "read" | "write" | "all" | "command";
  serverName?: string;
  toolName?: string;
  command?: string;
  commandSignature?: string;
  paths?: string[];
  commandInfo?: {
    command: string;
    riskLevel: "low" | "medium" | "high" | "critical";
    suggestion: string;
    signature?: string;
    baseCommand?: string;
  };
};

export interface ProviderCatalogPort {
  getProviderModels(providerId: string): ModelIdentity[];
  getCustomModels(providerId: string): ModelIdentity[];
  getAgentType(agentId: string): Promise<"argos" | "acp" | null>;
}

export interface ProviderSessionPort {
  setAcpWorkdir(conversationId: string, agentId: string, workdir: string | null): Promise<void>;
  prepareAcpSession(conversationId: string, agentId: string, workdir: string): Promise<void>;
  getAcpSessionConfigOptions(conversationId: string): Promise<AcpConfigState | null>;
  setAcpSessionConfigOption(
    conversationId: string,
    configId: string,
    value: string | boolean,
  ): Promise<AcpConfigState | null>;
  getAcpSessionCommands(conversationId: string): Promise<
    Array<{
      name: string;
      description: string;
      input?: { hint: string } | null;
    }>
  >;
  clearAcpSession(conversationId: string): Promise<void>;
}

export interface DaemonAcpSessionPort {
  getAcpSessionConfigOptions(conversationId: string): Promise<AcpConfigState | null>;
  setAcpSessionConfigOption(
    conversationId: string,
    configId: string,
    value: string | boolean,
  ): Promise<AcpConfigState | null>;
  getAcpSessionCommands(conversationId: string): Promise<
    Array<{
      name: string;
      description: string;
      input?: { hint: string } | null;
    }>
  >;
}

export interface DaemonSessionQueryPort {
  searchHistory(query: string, options?: { limit?: number }): Promise<HistorySearchHit[]>;
  getSearchResults(messageId: string, searchId?: string): Promise<SearchResult[]>;
  listMessageTraces(messageId: string): Promise<MessageTraceRecord[]>;
  getViewManifests(sessionId: string): Promise<ArgosTapeViewManifestRecord[]>;
  getViewLineage(sessionId: string): Promise<ArgosTapeViewManifestRecord[]>;
  translateText(text: string, locale?: string, agentId?: string): Promise<string>;
}

export interface DaemonSessionActionPort {
  compactSession(sessionId: string): Promise<{ compacted: boolean; state: SessionCompactionState }>;
  exportSession(sessionId: string, format: ConversationExportFormat): Promise<{ filename: string; content: string }>;
  getAgentTransferImpact(agentId: string): Promise<AgentTransferImpact>;
  moveAgentSessions(
    fromAgentId: string,
    toAgentId: string,
  ): Promise<{ movedSessionIds: string[]; deletedSessionIds: string[] }>;
  deleteAgentSessions(agentId: string): Promise<string[]>;
  moveSessionToAgent(sessionId: string, toAgentId: string): Promise<SessionWithState>;
}

export interface SessionPermissionPort {
  clearSessionPermissions(sessionId: string): void;
  approvePermission(sessionId: string, permission: SessionPermissionRequest): Promise<void>;
}

export interface SessionUiPort {
  refreshSessionUi(): void;
}

export interface WindowRoutingPort {
  createSettingsWindow(): Promise<number>;
  sendToWindow(windowId: number, channel: string, ...args: unknown[]): void;
}
