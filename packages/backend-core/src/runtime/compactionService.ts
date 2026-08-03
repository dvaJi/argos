import { estimateTokenCount } from "tokenx";

export interface CompactionResult {
  compactedMessages: Array<{ role: string; content: string }>;
  originalTokenCount: number;
  compactedTokenCount: number;
  compressionRatio: number;
}

export function compactMessages(
  messages: Array<{ role: string; content: string }>,
  targetTokens: number,
): CompactionResult {
  let totalTokens = 0;
  for (const msg of messages) {
    totalTokens += estimateTokenCount(msg.content);
  }

  if (totalTokens <= targetTokens) {
    return {
      compactedMessages: messages,
      originalTokenCount: totalTokens,
      compactedTokenCount: totalTokens,
      compressionRatio: 1,
    };
  }

  const ratio = targetTokens / totalTokens;
  const compacted = messages.map((msg) => ({
    role: msg.role,
    content: msg.content.slice(0, Math.floor(msg.content.length * ratio)),
  }));

  let compactedTokens = 0;
  for (const msg of compacted) {
    compactedTokens += estimateTokenCount(msg.content);
  }

  return {
    compactedMessages: compacted,
    originalTokenCount: totalTokens,
    compactedTokenCount: compactedTokens,
    compressionRatio: compactedTokens / totalTokens,
  };
}
