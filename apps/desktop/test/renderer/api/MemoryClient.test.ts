import { describe, expect, it, vi } from "vitest";
import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import { createMemoryClient } from "#api/MemoryClient";

function createBridge(): ArgosBridge & { invoke: ReturnType<typeof vi.fn> } {
  return {
    invoke: vi.fn(async (routeName: string, payload?: unknown) => {
      switch (routeName) {
        case "memory.list":
          return { memories: [] };
        case "memory.getStatus":
          return { status: { total: 0, pendingEmbedding: 0, hasPersona: false } };
        case "memory.search":
          return { results: [] };
        case "memory.add":
          return { result: { action: "created", memoryId: "mem-1" } };
        case "memory.delete":
          return { ok: true };
        case "memory.clear":
          return { removed: 3 };
        default:
          return {};
      }
    }),
    on: vi.fn(() => vi.fn()),
  };
}

describe("MemoryClient", () => {
  it("forwards category and omits kind when category is provided", async () => {
    const bridge = createBridge();
    const client = createMemoryClient(bridge);

    await client.add("agent-1", { content: "repo uses pnpm", category: "project_fact" });

    expect(bridge.invoke).toHaveBeenCalledWith("memory.add", {
      agentId: "agent-1",
      content: "repo uses pnpm",
      category: "project_fact",
      importance: undefined,
    });
    const payload = bridge.invoke.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("kind");
  });

  it("forwards kind and omits category when kind is provided", async () => {
    const bridge = createBridge();
    const client = createMemoryClient(bridge);

    await client.add("agent-1", { content: "met on tuesday", kind: "episodic" });

    expect(bridge.invoke).toHaveBeenCalledWith("memory.add", {
      agentId: "agent-1",
      content: "met on tuesday",
      kind: "episodic",
      importance: undefined,
    });
    const payload = bridge.invoke.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("category");
  });

  it("sends neither kind nor category when only content is provided", async () => {
    const bridge = createBridge();
    const client = createMemoryClient(bridge);

    const result = await client.add("agent-1", { content: "plain note" });

    expect(bridge.invoke).toHaveBeenCalledWith("memory.add", {
      agentId: "agent-1",
      content: "plain note",
      importance: undefined,
    });
    expect(result).toEqual({ action: "created", memoryId: "mem-1" });
  });

  it("returns unwrapped payloads for the remaining routes", async () => {
    const bridge = createBridge();
    const client = createMemoryClient(bridge);

    await expect(client.list("agent-1")).resolves.toEqual([]);
    await expect(client.getStatus("agent-1")).resolves.toEqual({
      total: 0,
      pendingEmbedding: 0,
      hasPersona: false,
    });
    await expect(client.search("agent-1", "query")).resolves.toEqual([]);
    await expect(client.remove("agent-1", "mem-1")).resolves.toBe(true);
    await expect(client.clear("agent-1")).resolves.toBe(3);
  });
});
