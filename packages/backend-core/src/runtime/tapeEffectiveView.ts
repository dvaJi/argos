import type { ChatMessageRecord } from "@shared/types/agent-interface";

export type TapeEffectiveViewEntry = {
  sessionId: string;
  messageId: string;
  role: string;
  content: string;
  createdAt: number;
  metadata: string;
};

export function buildEffectiveTapeView(messages: ChatMessageRecord[]): TapeEffectiveViewEntry[] {
  return messages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => ({
      sessionId: msg.sessionId,
      messageId: msg.id,
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      createdAt: msg.createdAt,
      metadata: msg.metadata ?? "{}",
    }));
}
