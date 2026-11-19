import { describe, it, expect } from "vitest";
import type * as schema from "@agentclientprotocol/sdk/unstable";
import { AcpContentMapper } from "@argos/acp-runtime";

const createNotification = <T extends schema.SessionNotification["update"]>(
  sessionId: string,
  update: T,
): schema.SessionNotification => ({
  sessionId,
  update,
});

describe("AcpContentMapper tool call handling", () => {
  it("emits tool call start/chunk/end events for ACP fragments", () => {
    const mapper = new AcpContentMapper();
    const toolCallId = "tool-1";

    const start = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "tool_call",
        toolCallId,
        title: "write_file",
        status: "in_progress",
        rawInput: { path: "/tmp" },
      }),
    );

    const startEvent = start.events.find((event) => event.type === "tool_call_start");
    expect(startEvent).toMatchObject({
      type: "tool_call_start",
      tool_call_id: toolCallId,
      tool_call_name: "write_file",
    });

    const chunkEvent = start.events.find((event) => event.type === "tool_call_chunk");
    expect(chunkEvent).toMatchObject({
      type: "tool_call_chunk",
      tool_call_id: toolCallId,
      tool_call_arguments_chunk: '{"path":"/tmp"}',
    });

    const completion = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: "completed",
      }),
    );

    const endEvent = completion.events.find((event) => event.type === "tool_call_end");
    expect(endEvent).toMatchObject({
      type: "tool_call_end",
      tool_call_id: toolCallId,
      tool_call_arguments_complete: '{"path":"/tmp"}',
    });
  });

  it("tracks tool call state per session to avoid id collisions", () => {
    const mapper = new AcpContentMapper();

    const first = mapper.map(
      createNotification("session-a", {
        sessionUpdate: "tool_call",
        toolCallId: "shared-id",
        title: "list_files",
        status: "in_progress",
      }),
    );

    const second = mapper.map(
      createNotification("session-b", {
        sessionUpdate: "tool_call",
        toolCallId: "shared-id",
        title: "write_file",
        status: "in_progress",
      }),
    );

    const firstStart = first.events.find((event) => event.type === "tool_call_start");
    const secondStart = second.events.find((event) => event.type === "tool_call_start");

    expect(firstStart).toBeTruthy();
    expect(secondStart).toBeTruthy();
    expect(firstStart && firstStart.tool_call_name).toBe("list_files");
    expect(secondStart && secondStart.tool_call_name).toBe("write_file");
  });
});

describe("AcpContentMapper plan handling", () => {
  it("emits structured plan entries", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "plan",
        entries: [
          { content: "Analyze requirements", status: "completed", priority: "high" },
          { content: "Implement feature", status: "in_progress", priority: "high" },
          { content: "Write tests", status: "pending", priority: "medium" },
        ],
      }),
    );

    expect(result.planEntries).toHaveLength(3);
    expect(result.planEntries![0]).toMatchObject({
      content: "Analyze requirements",
      status: "completed",
      priority: "high",
    });
    expect(result.planEntries![1]).toMatchObject({
      content: "Implement feature",
      status: "in_progress",
    });
  });

  it("emits a plan block alongside the structured plan entries", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "plan",
        entries: [
          { content: "Step 1", status: "completed" },
          { content: "Step 2", status: "in_progress" },
        ],
      }),
    );

    const reasoningEvent = result.events.find((e) => e.type === "reasoning");
    expect(reasoningEvent).toBeTruthy();
    expect(reasoningEvent?.reasoning_content).toBe("");

    const planBlock = result.blocks.find((block) => block.type === "plan");
    expect(planBlock?.extra).toMatchObject({
      plan_entries: [
        { content: "Step 1", status: "completed", priority: null },
        { content: "Step 2", status: "in_progress", priority: null },
      ],
    });
  });

  it("preserves plan entry statuses in the structured payload", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "plan",
        entries: [
          { content: "Done task", status: "completed" },
          { content: "Current task", status: "in_progress" },
          { content: "Future task", status: "pending" },
        ],
      }),
    );

    expect(result.planEntries).toEqual([
      { content: "Done task", status: "completed", priority: null },
      { content: "Current task", status: "in_progress", priority: null },
      { content: "Future task", status: "pending", priority: null },
    ]);
  });

  it("handles empty plan entries gracefully", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "plan",
        entries: [],
      }),
    );

    expect(result.planEntries).toBeUndefined();
    expect(result.events).toHaveLength(0);
  });
});

