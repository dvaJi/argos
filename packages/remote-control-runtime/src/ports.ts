/**
 * Dependency-injection ports for the remote-control runtime.
 *
 * The runtime is framework-agnostic: it never imports `electron`. Hosts (the
 * daemon `DaemonRemoteControlRuntime`, or tests) construct these ports from
 * their own primitives and inject them. This is what makes the bot runtimes
 * runnable in both the Bun daemon and (for tests) pure Node.
 */

import type {
  ChatMessageRecord,
  SendMessageInput,
  SessionWithState,
  CreateSessionInput,
} from "@shared/types/agent-interface";

/** Read/write the persisted `remoteControl` config blob (a single JSON value). */
export interface ConfigPort {
  getSetting<T>(key: string): T | null | undefined;
  setSetting(key: string, value: unknown): void;
}

/** Minimal provider shape the conversation runner reads (id + display name). */
export interface RemoteProviderInfo {
  id: string;
  name: string;
}

/** Minimal enabled-model-group shape the conversation runner reads. */
export interface RemoteModelGroupInfo {
  providerId: string;
  models: Array<{ id: string; name?: string }>;
}

/** Minimal agent shape the conversation runner reads for `/agent` + `/model` menus. */
export interface RemoteAgentInfo {
  id: string;
  name: string;
  type: "argos" | "acp";
  source?: "builtin" | "manual" | "registry";
  enabled?: boolean;
}

/**
 * The broader config surface the conversation runner needs (agent/provider/model
 * resolution + project path), on top of the blob read/write. Both the desktop
 * `IConfigPresenter` and a daemon adapter implement this.
 */
export interface RemoteConfigPort extends ConfigPort {
  getAgentType(agentId: string): Promise<string>;
  getEnabledProviders(): RemoteProviderInfo[];
  getAllEnabledModels(): Promise<RemoteModelGroupInfo[]>;
  listAgents(): Promise<RemoteAgentInfo[]>;
  getDefaultProjectPath(): string | null;
}

/**
 * The session/message surface the conversation runner drives for an incoming bot
 * message. Mirrors the subset of `IAgentSessionPresenter` used by
 * `RemoteConversationRunner` (desktop), minus the desktop-only window calls
 * (`activateSession` — handled by the desktop `/open` UX shim, not the runtime).
 */
export interface AgentSessionPort {
  createDetachedSession(input: {
    title?: string;
    agentId?: string;
    projectDir?: string;
    providerId?: string;
    modelId?: string;
  }): Promise<SessionWithState>;
  getSession(sessionId: string): Promise<SessionWithState | null>;
  getSessionList(input: { agentId?: string }): Promise<SessionWithState[]>;
  getMessages(sessionId: string): Promise<ChatMessageRecord[]>;
  getMessage(messageId: string): Promise<ChatMessageRecord | null>;
  sendMessage(sessionId: string, content: string | SendMessageInput): Promise<void>;
  setSessionModel(sessionId: string, providerId: string, modelId: string): Promise<SessionWithState>;
  respondToolInteraction(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    response: unknown,
  ): Promise<{ waitingForUserMessage: boolean }>;
  getSearchResults?(messageId: string, searchId?: string): Promise<import("@shared/types/core/search").SearchResult[]>;
}

/**
 * Live-generation tracking. The conversation runner polls
 * `getActiveGeneration` while streaming a bot reply to find the in-flight
 * assistant event. The daemon's provider-execution port exposes this (it tracks
 * running generations internally); the desktop presenter exposes it via
 * `AgentRuntimePresenter`.
 */
export interface GenerationPort {
  getActiveGeneration(sessionId: string): { eventId: string; runId: string } | null;
  cancelGenerationByEventId(sessionId: string, eventId: string): boolean;
}

/** Optional file-preparation hook (desktop `filePresenter`). Null in daemon v1. */
export interface FilePort {
  prepareFile(filePath: string, mediaType?: string): Promise<import("@shared/types/agent-interface").MessageFile>;
}

export interface RemoteControlRuntimePorts {
  configPort: RemoteConfigPort;
  /** Directory for attachment I/O + generated-image cache (replaces `app.getPath("userData")`). */
  dataDir: string;
  sessionPort: AgentSessionPort;
  generationPort: GenerationPort;
  filePort?: FilePort;
  /**
   * Optional desktop-only hook for the `/open` bot command (focus a chat window).
   * When absent (daemon/headless), `/open` returns `windowNotFound`.
   */
  onOpenEndpoint?: (endpointKey: string) => Promise<{ status: string }>;
  /**
   * When true, the runtime manages config/pairing/status only and does NOT start
   * channel adapters (`initialize()` and the per-channel `rebuild*Runtime()` calls
   * skip adapter connection). Used by the daemon until its agent-loop runtime lands
   * (the conversation runner needs generation tracking that the daemon lacks today).
   * `getChannelStatus` reports `stopped` in this mode.
   */
  configOnly?: boolean;
  /** Override for tests; defaults to `Date.now`. */
  now?: () => number;
}

export type { ChatMessageRecord, SendMessageInput, SessionWithState, CreateSessionInput };
