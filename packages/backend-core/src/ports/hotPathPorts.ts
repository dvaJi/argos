import type {
  ChatMessagePageResult,
  ChatMessageRecord,
  CreateSessionInput,
  MessagePageCursor,
  MessageStartResult,
  SendMessageInput,
  SessionWithState,
  ToolInteractionResponse,
  ToolInteractionResult,
} from "@argos/shared/types/agent-interface";
import type { ArgosEventName, ArgosEventPayload } from "@argos/shared-contracts/events";
import type { AcpAgentDiagnostics, AcpDebugRequest, AcpDebugRunResult } from "@argos/shared/presenter";

export type SessionListFilters = {
  agentId?: string;
  projectDir?: string;
  includeSubagents?: boolean;
  parentSessionId?: string;
};

export interface SessionRepository {
  create(input: CreateSessionInput, webContentsId: number): Promise<SessionWithState>;
  get(sessionId: string): Promise<SessionWithState | null>;
  list(filters?: SessionListFilters): Promise<SessionWithState[]>;
  activate(webContentsId: number, sessionId: string): Promise<void>;
  deactivate(webContentsId: number): Promise<void>;
  getActive(webContentsId: number): Promise<SessionWithState | null>;
}

export interface MessageRepository {
  listBySession(sessionId: string): Promise<ChatMessageRecord[]>;
  listPageBySession(
    sessionId: string,
    options?: {
      limit?: number;
      cursor?: MessagePageCursor | null;
    },
  ): Promise<ChatMessagePageResult>;
  get(messageId: string): Promise<ChatMessageRecord | null>;
}

export interface ProviderExecutionPort {
  sendMessage(sessionId: string, content: string | SendMessageInput): Promise<MessageStartResult>;
  steerActiveTurn(sessionId: string, content: string | SendMessageInput): Promise<void>;
  cancelGeneration(sessionId: string): Promise<void>;
  warmupAcpProcess?(agentId: string, workdir?: string): Promise<void>;
  getAcpProcessConfigOptions?(agentId: string, workdir?: string): Promise<unknown>;
  runAcpDebugAction?(request: AcpDebugRequest): Promise<AcpDebugRunResult>;
  getAcpAgentDiagnostics?(agentId: string, workdir?: string | null): Promise<AcpAgentDiagnostics>;
  generateCompletion?(input: {
    providerId: string;
    modelId: string;
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
  transcribeAudio?(
    providerId: string,
    modelId: string,
    audioBase64: string,
    mimeType: string,
    filename?: string,
  ): Promise<string>;
  respondToolInteraction(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    response: ToolInteractionResponse,
  ): Promise<ToolInteractionResult>;
  testConnection(
    providerId: string,
    modelId?: string,
  ): Promise<{
    isOk: boolean;
    errorMsg: string | null;
  }>;
}

type ModelIdentity = {
  id: string;
  name?: string | null;
};

export interface ProviderCatalogPort {
  getProviderModels(providerId: string): ModelIdentity[];
  getCustomModels(providerId: string): ModelIdentity[];
  getAgentType(agentId: string): Promise<"argos" | "acp" | null>;
}

export interface SessionPermissionPort {
  clearSessionPermissions(sessionId: string): void;
}

export interface WindowEventPort {
  publish<T extends ArgosEventName>(name: T, payload: ArgosEventPayload<T>): void;
}
