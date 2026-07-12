import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildAssistantResponseMarkdown,
  extractWaitingInteraction,
  emitArgosInternalSessionUpdate,
  subscribeArgosInternalSessionUpdates,
} from "#/presenter/agentRuntimePresenter/internalSessionEvents";

describe("internalSessionEvents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("swallows subscriber errors when emitting session updates", () => {
    const consoleError = vi.spyOn<(...args: any[]) => any>(console, "error").mockImplementation(() => {});
    const unsubscribe = subscribeArgosInternalSessionUpdates(() => {
      throw new Error("listener failed");
    });

    try {
      expect(() =>
        emitArgosInternalSessionUpdate({
          sessionId: "session-1",
          kind: "status",
          status: "idle",
          updatedAt: Date.now(),
        }),
      ).not.toThrow("expected error");

      expect(consoleError).toHaveBeenCalledWith(
        "[ArgosInternalSessionEvents] Failed to emit session update:",
        expect.any(Error),
      );
    } finally {
      unsubscribe();
    }
  });

  it("returns the earliest pending waiting interaction", () => {
    const waitingInteraction = extractWaitingInteraction(
      [
        {
          type: "tool_call",
          status: "pending",
          timestamp: 1,
          tool_call: { id: "tc1", name: "ask_one", params: "{}", response: "" },
        },
        {
          type: "action",
          action_type: "question_request",
          status: "pending",
          timestamp: 2,
          content: "First",
          tool_call: { id: "tc1", name: "ask_one", params: "{}" },
          extra: { needsUserAction: true, questionText: "First" },
        },
        {
          type: "tool_call",
          status: "pending",
          timestamp: 3,
          tool_call: { id: "tc2", name: "ask_two", params: "{}", response: "" },
        },
        {
          type: "action",
          action_type: "question_request",
          status: "pending",
          timestamp: 4,
          content: "Second",
          tool_call: { id: "tc2", name: "ask_two", params: "{}" },
          extra: { needsUserAction: true, questionText: "Second" },
        },
      ],
      "message-1",
    );

    expect(waitingInteraction).toEqual({
      type: "question",
      messageId: "message-1",
      toolCallId: "tc1",
      actionBlock: {
        type: "action",
        action_type: "question_request",
        status: "pending",
        timestamp: 2,
        content: "First",
        tool_call: { id: "tc1", name: "ask_one", params: "{}" },
        extra: { needsUserAction: true, questionText: "First" },
      },
    });
  });

  it("preserves indentation and blank lines in assistant response markdown", () => {
    const responseMarkdown = buildAssistantResponseMarkdown([
      {
        type: "content",
        status: "success",
        timestamp: 1,
        content: ["```yaml", "items:", "  - name: foo", "", "  - name: bar", "```"].join("\n"),
      },
    ]);

    expect(responseMarkdown).toBe(["```yaml", "items:", "  - name: foo", "", "  - name: bar", "```"].join("\n"));
  });
});