describe("AcpContentMapper mode handling", () => {
  it("emits mode change with currentModeId", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "current_mode_update",
        currentModeId: "architect",
      }),
    );

    expect(result.currentModeId).toBe("architect");
  });

  it("emits reasoning event for mode change", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "current_mode_update",
        currentModeId: "code",
      }),
    );

    const reasoningEvent = result.events.find((e) => e.type === "reasoning");
    expect(reasoningEvent).toBeTruthy();
    expect(reasoningEvent?.reasoning_content).toContain("Mode changed to: code");
  });

  it("stores mode change in block extra data", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "current_mode_update",
        currentModeId: "ask",
      }),
    );

    const block = result.blocks.find((b) => b.type === "reasoning_content");
    expect(block?.extra).toMatchObject({ mode_change: "ask" });
  });
});

describe("AcpContentMapper reasoning handling", () => {
  it("tags every agent_thought_chunk with a reasoningStartTime", () => {
    const mapper = new AcpContentMapper();

    const first = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "first" },
      }),
    );
    const second = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "second" },
      }),
    );

    expect(first.reasoningStartTime).toEqual(expect.any(Number));
    expect(second.reasoningStartTime).toEqual(expect.any(Number));
    expect(first.blocks.filter((b) => b.type === "reasoning_content")).toHaveLength(1);
    expect(second.blocks.filter((b) => b.type === "reasoning_content")).toHaveLength(1);
  });
});

describe("AcpContentMapper available commands handling", () => {
  it("normalizes available commands from ACP updates", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          {
            name: " review ",
            description: " Run review ",
            input: { hint: "ticket id" },
          },
          {
            name: "plan",
            description: "",
          },
        ],
      }),
    );

    expect(result.availableCommands).toEqual([
      {
        name: "review",
        description: "Run review",
        input: { hint: "ticket id" },
      },
      {
        name: "plan",
        description: "",
        input: null,
      },
    ]);
  });
});

describe("AcpContentMapper config options handling", () => {
  it("normalizes config_option_update payloads into config state", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "gpt-5",
            options: [
              { value: "gpt-5", name: "gpt-5" },
              { value: "gpt-5-mini", name: "gpt-5-mini" },
            ],
          },
          {
            id: "safe_edits",
            name: "Safe Edits",
            type: "boolean",
            currentValue: true,
          },
        ],
      }),
    );

    expect(result.configState).toEqual({
      source: "configOptions",
      options: [
        {
          id: "model",
          label: "Model",
          description: null,
          category: "model",
          type: "select",
          currentValue: "gpt-5",
          options: [
            {
              value: "gpt-5",
              label: "gpt-5",
              description: null,
              groupId: null,
              groupLabel: null,
            },
            {
              value: "gpt-5-mini",
              label: "gpt-5-mini",
              description: null,
              groupId: null,
              groupLabel: null,
            },
          ],
        },
        {
          id: "safe_edits",
          label: "Safe Edits",
          description: null,
          type: "boolean",
          category: null,
          currentValue: true,
        },
      ],
    });
    expect(result.events).toHaveLength(0);
  });
});

describe("AcpContentMapper session metadata updates", () => {
  it("maps session_info_update into session metadata", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "session_info_update",
        title: "Imported Session",
        updatedAt: "2026-06-02T10:00:00.000Z",
        _meta: { source: "agent" },
      }),
    );

    expect(result.sessionInfo).toEqual({
      title: "Imported Session",
      updatedAt: "2026-06-02T10:00:00.000Z",
      meta: { source: "agent" },
    });
  });

  it("maps usage_update into ACP usage metadata without standard token usage", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "usage_update",
        used: 42,
        size: 128,
        cost: { amount: 0.01, currency: "USD" },
      }),
    );

    expect(result.usage).toEqual({
      used: 42,
      size: 128,
      cost: { amount: 0.01, currency: "USD" },
      meta: null,
    });
    expect(result.events).toEqual([]);
  });
});

describe("AcpContentMapper plan_update / plan_removed handling", () => {
  it("replaces plan entries from an items plan_update", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "plan_update",
        plan: {
          type: "items",
          planId: "plan-1",
          entries: [{ content: "Step 1", priority: "high", status: "in_progress" }],
        },
      }),
    );

    expect(result.planEntries).toEqual([{ content: "Step 1", priority: "high", status: "in_progress" }]);
    const planBlock = result.blocks.find((b) => b.type === "plan");
    expect(planBlock?.extra).toMatchObject({
      plan_entries: [{ content: "Step 1", priority: "high", status: "in_progress" }],
    });
  });

  it("renders a markdown plan as content text with its path", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "plan_update",
        plan: {
          type: "markdown",
          planId: "plan-2",
          content: "# Refactor plan",
          path: "/tmp/plan.md",
        },
      }),
    );

    const contentBlock = result.blocks.find((b) => b.type === "content");
    expect(contentBlock?.content).toContain("# Refactor plan");
    expect(contentBlock?.content).toContain("/tmp/plan.md");
  });

  it("clears plan entries on plan_removed", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "plan_removed",
        planId: "plan-1",
      }),
    );

    expect(result.planEntries).toEqual([]);
    expect(result.blocks.find((b) => b.type === "plan")).toBeTruthy();
  });
});

