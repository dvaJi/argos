import { describe, expect, it, vi } from "vitest";
import { AcpProviderExecutionPort } from "../src/host/acp-provider-execution";
import { resolvePermissionWithTimeout, AcpMessageFormatter } from "@argos/acp-runtime";

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

  it("exposes the active ACP turn identifiers", () => {
    const port = new AcpProviderExecutionPort({} as never, {} as never, { publish: vi.fn() } as never, {
      dataDir: "/tmp",
      appVersion: "1.0.0",
      db: { prepare: vi.fn() },
    });
    (port as any).activeTurns.set("session-1", {
      controller: new AbortController(),
      eventId: "assistant-1",
      runId: "request-1",
    });

    expect(port.getActiveGeneration("session-1")).toEqual({ eventId: "assistant-1", runId: "request-1" });
  });

  it("publishes and persists decoded ACP assistant text chunks", async () => {
    const finalizeAssistantMessage = vi.fn(async () => undefined);
    const setMessageError = vi.fn(async () => undefined);
    const publish = vi.fn();
    const port = new AcpProviderExecutionPort(
      {} as never,
      { finalizeAssistantMessage, setMessageError } as never,
      { publish } as never,
      {
        dataDir: "/tmp",
        appVersion: "1.0.0",
        db: { prepare: vi.fn() },
      },
    );
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
        messageId: "assistant-1",
        blocks: expect.arrayContaining([
          expect.objectContaining({ content: "OpenCode", status: "success" }),
          expect.objectContaining({ type: "reasoning_content", content: "The user" }),
          expect.objectContaining({ type: "tool_call", tool_call: expect.objectContaining({ id: "tool-1" }) }),
        ]),
      }),
    );
    expect(finalizeAssistantMessage).toHaveBeenCalledWith(
      "assistant-1",
      expect.arrayContaining([expect.objectContaining({ content: "OpenCode", status: "success" })]),
      expect.any(String),
    );
    expect(setMessageError).not.toHaveBeenCalled();
  });

  it("persists usage_update data into usage stats and message metadata", async () => {
    const finalizeAssistantMessage = vi.fn(async () => undefined);
    const setMessageError = vi.fn(async () => undefined);
    const upsertUsageStat = vi.fn();
    const publish = vi.fn();
    const port = new AcpProviderExecutionPort(
      {} as never,
      { finalizeAssistantMessage, setMessageError, upsertUsageStat } as never,
      { publish } as never,
      {
        dataDir: "/tmp",
        appVersion: "1.0.0",
        db: { prepare: vi.fn() },
      },
    );
    const runtime = {
      async *runPromptTurn() {
        yield {
          sessionId: "acp-session",
          update: {
            sessionUpdate: "usage_update",
            used: 1000,
            size: 5000,
            cost: { amount: 0.42, currency: "USD" },
          },
        };
        yield {
          sessionId: "acp-session",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "done" },
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

    expect(upsertUsageStat).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "assistant-1",
        sessionId: "conversation-1",
        providerId: "acp",
        modelId: "opencode",
        inputTokens: 5000,
        totalTokens: 5000,
        costUsd: 0.42,
        costSource: "reported",
      }),
    );
    const metadata = JSON.parse(finalizeAssistantMessage.mock.calls[0][2]);
    expect(metadata.usage).toEqual({ used: 1000, size: 5000, cost: { amount: 0.42, currency: "USD" }, meta: null });
    expect(setMessageError).not.toHaveBeenCalled();
  });

  it("routes ACP plan updates to the plan widget and skips inline plan blocks", async () => {
    const finalizeAssistantMessage = vi.fn(async () => undefined);
    const setMessageError = vi.fn(async () => undefined);
    const publish = vi.fn();
    const port = new AcpProviderExecutionPort(
      {} as never,
      { finalizeAssistantMessage, setMessageError } as never,
      { publish } as never,
      {
        dataDir: "/tmp",
        appVersion: "1.0.0",
        db: { prepare: vi.fn() },
      },
    );
    const runtime = {
      async *runPromptTurn() {
        yield {
          sessionId: "acp-session",
          update: {
            sessionUpdate: "plan",
            entries: [
              { content: "Analyze", status: "completed" },
              { content: "Implement", status: "in_progress" },
              { content: "Test", status: "pending" },
            ],
          },
        };
        yield {
          sessionId: "acp-session",
          update: {
            sessionUpdate: "plan",
            entries: [
              { content: "Analyze", status: "completed" },
              { content: "Implement", status: "completed" },
              { content: "Test", status: "in_progress" },
            ],
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

    const planCalls = publish.mock.calls.filter((call) => call[0] === "chat.plan.updated");
    expect(planCalls).toHaveLength(2);
    expect(planCalls[0][1]).toMatchObject({
      sessionId: "conversation-1",
      messageId: "assistant-1",
      revision: 1,
      plan: [
        { step: "Analyze", status: "completed" },
        { step: "Implement", status: "in_progress" },
        { step: "Test", status: "pending" },
      ],
    });
    expect(planCalls[1][1]).toMatchObject({ revision: 2 });

    for (const call of publish.mock.calls) {
      if (call[0] !== "chat.stream.updated") continue;
      expect((call[1] as { blocks: Array<{ type: string }> }).blocks.some((b) => b.type === "plan")).toBe(false);
    }
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

  it("computes agent diagnostics from the process manager snapshot", async () => {
    const port = new AcpProviderExecutionPort({} as never, {} as never, { publish: vi.fn() } as never, {
      dataDir: "/tmp",
      appVersion: "1.0.0",
      db: { prepare: vi.fn() },
    });
    const runtime = {
      processManager: {
        listProcesses: () => [
          {
            agentId: "opencode",
            workdir: "/repo",
            status: "ready",
            launchFingerprint: "cmd:opencode",
            capabilitySnapshot: { protocolVersion: 1, agentInfo: { name: "OpenCode", version: "2.0" } },
            authMethods: [{ id: "oauth", type: "oauth" }],
            supportsLoadSession: true,
            supportsSessionList: true,
            supportsSessionResume: false,
            supportsSessionClose: true,
            supportsSessionFork: false,
            supportsAuthLogout: true,
          },
        ],
        getDebugEvents: () => [
          {
            kind: "response",
            action: "session/new",
            timestamp: Date.now(),
          },
        ],
      },
    };
    (port as any).runtimePromise = Promise.resolve(runtime);

    const diagnostics = await port.getAcpAgentDiagnostics("opencode", "/repo");

    expect(diagnostics).toMatchObject({
      ready: true,
      agentId: "opencode",
      workdir: "/repo",
      launchSource: "cmd:opencode",
      protocolVersion: "1",
      agentName: "OpenCode",
      agentVersion: "2.0",
      authMethods: [{ id: "oauth", type: "oauth" }],
      capabilities: {
        loadSession: true,
        sessionList: true,
        sessionResume: false,
        sessionClose: true,
        sessionFork: false,
        authLogout: true,
        fs: true,
        terminal: true,
      },
      lastError: null,
    });
  });

  it("returns an error result when the debug action targets an unknown agent", async () => {
    const port = new AcpProviderExecutionPort(
      {
        getAcpAgents: vi.fn(async () => []),
        getProviderById: vi.fn(() => ({ id: "acp", name: "ACP" })),
      } as never,
      {} as never,
      { publish: vi.fn() } as never,
      { dataDir: "/tmp", appVersion: "1.0.0", db: { prepare: vi.fn() } },
    );
    (port as any).runtimePromise = Promise.resolve({ processManager: {}, sessionManager: {}, sessionPersistence: {} });

    await expect(port.runAcpDebugAction({ agentId: "ghost", action: "initialize" })).rejects.toThrow(/Agent not found/);
  });

  it("clears stale permission overlays without throwing on unknown tool call ids", async () => {
    const port = new AcpProviderExecutionPort({} as never, {} as never, { publish: vi.fn() } as never, {
      dataDir: "/tmp",
      appVersion: "1.0.0",
      db: { prepare: vi.fn() },
    });

    await expect(
      port.respondToolInteraction("conversation-1", "message-1", "ghost-tool", {
        kind: "permission",
        granted: true,
      }),
    ).resolves.toEqual({ handledInline: true });
  });

  it("times out a hanging permission resolver with a cancelled outcome", async () => {
    const onTimeout = vi.fn();
    await expect(resolvePermissionWithTimeout(() => new Promise(() => {}), 50, onTimeout)).resolves.toEqual({
      outcome: { outcome: "cancelled" },
    });
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("returns the resolver result when it settles before the timeout", async () => {
    const onTimeout = vi.fn();
    await expect(
      resolvePermissionWithTimeout(
        async () => ({ outcome: { outcome: "selected", optionId: "allow-once" } }),
        1000,
        onTimeout,
      ),
    ).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  describe("AcpMessageFormatter.mapInput", () => {
    it("maps a text-only input to a single text block", () => {
      expect(AcpMessageFormatter.mapInput({ text: "hello" })).toEqual([{ type: "text", text: "hello" }]);
    });

    it("maps an image to an image block when the agent supports images", () => {
      const blocks = AcpMessageFormatter.mapInput(
        { text: "look", files: [{ name: "pic.png", path: "/a/pic.png", mimeType: "image/png", content: "BASE64" }] },
        { image: true },
      );
      expect(blocks).toEqual([
        { type: "text", text: "look" },
        { type: "image", data: "BASE64", mimeType: "image/png", uri: "/a/pic.png" },
      ]);
    });

    it("falls back to a text reference when the agent does not support images", () => {
      const blocks = AcpMessageFormatter.mapInput(
        { text: "look", files: [{ name: "pic.png", path: "/a/pic.png", mimeType: "image/png", content: "BASE64" }] },
        { image: false },
      );
      expect(blocks[1]).toEqual({ type: "resource_link", uri: "/a/pic.png", name: "pic.png", mimeType: "image/png" });
    });

    it("maps audio to an audio block when supported, else a text reference", () => {
      const audioFile = { name: "clip.mp3", path: "/a/clip.mp3", mimeType: "audio/mpeg", content: "AUDIO" };
      const supported = AcpMessageFormatter.mapInput({ text: "", files: [audioFile] }, { audio: true });
      expect(supported[0]).toEqual({ type: "audio", data: "AUDIO", mimeType: "audio/mpeg" });

      const unsupported = AcpMessageFormatter.mapInput({ text: "", files: [audioFile] }, { audio: false });
      expect(unsupported[0]).toEqual({ type: "text", text: "[audio audio/mpeg]" });
    });

    it("references non-media files as resource links", () => {
      const blocks = AcpMessageFormatter.mapInput({
        text: "see",
        files: [{ name: "notes.txt", path: "/a/notes.txt", mimeType: "text/plain" }],
      });
      expect(blocks[1]).toEqual({
        type: "resource_link",
        uri: "/a/notes.txt",
        name: "notes.txt",
        mimeType: "text/plain",
      });
    });

    it("returns an empty text block for empty input", () => {
      expect(AcpMessageFormatter.mapInput({ text: "", files: [] })).toEqual([{ type: "text", text: "" }]);
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
