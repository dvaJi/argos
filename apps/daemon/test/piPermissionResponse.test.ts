import { describe, expect, it, vi } from "bun:test";
import { PiProviderExecutionPort } from "../src/host/pi-provider-execution";

describe("Pi permission response cleanup", () => {
  it("clears a stale permission block instead of silently doing nothing", async () => {
    const blocks = [
      {
        id: "tool-1",
        type: "action",
        action_type: "tool_call_permission",
        status: "pending",
        timestamp: 1,
        content: "Pi requests permission to run bash.",
        tool_call: { id: "tool-1", name: "bash", params: "{}" },
      },
    ];
    const updateAssistantContent = vi.fn(async () => undefined);
    const publish = vi.fn();
    const sessionRepository = {
      listMessages: vi.fn(async () => [{ id: "message-1", content: JSON.stringify(blocks) }]),
      updateAssistantContent,
    };
    const port = new PiProviderExecutionPort(
      {} as never,
      sessionRepository as never,
      {} as never,
      { publish, subscribe: vi.fn() } as never,
      { listTools: async () => [], callTool: async () => ({ content: [] }) } as never,
      "C:/tmp/argos-workspace",
    );

    const result = await port.respondToolInteraction("session-1", "message-1", "tool-1", {
      kind: "permission",
      granted: true,
    });

    expect(result).toEqual({ handledInline: true });
    expect(updateAssistantContent).toHaveBeenCalledWith(
      "message-1",
      expect.arrayContaining([expect.objectContaining({ id: "tool-1", status: "denied" })]),
    );
    expect(publish).toHaveBeenCalledWith(
      "chat.stream.updated",
      expect.objectContaining({
        kind: "snapshot",
        sessionId: "session-1",
        messageId: "message-1",
        blocks: expect.arrayContaining([expect.objectContaining({ id: "tool-1", status: "denied" })]),
      }),
    );
  });

  it("resolves a live permission request through the worker", async () => {
    const sent: unknown[] = [];
    const port = new PiProviderExecutionPort(
      {} as never,
      { updateAssistantContent: vi.fn(async () => undefined) } as never,
      {} as never,
      { publish: vi.fn(), subscribe: vi.fn() } as never,
      { listTools: async () => [], callTool: async () => ({ content: [] }) } as never,
      "C:/tmp/argos-workspace",
    );
    const worker = {
      process: { stdin: { write: (data: string) => sent.push(JSON.parse(data)) } },
      turn: {
        commandId: "cmd-1",
        requestId: "req-1",
        messageId: "message-1",
        // Pi emits tool_execution_start before the permission hook, so the
        // tool_call block with the same id precedes the permission action.
        blocks: [
          {
            id: "tool-1",
            type: "tool_call",
            status: "loading",
            timestamp: 1,
            tool_call: { id: "tool-1", name: "bash", params: "{}" },
          },
          {
            id: "tool-1",
            type: "action",
            action_type: "tool_call_permission",
            status: "pending",
            timestamp: 2,
            content: "Permission",
          },
        ],
        resolve: () => undefined,
        reject: () => undefined,
        startedAt: Date.now(),
        prompt: "fix",
      },
    };
    (port as any).workers.set("session-1", worker);
    (port as any).interactions.set("tool-1", {
      worker: worker.process,
      workerRequestId: "worker-req-1",
      blockId: "tool-1",
      kind: "permission",
    });

    const result = await port.respondToolInteraction("session-1", "message-1", "tool-1", {
      kind: "permission",
      granted: false,
    });

    expect(result).toEqual({ resumed: true, handledInline: true });
    expect(sent).toContainEqual({ type: "permissionResponse", id: "worker-req-1", granted: false });
    expect(worker.turn.blocks[0]?.status).toBe("loading");
    expect(worker.turn.blocks[1]?.status).toBe("denied");
  });
});

describe("Pi session create schema", () => {
  it("keeps planMode when creating a session", async () => {
    const { CreateSessionInputSchema } = await import("@argos/shared-contracts/routes/sessions.routes");
    const parsed = CreateSessionInputSchema.parse({ agentId: "argos", message: "hi", planMode: true });
    expect(parsed.planMode).toBe(true);
  });
});