describe("AcpContentMapper notice handling", () => {
  it("renders notices with severity prefix and description", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "notice",
        severity: "warning",
        title: "Rate limit near",
        description: "Slow down",
      }),
    );

    const contentBlock = result.blocks.find((b) => b.type === "content");
    expect(contentBlock?.content).toBe("Warning: Rate limit near — Slow down");
  });

  it("renders error notices with an Error prefix and info notices without one", () => {
    const mapper = new AcpContentMapper();

    const error = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "notice",
        severity: "error",
        title: "Agent crashed",
      }),
    );
    const info = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "notice",
        severity: "info",
        title: "Heads up",
      }),
    );

    expect(error.blocks.find((b) => b.type === "content")?.content).toBe("Error: Agent crashed");
    expect(info.blocks.find((b) => b.type === "content")?.content).toBe("Heads up");
  });
});

describe("AcpContentMapper compaction handling", () => {
  it("emits one block per compaction status transition", () => {
    const mapper = new AcpContentMapper();

    const started = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "compaction_update",
        compactionId: "c1",
        status: "in_progress",
      }),
    );
    const repeated = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "compaction_update",
        compactionId: "c1",
        status: "in_progress",
      }),
    );
    const completed = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "compaction_update",
        compactionId: "c1",
        status: "completed",
      }),
    );

    const texts = (blocks: ReturnType<typeof started.blocks.concat>) =>
      blocks.filter((b) => b.type === "content").map((b) => b.content);
    expect(texts(started.blocks)).toEqual(["Context compaction in_progress"]);
    expect(texts(repeated.blocks)).toEqual([]);
    expect(texts(completed.blocks)).toEqual(["Context compaction completed"]);
  });

  it("reports failed compactions with their error", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "compaction_update",
        compactionId: "cx",
        status: "failed",
        error: "boom",
      }),
    );

    expect(result.blocks.find((b) => b.type === "content")?.content).toBe("Context compaction failed: boom");
  });

  it("renders a replacement summary only when no chunks were streamed", () => {
    const mapper = new AcpContentMapper();

    const withSummary = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "compaction_update",
        compactionId: "c2",
        status: "completed",
        summary: [{ type: "text", text: "Compacted summary" }],
      }),
    );

    expect(withSummary.blocks.filter((b) => b.type === "content").map((b) => b.content)).toEqual([
      "Context compaction completed",
      "Compacted summary",
    ]);
  });

  it("suppresses the replacement summary after compaction_summary_chunk", () => {
    const mapper = new AcpContentMapper();

    const chunk = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "compaction_summary_chunk",
        compactionId: "c3",
        content: { type: "text", text: "streamed chunk" },
      }),
    );
    const replacement = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "compaction_update",
        compactionId: "c3",
        status: "completed",
        summary: [{ type: "text", text: "full replacement" }],
      }),
    );

    expect(chunk.blocks.find((b) => b.type === "content")?.content).toBe("streamed chunk");
    expect(replacement.blocks.filter((b) => b.type === "content").map((b) => b.content)).toEqual([
      "Context compaction completed",
    ]);
  });
});

describe("AcpContentMapper prompt suggestions handling", () => {
  it("maps text suggestions into promptSuggestions, dropping non-text ones", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "prompt_suggestions_update",
        suggestions: [
          {
            prompt: [
              { type: "text", text: "Review the" },
              { type: "text", text: " latest diff" },
            ],
          },
          { prompt: [{ type: "resource_link", uri: "file:///tmp/x.ts", name: "x.ts" }] },
        ],
      }),
    );

    expect(result.promptSuggestions).toEqual(["Review the latest diff"]);
  });

  it("clears suggestions with an empty update", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "prompt_suggestions_update",
        suggestions: [],
      }),
    );

    expect(result.promptSuggestions).toEqual([]);
  });
});

