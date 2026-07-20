import { describe, expect, it, vi } from "vitest";
import { agentProcessStream, type AgentMessageStore, type AgentProcessParams, type AgentToolPresenter } from "@argos/backend-core/agent/processStream";
import type { LLMCoreStreamEvent } from "@argos/shared/types/core/llm-events";

function makeMessageStore(): AgentMessageStore & { finalized: unknown[]; errored: unknown[] } {
  const store: AgentMessageStore & { finalized: unknown[]; errored: unknown[] } = {
    finalized: [],
    errored: [],
    updateAssistantContent: vi.fn(),
    finalizeAssistantMessage: vi.fn((id, blocks, meta) => {
      store.finalized.push({ id, blocks, meta });
    }),
    setMessageError: vi.fn((id, blocks, meta) => {
      store.errored.push({ id, blocks, meta });
    }),
    getMessage: vi.fn(async () => null),
  };
  return store;
}

function makeEventPublisher() {
  const published: Array<{ event: string; payload: unknown }> = [];
  return {
    published,
    publish: (event: string, payload: unknown) => published.push({ event, payload }),
    subscribe: vi.fn(),
  };
}

async function* streamOf(...events: LLMCoreStreamEvent[]): AsyncGenerator<LLMCoreStreamEvent> {
  for (const e of events) yield e;
}

describe("agentProcessStream", () => {
  it("completes a simple text response without tools", async () => {
    const messageStore = makeMessageStore();
    const eventPublisher = makeEventPublisher();
    const params: AgentProcessParams = {
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      toolPresenter: { callTool: vi.fn(), preCheckToolPermission: vi.fn(async () => null) } as unknown as AgentToolPresenter,
      coreStream: () => streamOf({ type: "text", content: "Hi there!" }, { type: "stop", stop_reason: "complete" }),
      providerId: "openai",
      modelId: "gpt-4o-mini",
      modelConfig: { contextLength: 128000 } as never,
      temperature: 0.7,
      maxTokens: 4096,
      permissionMode: "default",
      sessionId: "s1",
      requestId: "r1",
      messageId: "m1",
      abortSignal: new AbortController().signal,
      eventPublisher: eventPublisher as never,
      messageStore,
    };

    const result = await agentProcessStream(params);

    expect(result.status).toBe("completed");
    expect(result.blocks.some((b) => b.type === "content" && b.content === "Hi there!")).toBe(true);
    expect(messageStore.finalized.length).toBe(1);
    expect(eventPublisher.published.some((p) => p.event === "chat.stream.completed")).toBe(true);
  });

  it("runs a tool loop and finalizes after the tool result", async () => {
    const messageStore = makeMessageStore();
    const eventPublisher = makeEventPublisher();
    const callTool = vi.fn(async () => ({
      rawData: { toolCallId: "call_1", content: "weather is sunny", isError: false },
    }));
    const toolPresenter: AgentToolPresenter = {
      callTool,
      preCheckToolPermission: vi.fn(async () => null),
    } as unknown as AgentToolPresenter;

    const params: AgentProcessParams = {
      messages: [{ role: "user", content: "what is the weather?" }],
      tools: [
        {
          type: "function",
          function: { name: "get_weather", description: "weather", parameters: { type: "object", properties: {} } },
          server: { name: "mcp", icons: "", description: "" },
        },
      ],
      toolPresenter,
      coreStream: (msgs) => {
        if (msgs.length <= 1) {
          return streamOf(
            { type: "tool_call_start", tool_call_id: "call_1", tool_call_name: "get_weather" },
            { type: "tool_call_chunk", tool_call_id: "call_1", tool_call_arguments_chunk: "{}" },
            { type: "tool_call_end", tool_call_id: "call_1", tool_call_arguments_complete: "{}" },
            { type: "stop", stop_reason: "tool_use" },
          );
        }
        return streamOf({ type: "text", content: "It is sunny." }, { type: "stop", stop_reason: "complete" });
      },
      providerId: "openai",
      modelId: "gpt-4o-mini",
      modelConfig: { contextLength: 128000 } as never,
      temperature: 0.7,
      maxTokens: 4096,
      permissionMode: "default",
      sessionId: "s1",
      requestId: "r1",
      messageId: "m1",
      abortSignal: new AbortController().signal,
      eventPublisher: eventPublisher as never,
      messageStore,
    };

    const result = await agentProcessStream(params);

    expect(result.status).toBe("completed");
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(messageStore.finalized.length).toBe(1);
    expect(result.blocks.some((b) => b.type === "tool_call" && b.tool_call?.response === "weather is sunny")).toBe(true);
    expect(result.blocks.some((b) => b.type === "content" && b.content === "It is sunny.")).toBe(true);
  });

  it("auto-grants permission in full_access mode and keeps looping", async () => {
    const messageStore = makeMessageStore();
    const eventPublisher = makeEventPublisher();
    const callTool = vi.fn(async () => ({
      rawData: { toolCallId: "call_1", content: "done", isError: false },
    }));
    const toolPresenter: AgentToolPresenter = {
      callTool,
      preCheckToolPermission: vi.fn(async () => ({
        needsPermission: true,
        permissionType: "write",
        description: "write file",
        toolName: "write_file",
        serverName: "mcp",
      })),
    } as unknown as AgentToolPresenter;

    const params: AgentProcessParams = {
      messages: [{ role: "user", content: "write a file" }],
      tools: [
        {
          type: "function",
          function: { name: "write_file", description: "write", parameters: { type: "object", properties: {} } },
          server: { name: "mcp", icons: "", description: "" },
        },
      ],
      toolPresenter,
      coreStream: (msgs) => {
        if (msgs.length <= 1) {
          return streamOf(
            { type: "tool_call_start", tool_call_id: "call_1", tool_call_name: "write_file" },
            { type: "tool_call_chunk", tool_call_id: "call_1", tool_call_arguments_chunk: "{}" },
            { type: "tool_call_end", tool_call_id: "call_1", tool_call_arguments_complete: "{}" },
            { type: "stop", stop_reason: "tool_use" },
          );
        }
        return streamOf({ type: "text", content: "File written." }, { type: "stop", stop_reason: "complete" });
      },
      providerId: "openai",
      modelId: "gpt-4o-mini",
      modelConfig: { contextLength: 128000 } as never,
      temperature: 0.7,
      maxTokens: 4096,
      permissionMode: "full_access",
      sessionId: "s1",
      requestId: "r1",
      messageId: "m1",
      abortSignal: new AbortController().signal,
      eventPublisher: eventPublisher as never,
      messageStore,
    };

    const result = await agentProcessStream(params);

    expect(result.status).toBe("completed");
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
