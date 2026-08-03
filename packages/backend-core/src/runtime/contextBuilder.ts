import { estimateTokenCount } from "tokenx";
import type { ChatMessage } from "@argos/shared/types/core/chat-message";
import type { MCPToolDefinition } from "@argos/shared/types/core/mcp";

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const message of messages) {
    total += estimateMessageTokens(message);
  }
  return total;
}

function estimateMessageTokens(message: ChatMessage): number {
  let tokens = 0;

  if (typeof message.content === "string") {
    tokens += estimateTokenCount(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "text" && typeof part.text === "string") {
        tokens += estimateTokenCount(part.text);
      } else if (part.type === "image_url") {
        tokens += 1000;
      }
    }
  }

  if (message.role) tokens += 4;

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      tokens += 4;
      if (toolCall.function?.name) tokens += estimateTokenCount(toolCall.function.name);
      if (toolCall.function?.arguments) tokens += estimateTokenCount(toolCall.function.arguments);
    }
  }

  if (message.tool_call_id) {
    tokens += estimateTokenCount(message.tool_call_id);
  }

  return tokens;
}

export function estimateToolDefinitionTokens(tools: MCPToolDefinition[]): number {
  let total = 0;
  for (const tool of tools) {
    total += 4;
    if (tool.function?.name) total += estimateTokenCount(tool.function.name);
    if (tool.function?.description) total += estimateTokenCount(tool.function.description);
    if (tool.function?.parameters) {
      total += estimateTokenCount(JSON.stringify(tool.function.parameters));
    }
  }
  return total;
}

export function fitMessagesToContextWindow(
  messages: ChatMessage[],
  usableContextLength: number,
  reserveTokens: number,
  minimumProtectedTailCount: number,
): ChatMessage[] {
  const availableTokens = usableContextLength - reserveTokens;
  if (availableTokens <= 0) return messages.slice(-minimumProtectedTailCount);

  let totalTokens = 0;
  const result: ChatMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const messageTokens = estimateMessageTokens(message);

    if (result.length < minimumProtectedTailCount || totalTokens + messageTokens <= availableTokens) {
      result.unshift(message);
      totalTokens += messageTokens;
    } else {
      break;
    }
  }

  return result;
}
