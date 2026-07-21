import type {
  ArgosSessionState,
  ChatMessageRecord,
  IAgentImplementation,
  MessageStartResult,
  SendMessageInput,
  SessionAgentContextUpdate,
} from "@argos/shared/types/agent-interface";

const DAEMON_ONLY_ERROR =
  "Argos agent execution is daemon-owned and runs on Pi. The removed desktop agent harness cannot execute sessions.";

/**
 * Desktop-shell compatibility boundary.
 *
 * The Electron presenter graph still requires an IAgentImplementation while
 * native-only routes are being extracted. It must never execute an agent turn:
 * all Argos chat/session routes go through the daemon and Pi worker.
 */
export class AgentRuntimePresenter implements IAgentImplementation {
  constructor(..._removedHarnessDependencies: unknown[]) {}

  async initSession(
    _sessionId: string,
    _config: Partial<SessionAgentContextUpdate> & Pick<SessionAgentContextUpdate, "providerId" | "modelId">,
  ): Promise<void> {
    throw new Error(DAEMON_ONLY_ERROR);
  }

  async setSessionAgentContext(_sessionId: string, _config: SessionAgentContextUpdate): Promise<void> {
    throw new Error(DAEMON_ONLY_ERROR);
  }

  async destroySession(_sessionId: string): Promise<void> {
    throw new Error(DAEMON_ONLY_ERROR);
  }

  async getSessionState(_sessionId: string): Promise<ArgosSessionState | null> {
    return null;
  }

  async processMessage(_sessionId: string, _content: string | SendMessageInput): Promise<MessageStartResult> {
    throw new Error(DAEMON_ONLY_ERROR);
  }

  async cancelGeneration(_sessionId: string): Promise<void> {
    throw new Error(DAEMON_ONLY_ERROR);
  }

  async getMessages(_sessionId: string): Promise<ChatMessageRecord[]> {
    return [];
  }

  async getMessageIds(_sessionId: string): Promise<string[]> {
    return [];
  }

  async getMessage(_messageId: string): Promise<ChatMessageRecord | null> {
    return null;
  }
}
