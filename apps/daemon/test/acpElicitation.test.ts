import { describe, it, expect, vi } from "bun:test";
import type * as schema from "@agentclientprotocol/sdk/unstable";
import { AcpProviderExecutionPort } from "../src/host/acp-provider-execution";

const createPort = () => {
  const publish = vi.fn();
  const port = new AcpProviderExecutionPort({} as never, {} as never, { publish } as never, {
    dataDir: "/tmp",
    appVersion: "1.0.0",
    toolchains: {} as never,
    db: { prepare: vi.fn() },
  });
  return { port, publish };
};

const formRequest = (overrides: Record<string, unknown> = {}): schema.CreateElicitationRequest =>
  ({
    mode: "form",
    sessionId: "conversation-1",
    message: "Which database should I use?",
    requestedSchema: {
      type: "object",
      title: "Database choice",
      description: "The engine for the new project",
      properties: {
        engine: { type: "string", title: "Engine" },
      },
      required: ["engine"],
    },
    ...overrides,
  }) as unknown as schema.CreateElicitationRequest;

const findElicitationBlock = (publish: ReturnType<typeof vi.fn>) => {
  const call = publish.mock.calls.find((c) => c[0] === "chat.stream.updated");
  expect(call).toBeTruthy();
  const payload = call![1] as { blocks: Array<Record<string, any>> };
  const block = payload.blocks.find((b) => b.action_type === "elicitation_request");
  expect(block).toBeTruthy();
  return block!;
};

describe("ACP elicitation", () => {
  it("publishes an elicitation_request block and resolves accept with content", async () => {
    const { port, publish } = createPort();

    const pending = (port as any).handleElicitationRequest("conversation-1", "assistant-1", "request-1", formRequest());

    const block = findElicitationBlock(publish);
    expect(block).toMatchObject({
      type: "action",
      status: "pending",
      content: "Which database should I use?",
    });
    expect(block.extra.needsUserAction).toBe(true);
    expect(typeof block.extra.elicitationRequestId).toBe("string");
    const elicitationPayload = JSON.parse(block.extra.elicitationPayload as string) as Record<string, unknown>;
    expect(elicitationPayload).toMatchObject({
      message: "Which database should I use?",
      title: "Database choice",
      description: "The engine for the new project",
      required: ["engine"],
      toolCallId: null,
    });

    const respondPromise = port.respondToolInteraction(
      "conversation-1",
      "assistant-1",
      block.extra.elicitationRequestId,
      {
        kind: "elicitation",
        action: "accept",
        content: { engine: "postgres" },
      },
    );
    await expect(pending).resolves.toEqual({ action: "accept", content: { engine: "postgres" } });
    await expect(respondPromise).resolves.toEqual({ handledInline: true });
  });

  it("resolves decline and ignores stale responses", async () => {
    const { port } = createPort();

    const pending = (port as any).handleElicitationRequest("conversation-1", "assistant-1", "request-1", formRequest());

    const stale = await port.respondToolInteraction("conversation-1", "assistant-1", "missing-id", {
      kind: "elicitation",
      action: "cancel",
    });
    expect(stale).toEqual({ handledInline: true });
    // The real pending elicitation is untouched by the stale response.
    expect((port as any).pendingElicitations.size).toBe(1);

    const elicitationRequestId = (port as any).pendingElicitations.keys().next().value as string;
    await expect(
      port.respondToolInteraction("conversation-1", "assistant-1", elicitationRequestId, {
        kind: "elicitation",
        action: "decline",
      }),
    ).resolves.toEqual({ handledInline: true });
    await expect(pending).resolves.toEqual({ action: "decline" });
  });

  it("declines non-form elicitation modes without surfacing a block", async () => {
    const { port, publish } = createPort();

    await expect(
      (port as any).handleElicitationRequest("conversation-1", "assistant-1", "request-1", {
        mode: "url",
        sessionId: "conversation-1",
        elicitationId: "e1",
        url: "https://example.com/login",
        message: "Please log in",
      } as unknown as schema.CreateElicitationRequest),
    ).resolves.toEqual({ action: "decline" });

    expect(publish).not.toHaveBeenCalled();
  });

  it("cancels pending elicitations when the turn is cancelled", async () => {
    const { port } = createPort();
    (port as any).runtimePromise = Promise.resolve({ sessionManager: { clearSession: vi.fn() } });

    const pending = (port as any).handleElicitationRequest("conversation-1", "assistant-1", "request-1", formRequest());
    await port.cancelGeneration("conversation-1");

    await expect(pending).resolves.toEqual({ action: "cancel" });
  });
});
