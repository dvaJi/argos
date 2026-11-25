import { describe, expect, it } from "vitest";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import { buildAssistantRenderItems } from "./messageActivityGroups";

function block(value: Record<string, unknown>): DisplayAssistantMessageBlock {
  return {
    type: "content",
    status: "success",
    timestamp: 1,
    ...value,
  } as DisplayAssistantMessageBlock;
}

function keysFor(blocks: DisplayAssistantMessageBlock[]): string[] {
  return buildAssistantRenderItems({
    blocks,
    messageId: "message-1",
    messageUpdatedAt: 10,
    shouldGroup: false,
  }).map((item) => item.key);
}

describe("buildAssistantRenderItems keys", () => {
  it("keeps a tool call and its permission action unique when they share a toolCallId", () => {
    const keys = keysFor([
      block({
        id: "call_1",
        type: "tool_call",
        status: "success",
        timestamp: 2,
        tool_call: { id: "call_1", name: "bash", params: "{}" },
      }),
      block({
        id: "call_1",
        type: "action",
        action_type: "tool_call_permission",
        status: "pending",
        timestamp: 3,
        content: "Pi requests permission to run bash.",
      }),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("deduplicates repeated tool-call status snapshots", () => {
    const keys = keysFor([
      block({
        id: "call_1",
        type: "tool_call",
        status: "loading",
        timestamp: 2,
        tool_call: { id: "call_1", name: "bash", params: "{}" },
      }),
      block({
        id: "call_1",
        type: "tool_call",
        status: "success",
        timestamp: 3,
        tool_call: { id: "call_1", name: "bash", params: "{}" },
      }),
    ]);
    expect(keys).toHaveLength(1);
  });
});