describe("AcpContentMapper subagent handling", () => {
  const subagentUpdate = (overrides: Record<string, unknown> = {}) =>
    createNotification("session-1", {
      sessionUpdate: "subagent_update",
      sessionId: "child-1",
      ...overrides,
    } as never);

  it("creates a virtual tool call for a running child and completes it on idle", () => {
    const mapper = new AcpContentMapper();

    const running = mapper.map(subagentUpdate({ state: { state: "running" }, title: "Research agent" }));
    const startEvent = running.events.find((e) => e.type === "tool_call_start");
    expect(startEvent).toMatchObject({
      type: "tool_call_start",
      tool_call_id: "child-1",
      tool_call_name: "Research agent",
    });

    const idle = mapper.map(subagentUpdate({ state: { state: "idle", stopReason: "done" } }));
    expect(idle.events.find((e) => e.type === "tool_call_end")).toMatchObject({
      type: "tool_call_end",
      tool_call_id: "child-1",
    });
    expect(idle.blocks.find((b) => b.type === "tool_call")?.status).toBe("success");
  });

  it("completes a child as failed when the state carries an error", () => {
    const mapper = new AcpContentMapper();

    mapper.map(subagentUpdate({ state: { state: "running" } }));
    const failed = mapper.map(subagentUpdate({ state: { state: "idle", error: "boom" } }));

    expect(failed.blocks.find((b) => b.type === "tool_call")?.status).toBe("error");
  });

  it("leaves requires_action children open", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(subagentUpdate({ state: { state: "requires_action" } }));

    expect(result.events.find((e) => e.type === "tool_call_end")).toBeUndefined();
    expect(result.events.find((e) => e.type === "tool_call_start")).toBeTruthy();
  });

  it("streams session message chunks into the owning child's output", () => {
    const mapper = new AcpContentMapper();

    mapper.map(subagentUpdate({ state: { state: "running" }, title: "Coder" }));
    const chunk = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "session_message_chunk",
        messageId: "msg-1",
        content: { type: "text", text: "hello " },
      }),
    );
    expect(chunk.events.find((e) => e.type === "tool_call_chunk")).toMatchObject({
      type: "tool_call_chunk",
      tool_call_id: "child-1",
      tool_call_arguments_chunk: "hello ",
    });

    const second = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "session_message_chunk",
        messageId: "msg-1",
        content: { type: "text", text: "world" },
      }),
    );
    expect(second.events.find((e) => e.type === "tool_call_chunk")?.tool_call_arguments_chunk).toBe("world");
  });

  it("ignores chunks without a known owner", () => {
    const mapper = new AcpContentMapper();

    const result = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "session_message_chunk",
        messageId: "unknown-msg",
        content: { type: "text", text: "orphan" },
      }),
    );

    expect(result.events).toEqual([]);
    expect(result.blocks).toEqual([]);
  });

  it("attributes session messages by sender and skips content already streamed by chunks", () => {
    const mapper = new AcpContentMapper();

    const message = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "session_message",
        messageId: "msg-2",
        senderSessionId: "child-2",
        content: [{ type: "text", text: "full content" }],
      }),
    );
    expect(message.events.find((e) => e.type === "tool_call_start")).toMatchObject({
      tool_call_id: "child-2",
    });
    expect(message.events.find((e) => e.type === "tool_call_chunk")?.tool_call_arguments_chunk).toBe("full content");

    // A follow-up full message for the same id after streamed chunks must not duplicate.
    mapper.map(
      createNotification("session-1", {
        sessionUpdate: "session_message_chunk",
        messageId: "msg-2",
        content: { type: "text", text: " streamed" },
      }),
    );
    const repeat = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "session_message",
        messageId: "msg-2",
        content: [{ type: "text", text: "full content streamed" }],
      }),
    );
    expect(repeat.events.find((e) => e.type === "tool_call_chunk")).toBeUndefined();
  });
});

describe("AcpContentMapper cursor handling", () => {
  it("tracks cursors with patch semantics and emits the full list", () => {
    const mapper = new AcpContentMapper();

    const first = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "cursor_update",
        cursorId: "cursor-1",
        anchor: { type: "tool_call", toolCallId: "tool-9", position: "after" },
        capabilities: { fork: {} },
      }),
    );
    expect(first.cursors).toEqual([
      { cursorId: "cursor-1", forkable: true, anchorType: "tool_call", anchorId: "tool-9", position: "after" },
    ]);

    // Omitted capabilities leave forkability unchanged; null clears it.
    const second = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "cursor_update",
        cursorId: "cursor-1",
      }),
    );
    expect(second.cursors?.[0]?.forkable).toBe(true);
    const cleared = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "cursor_update",
        cursorId: "cursor-1",
        capabilities: null,
      }),
    );
    expect(cleared.cursors?.[0]?.forkable).toBe(false);
    expect(cleared.cursors?.[0]?.anchorType).toBe("tool_call");
  });

  it("registers a second cursor independently", () => {
    const mapper = new AcpContentMapper();

    mapper.map(
      createNotification("session-1", {
        sessionUpdate: "cursor_update",
        cursorId: "cursor-1",
        anchor: { type: "agent_message", messageId: "m1", position: "after" },
        capabilities: { fork: {} },
      }),
    );
    const second = mapper.map(
      createNotification("session-1", {
        sessionUpdate: "cursor_update",
        cursorId: "cursor-2",
        anchor: { type: "compaction", compactionId: "c1", position: "before" },
      }),
    );

    expect(second.cursors).toHaveLength(2);
    expect(second.cursors?.map((cursor) => cursor.cursorId)).toEqual(["cursor-1", "cursor-2"]);
    expect(second.cursors?.[1]?.forkable).toBe(false);
  });
});
