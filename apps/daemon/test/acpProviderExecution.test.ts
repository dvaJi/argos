import { describe, expect, it, vi } from "vitest";
import { AcpProviderExecutionPort } from "../src/host/acp-provider-execution";

describe("AcpProviderExecutionPort", () => {
  const permissionRequest = {
    sessionId: "acp-session",
    toolCall: {
      toolCallId: "tool-1",
      title: "Read package.json",
      rawInput: { path: "package.json" },
    },
    options: [
      { optionId: "allow-once", kind: "allow_once" },
      { optionId: "reject-once", kind: "reject_once" },
    ],
  } as any;

  it("publishes and persists decoded ACP assistant text chunks", async () => {
    const addMessage = vi.fn(async () => "persisted-assistant-1");
    const publish = vi.fn();
    const port = new AcpProviderExecutionPort({} as never, { addMessage } as never, { publish } as never, {
      dataDir: "/tmp",
      appVersion: "1.0.0",
      db: { prepare: vi.fn() },
    });
    const runtime = {
      async *runPromptTurn() {
        yield {
          sessionId: "acp-session",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Open" },
          },
        };
        yield {
          sessionId: "acp-session",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Code" },
          },
        };
        yield {
          sessionId: "acp-session",
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: { type: "text", text: "The" },
          },
        };
        yield {
          sessionId: "acp-session",
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: { type: "text", text: " user" },
          },
        };
        yield {
          sessionId: "acp-session",
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "tool-1",
            title: "Read package.json",
            rawInput: { path: "package.json" },
          },
        };
      },
    };

    await (port as any).runTurn(
      runtime,
      "conversation-1",
      { id: "opencode", name: "OpenCode" },
      [{ type: "text", text: "hello" }],
      new AbortController(),
      "request-1",
      "assistant-1",
    );

    expect(publish).toHaveBeenCalledWith(
      "chat.stream.updated",
      expect.objectContaining({
        requestId: "request-1",
        sessionId: "conversation-1",
        messageId: "persisted-assistant-1",
        blocks: expect.arrayContaining([
          expect.objectContaining({ content: "OpenCode", status: "success" }),
          expect.objectContaining({ type: "reasoning_content", content: "The user" }),
          expect.objectContaining({ type: "tool_call", tool_call: expect.objectContaining({ id: "tool-1" }) }),
        ]),
      }),
    );
    expect(addMessage).toHaveBeenCalledWith("conversation-1", "assistant", expect.stringContaining("OpenCode"));
  });

  it("allows ACP tool permissions once in full access mode", async () => {
    const port = new AcpProviderExecutionPort(
      {} as never,
      { getPermissionMode: vi.fn(async () => "full_access") } as never,
      { publish: vi.fn() } as never,
      { dataDir: "/tmp", appVersion: "1.0.0", db: { prepare: vi.fn() } },
    );

    await expect(
      (port as any).handlePermissionRequest("conversation-1", "message-1", "request-1", permissionRequest),
    ).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "allow-once" },
    });
  });

  it("waits for the existing tool interaction response in default mode", async () => {
    const publish = vi.fn();
    const port = new AcpProviderExecutionPort(
      {} as never,
      { getPermissionMode: vi.fn(async () => "default") } as never,
      { publish } as never,
      { dataDir: "/tmp", appVersion: "1.0.0", db: { prepare: vi.fn() } },
    );

    const pending = (port as any).handlePermissionRequest(
      "conversation-1",
      "message-1",
      "request-1",
      permissionRequest,
    );
    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      "chat.stream.updated",
      expect.objectContaining({
        blocks: [expect.objectContaining({ action_type: "tool_call_permission", status: "pending" })],
      }),
    );
    await expect(
      port.respondToolInteraction("conversation-1", "message-1", "tool-1", { kind: "permission", granted: true }),
    ).resolves.toEqual({ handledInline: true });
    await expect(pending).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
  });
});
