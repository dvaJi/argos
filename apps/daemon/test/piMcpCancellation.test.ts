import { describe, expect, it } from "bun:test";
import { PiProviderExecutionPort } from "../src/host/pi-provider-execution";

/**
 * STOP (cancelGeneration) must abort MCP tool calls the Pi worker is still
 * waiting on, so task-augmented calls send tasks/cancel instead of running on.
 * The worker is not spawned; the port is driven through `onEvent`.
 */
describe("Pi MCP tool-call cancellation", () => {
  it("aborts the in-flight MCP call signal on cancelGeneration and reports the error to the worker", async () => {
    let receivedSignal: AbortSignal | undefined;
    const mcp = {
      listTools: async () => [],
      callTool: (_request: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          receivedSignal = options?.signal;
          options?.signal?.addEventListener("abort", () => reject(new Error("Task t1 was cancelled")));
        }),
    };
    const port = new PiProviderExecutionPort(
      {} as never,
      { get: async () => null } as never,
      {} as never,
      { publish: () => undefined } as never,
      mcp as never,
      "C:\tmp\argos-workspace",
    );

    const sent: Array<Record<string, unknown>> = [];
    const worker = {
      process: { stdin: { write: (data: string) => sent.push(JSON.parse(data)) } },
      turn: { commandId: "cmd-1", blocks: [] },
    };
    (port as unknown as { workers: Map<string, unknown> }).workers.set("session-1", worker);

    const handled = (
      port as unknown as {
        onEvent: (id: string, w: unknown, event: unknown, ok: () => void, fail: (e: Error) => void) => Promise<void>;
      }
    ).onEvent(
      "session-1",
      worker,
      { type: "mcpRequest", id: "req-1", toolCallId: "tc-1", toolName: "deploy", input: {} },
      () => undefined,
      () => undefined,
    );

    await Promise.resolve();
    expect(receivedSignal?.aborted).toBe(false);

    await port.cancelGeneration("session-1");
    await handled;

    expect(receivedSignal?.aborted).toBe(true);
    expect(sent).toContainEqual({ type: "mcpResponse", id: "req-1", error: "Task t1 was cancelled" });
    expect(sent.some((message) => message.type === "abort")).toBe(true);
  });
});

describe("Pi worker stdin after exit", () => {
  it("does not write to a destroyed worker stdin", () => {
    const port = new PiProviderExecutionPort(
      {} as never,
      { get: async () => null } as never,
      {} as never,
      { publish: () => undefined } as never,
      { listTools: async () => [], callTool: async () => ({}) } as never,
      "C:\tmp\argos-workspace",
    );
    let writes = 0;
    const dead = {
      stdin: {
        destroyed: true,
        writableEnded: false,
        write: () => {
          writes += 1;
          throw new Error("EPIPE");
        },
      },
    };

    expect(() =>
      (port as unknown as { send: (w: unknown, c: unknown) => void }).send(dead, { type: "mcpResponse" }),
    ).not.toThrow();
    expect(writes).toBe(0);
  });
});
