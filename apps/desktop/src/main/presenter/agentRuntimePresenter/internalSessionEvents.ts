import { EventEmitter } from "events";
import type { AssistantMessageBlock } from "@argos/shared/types/agent-interface";

export type ArgosInternalSessionRuntimeStatus = "idle" | "generating" | "blocked" | "done" | "error";

export interface ArgosInternalSessionWaitingInteraction {
  type: "permission" | "question";
  messageId: string;
  toolCallId: string;
  actionBlock: AssistantMessageBlock;
}

export interface ArgosInternalSessionUpdate {
  sessionId: string;
  kind: "blocks" | "status";
  updatedAt: number;
  messageId?: string;
  status?: ArgosInternalSessionRuntimeStatus;
  previewMarkdown?: string;
  responseMarkdown?: string;
  waitingInteraction?: ArgosInternalSessionWaitingInteraction | null;
}

const emitter = new EventEmitter();

const extractBlockText = (block: AssistantMessageBlock): string[] => {
  if (block.type === "action") {
    const questionText = typeof block.extra?.questionText === "string" ? block.extra.questionText : "";
    const permissionText =
      typeof block.content === "string"
        ? block.content
        : typeof block.extra?.permissionRequest === "string"
          ? block.extra.permissionRequest
          : "";

    return [questionText || permissionText];
  }

  if (block.type === "tool_call") {
    return [typeof block.tool_call?.response === "string" ? block.tool_call.response : ""];
  }

  if (block.type === "error") {
    return [typeof block.content === "string" ? block.content : ""];
  }

  return [typeof block.content === "string" ? block.content : ""];
};

const toDisplayLines = (text: string): string[] => text.split(/\r?\n/);

export const buildAssistantResponseMarkdown = (blocks: AssistantMessageBlock[]): string =>
  blocks.flatMap(extractBlockText).flatMap(toDisplayLines).join("\n");

export const buildAssistantPreviewMarkdown = (blocks: AssistantMessageBlock[]): string => {
  const lines = buildAssistantResponseMarkdown(blocks)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.slice(-3).join("\n");
};

export const extractWaitingInteraction = (
  blocks: AssistantMessageBlock[],
  messageId: string,
): ArgosInternalSessionWaitingInteraction | null => {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (
      block.type !== "action" ||
      block.status !== "pending" ||
      block.extra?.needsUserAction !== true ||
      !block.tool_call?.id
    ) {
      continue;
    }

    if (block.action_type === "tool_call_permission") {
      return {
        type: "permission",
        messageId,
        toolCallId: block.tool_call.id,
        actionBlock: JSON.parse(JSON.stringify(block)) as AssistantMessageBlock,
      };
    }

    if (block.action_type === "question_request") {
      return {
        type: "question",
        messageId,
        toolCallId: block.tool_call.id,
        actionBlock: JSON.parse(JSON.stringify(block)) as AssistantMessageBlock,
      };
    }
  }

  return null;
};

export const emitArgosInternalSessionUpdate = (update: ArgosInternalSessionUpdate): void => {
  try {
    emitter.emit("update", update);
  } catch (error) {
    console.error("[ArgosInternalSessionEvents] Failed to emit session update:", error);
  }
};

export const subscribeArgosInternalSessionUpdates = (
  listener: (update: ArgosInternalSessionUpdate) => void,
): (() => void) => {
  emitter.on("update", listener);
  return () => emitter.off("update", listener);
};
