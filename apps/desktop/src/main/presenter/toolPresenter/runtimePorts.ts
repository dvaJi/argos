import type { IFilePresenter, ILlmProviderPresenter, IWindowPresenter, IYoBrowserPresenter } from "@argos/shared/presenter";
import type {
  ArgosSubagentMeta,
  ArgosSubagentSlot,
  AgentTapeAnchorResult,
  AgentTapeAnchorsOptions,
  AgentTapeInfo,
  AgentTapeSearchOptions,
  AgentTapeSearchResult,
  PermissionMode,
  SendMessageInput,
  SessionGenerationSettings,
  SessionKind,
} from "@argos/shared/types/agent-interface";
import type { ISkillPresenter } from "@argos/shared/types/skill";
import type { AgentMemoryCategory } from "@argos/shared/types/agent-memory";
import type { ArgosInternalSessionUpdate } from "../agentRuntimePresenter/internalSessionEvents";
import type { MemoryWriteOutcome } from "../memoryPresenter/types";

export interface ConversationSessionInfo {
  sessionId: string;
  agentId: string;
  agentName: string;
  agentType: "argos" | "acp" | null;
  providerId: string;
  modelId: string;
  projectDir: string | null;
  permissionMode: PermissionMode;
  generationSettings: SessionGenerationSettings | null;
  disabledAgentTools: string[];
  activeSkills: string[];
  sessionKind: SessionKind;
  parentSessionId: string | null;
  subagentEnabled: boolean;
  subagentMeta: ArgosSubagentMeta | null;
  availableSubagentSlots: ArgosSubagentSlot[];
}

export interface CreateSubagentSessionInput {
  parentSessionId: string;
  agentId: string;
  slotId: string;
  displayName: string;
  targetAgentId?: string | null;
  projectDir?: string | null;
  providerId: string;
  modelId: string;
  permissionMode: PermissionMode;
  generationSettings?: Partial<SessionGenerationSettings>;
  disabledAgentTools?: string[];
  activeSkills?: string[];
}

export interface AgentToolRuntimePort {
  resolveConversationWorkdir(conversationId: string): Promise<string | null>;
  resolveConversationSessionInfo(conversationId: string): Promise<ConversationSessionInfo | null>;
  getTapeInfo?(conversationId: string): Promise<AgentTapeInfo>;
  searchTape?(
    conversationId: string,
    query: string,
    options?: AgentTapeSearchOptions,
  ): Promise<AgentTapeSearchResult[]>;
  listTapeAnchors?(conversationId: string, options?: AgentTapeAnchorsOptions): Promise<AgentTapeAnchorResult[]>;
  handoffTape?(conversationId: string, name: string, state?: Record<string, unknown>): Promise<AgentTapeAnchorResult>;
  isMemoryEnabled?(agentId: string): Promise<boolean> | boolean;
  rememberMemory?(
    agentId: string,
    input: {
      content: string;
      kind: "semantic" | "episodic";
      category?: AgentMemoryCategory | null;
      importance?: number;
    },
    sourceSession?: string | null,
    model?: { providerId: string; modelId: string } | null,
  ): Promise<MemoryWriteOutcome>;
  recallMemory?(agentId: string, query: string): Promise<Array<{ id: string; kind: string; content: string }>>;
  forgetMemory?(agentId: string, memoryId: string): Promise<boolean>;
  createSubagentSession(input: CreateSubagentSessionInput): Promise<ConversationSessionInfo | null>;
  mergeSubagentTape?(parentSessionId: string, childSessionId: string, meta?: Record<string, unknown>): Promise<void>;
  discardSubagentTape?(parentSessionId: string, childSessionId: string, meta?: Record<string, unknown>): Promise<void>;
  sendConversationMessage(conversationId: string, content: string | SendMessageInput): Promise<void>;
  cancelConversation(conversationId: string): Promise<void>;
  subscribeArgosSessionUpdates(listener: (update: ArgosInternalSessionUpdate) => void): () => void;
  getSkillPresenter(): ISkillPresenter;
  getYoBrowserToolHandler(): IYoBrowserPresenter["toolHandler"];
  getFilePresenter(): Pick<IFilePresenter, "getMimeType" | "prepareFileCompletely">;
  getLlmProviderPresenter(): Pick<
    ILlmProviderPresenter,
    "executeWithRateLimit" | "generateCompletionStandalone" | "generateImageStandalone"
  >;
  cacheImage?(data: string): Promise<string>;
  createSettingsWindow(): ReturnType<IWindowPresenter["createSettingsWindow"]>;
  sendToWindow(windowId: number, channel: string, ...args: unknown[]): ReturnType<IWindowPresenter["sendToWindow"]>;
  getApprovedFilePaths(conversationId: string, requiredPermission?: "read" | "write" | "all"): string[];
  consumeSettingsApproval(conversationId: string, toolName: string): boolean;
}
