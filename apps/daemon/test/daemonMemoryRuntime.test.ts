import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DaemonMemoryRuntime } from "../src/host/daemonMemoryRuntime";

type MemoryRow = Record<string, any>;

function createFakeDb() {
  const memories = new Map<string, MemoryRow>();

  return {
    exec: vi.fn(),
    prepare(sql: string) {
      return {
        run: (...params: unknown[]) => {
          if (sql.includes("INSERT OR REPLACE INTO agent_memory")) {
            const [
              id,
              agent_id,
              kind,
              category,
              content,
              importance,
              confidence,
              status,
              source_session,
              source_entry_ids,
              user_scope,
              provenance_key,
              is_anchor,
              created_at,
              conflict_state,
              conflict_with,
              persona_state,
            ] = params as any[];
            memories.set(String(id), {
              id,
              agent_id,
              kind,
              category,
              content,
              importance,
              confidence,
              status,
              source_session,
              source_entry_ids,
              user_scope,
              provenance_key,
              is_anchor,
              created_at,
              conflict_state,
              conflict_with,
              persona_state,
              embedding_id: null,
              embedding_dim: null,
              embedding_model: null,
              last_consolidated_at: null,
              accessed_at: null,
              access_count: 0,
              decay_score: null,
              consolidated_at: null,
              superseded_by: null,
            });
            return { changes: 1 };
          }

          if (sql.includes("UPDATE agent_memory SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?")) {
            const [accessedAt, id] = params as any[];
            const row = memories.get(String(id));
            if (row) {
              row.accessed_at = accessedAt;
              row.access_count = (row.access_count ?? 0) + 1;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE agent_memory SET status = ?")) {
            const [status, embeddingId, embeddingDim, embeddingModel, id] = params as any[];
            const row = memories.get(String(id));
            if (row) {
              row.status = status;
              row.embedding_id = embeddingId;
              row.embedding_dim = embeddingDim;
              row.embedding_model = embeddingModel;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("DELETE FROM agent_memory WHERE id = ?")) {
            const [id] = params as any[];
            return { changes: memories.delete(String(id)) ? 1 : 0 };
          }

          return { changes: 0 };
        },
        get: (...params: unknown[]) => {
          if (sql.includes("SELECT * FROM agent_memory WHERE id = ?")) {
            const [id] = params as any[];
            return memories.get(String(id));
          }
          if (sql.includes("SELECT COUNT(*) as count FROM agent_memory WHERE agent_id = ?")) {
            const [agentId] = params as any[];
            const count = Array.from(memories.values()).filter((row) => row.agent_id === agentId).length;
            return { count };
          }
          if (sql.includes("provenance_key = ?")) {
            const [agentId, key] = params as any[];
            return Array.from(memories.values()).find((row) => row.agent_id === agentId && row.provenance_key === key);
          }
          return undefined;
        },
        all: (...params: unknown[]) => {
          if (sql.includes("agent_memory_fts MATCH")) {
            throw new Error("FTS unavailable");
          }
          if (sql.includes("status = 'pending_embedding'")) {
            const [agentId, limit] = params as any[];
            return Array.from(memories.values())
              .filter((row) => row.status === "pending_embedding" && (!agentId || row.agent_id === agentId))
              .sort((a, b) => a.created_at - b.created_at)
              .slice(0, limit ?? 50);
          }
          if (sql.includes("SELECT * FROM agent_memory WHERE agent_id = ? AND content LIKE ?")) {
            const [agentId, likePattern] = params as any[];
            const needle = String(likePattern).replace(/%/g, "").toLowerCase();
            return Array.from(memories.values()).filter(
              (row) =>
                row.agent_id === agentId &&
                typeof row.content === "string" &&
                row.content.toLowerCase().includes(needle),
            );
          }
          if (sql.includes("SELECT * FROM agent_memory WHERE agent_id = ?")) {
            const [agentId] = params as any[];
            return Array.from(memories.values()).filter((row) => row.agent_id === agentId);
          }
          return [];
        },
      };
    },
  };
}

describe("DaemonMemoryRuntime", () => {
  const cleanupRoots: string[] = [];

  afterEach(() => {
    while (cleanupRoots.length > 0) {
      const root = cleanupRoots.pop();
      if (root) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  function createRuntime() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-memory-"));
    cleanupRoots.push(root);

    return new DaemonMemoryRuntime({
      db: createFakeDb() as never,
      configPresenter: {
        listAgents: vi.fn(() => []),
      } as never,
      dataDir: root,
    });
  }

  it("writes memory rows and reports status", async () => {
    const runtime = createRuntime();

    const result = await runtime.addMemory("agent-1", "Remember this", "semantic", 0.8, "note");
    expect(result.id).toEqual(expect.any(String));
    await runtime.presenter.processPendingEmbeddings("agent-1");
    expect(runtime.presenter.getStatus("agent-1")).toEqual({
      total: 1,
      pendingEmbedding: 0,
      hasPersona: false,
      reindexing: false,
    });
  });

  it("falls back to FTS-like search when embeddings are unavailable", async () => {
    const runtime = createRuntime();
    await runtime.addMemory("agent-1", "Search this memory", "semantic", 0.5, "note");

    await expect(runtime.presenter.recall("agent-1", "search this")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: "Search this memory",
        }),
      ]),
    );
  });

  it("drains pending embeddings to fts_only when no embedding model is configured", async () => {
    const runtime = createRuntime();
    await runtime.addMemory("agent-1", "Drain this memory", "semantic", 0.5, "note");
    await runtime.presenter.processPendingEmbeddings("agent-1");

    expect(runtime.presenter.getStatus("agent-1").pendingEmbedding).toBe(0);
    const rows = runtime.presenter.listMemories("agent-1");
    expect(rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: "Drain this memory", status: "fts_only" })]),
    );
  });

  it("exposes agent memory tools", () => {
    const runtime = createRuntime();
    const definitions = runtime.toolDefinitions();
    const names = definitions.map((tool) => tool.function.name);
    expect(names).toEqual(["memory_remember", "memory_recall", "memory_forget"]);
    expect(definitions.every((tool) => tool.server.name === "agent-memory")).toBe(true);
    expect(runtime.handlesTool("memory_remember")).toBe(true);
    expect(runtime.handlesTool("memory_recall")).toBe(true);
    expect(runtime.handlesTool("memory_forget")).toBe(true);
    expect(runtime.handlesTool("unrelated_tool")).toBe(false);
  });

  it("remembers and forgets a memory through the agent tools", async () => {
    const runtime = createRuntime();

    const remembered = await runtime.rememberMemory("agent-1", {
      content: "The user prefers dark mode.",
      kind: "semantic",
      importance: 0.8,
    });
    expect(remembered.action).toBe("created");
    expect(remembered.id).toEqual(expect.any(String));

    await expect(runtime.recallMemory("agent-1", "dark mode")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: "The user prefers dark mode.",
        }),
      ]),
    );

    const forgot = await runtime.forgetMemory("agent-1", remembered.id as string);
    expect(forgot).toBe(true);
    expect(runtime.presenter.listMemories("agent-1").length).toBe(0);
  });

  it("dispatches memory tools through callMemoryTool", async () => {
    const runtime = createRuntime();
    const response = await runtime.callMemoryTool(
      {
        id: "tool-call-1",
        type: "function",
        function: {
          name: "memory_remember",
          arguments: JSON.stringify({ content: "Remember this fact." }),
        },
      },
      "agent-1",
    );
    expect(response.toolCallId).toBe("tool-call-1");
    expect(response.toolResult).toEqual(expect.objectContaining({ action: "created" }));
  });
});
