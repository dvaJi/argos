import { describe, expect, it } from "vitest";

import { MemoryPresenter } from "@argos/memory-runtime";
import type {
  AgentMemoryRow,
  MemoryPresenterDeps,
  MemoryVectorRecord,
} from "@argos/memory-runtime/memoryPresenter/types";

function createRow(
  overrides: Partial<AgentMemoryRow> & Pick<AgentMemoryRow, "id" | "agent_id" | "kind" | "content">,
): AgentMemoryRow {
  return {
    category: null,
    confidence: null,
    content: overrides.content,
    created_at: Date.now(),
    decay_score: null,
    embedding_dim: null,
    embedding_id: null,
    embedding_model: null,
    importance: 0.5,
    accessed_at: null,
    access_count: 0,
    conflict_state: null,
    conflict_with: null,
    consolidated_at: null,
    id: overrides.id,
    is_anchor: 0,
    kind: overrides.kind,
    last_consolidated_at: null,
    persona_state: null,
    provenance_key: `${overrides.kind}:${overrides.id}`,
    source_entry_ids: null,
    source_session: null,
    status: "pending_embedding",
    superseded_by: null,
    user_scope: null,
    agent_id: overrides.agent_id,
    ...overrides,
  };
}

describe("MemoryPresenter", () => {
  function createDeps() {
    const rows = new Map<string, AgentMemoryRow>();
    const embedded = new Set<string>();
    const repository = {
      insert: (input: any) => {
        const row = createRow({
          id: input.id,
          agent_id: input.agentId,
          kind: input.kind,
          content: input.content,
          importance: input.importance ?? 0.5,
          confidence: input.confidence ?? null,
          category: input.category ?? null,
          status: input.status ?? "pending_embedding",
          source_session: input.sourceSession ?? null,
          source_entry_ids: input.sourceEntryIds ? JSON.stringify(input.sourceEntryIds) : null,
          user_scope: input.userScope ?? null,
          provenance_key: input.provenanceKey,
          is_anchor: input.isAnchor ? 1 : 0,
        });
        rows.set(row.id, row);
        return row;
      },
      getById: (id: string) => rows.get(id),
      getByProvenanceKey: (_agentId: string, provenanceKey: string) =>
        Array.from(rows.values()).find((row) => row.provenance_key === provenanceKey),
      listByAgent: (agentId: string) => Array.from(rows.values()).filter((row) => row.agent_id === agentId),
      getActivePersona: (agentId: string) =>
        Array.from(rows.values()).find(
          (row) => row.agent_id === agentId && row.kind === "persona" && !row.superseded_by,
        ),
      listPersonaVersions: (agentId: string) =>
        Array.from(rows.values()).filter((row) => row.agent_id === agentId && row.kind === "persona"),
      search: (agentId: string, query: string) =>
        Array.from(rows.values()).filter(
          (row) =>
            row.agent_id === agentId && row.content.toLowerCase().includes(query.toLowerCase()) && !row.superseded_by,
        ),
      listPendingEmbedding: (limit = 50, agentId?: string) =>
        Array.from(rows.values())
          .filter(
            (row) =>
              row.status === "pending_embedding" &&
              row.kind !== "persona" &&
              (agentId ? row.agent_id === agentId : true),
          )
          .slice(0, limit),
      updateStatus: (
        id: string,
        status: AgentMemoryRow["status"],
        embedding?: { embeddingId?: string | null; embeddingDim?: number | null; embeddingModel?: string | null },
      ) => {
        const row = rows.get(id);
        if (!row) {
          return;
        }
        row.status = status;
        row.embedding_id = embedding?.embeddingId ?? row.embedding_id;
        row.embedding_dim = embedding?.embeddingDim ?? row.embedding_dim;
        row.embedding_model = embedding?.embeddingModel ?? row.embedding_model;
      },
      requeueForEmbedding: (_agentId: string, statuses: AgentMemoryRow["status"][]) => {
        let count = 0;
        for (const row of rows.values()) {
          if (statuses.includes(row.status) && row.kind !== "persona") {
            row.status = "pending_embedding";
            row.embedding_id = null;
            row.embedding_dim = null;
            row.embedding_model = null;
            count += 1;
          }
        }
        return count;
      },
      markSuperseded: (id: string, supersededBy: string | null) => {
        const row = rows.get(id);
        if (row) {
          row.superseded_by = supersededBy;
        }
      },
      recordAccess: (id: string, accessedAt = Date.now()) => {
        const row = rows.get(id);
        if (row) {
          row.accessed_at = accessedAt;
          row.access_count += 1;
        }
      },
      delete: (id: string) => {
        rows.delete(id);
      },
      clearByAgent: (agentId: string) => {
        let removed = 0;
        for (const [id, row] of rows.entries()) {
          if (row.agent_id === agentId) {
            rows.delete(id);
            removed += 1;
          }
        }
        return removed;
      },
      countByAgent: (agentId: string) => Array.from(rows.values()).filter((row) => row.agent_id === agentId).length,
    };

    const vectorStore = {
      upsert: async (records: MemoryVectorRecord[]) => {
        for (const record of records) {
          embedded.add(record.memoryId);
        }
      },
      query: async () => [{ memoryId: "mem-vec", distance: 0.1 }],
      deleteByMemoryIds: async (memoryIds: string[]) => {
        for (const memoryId of memoryIds) {
          embedded.delete(memoryId);
        }
      },
      close: async () => undefined,
      isUsable: () => true,
    };

    const deps: MemoryPresenterDeps = {
      repository: repository as never,
      resolveAgentConfig: (agentId: string) =>
        agentId === "agent-1"
          ? {
              memoryEnabled: true,
              memoryEmbedding: { providerId: "prov", modelId: "embed" },
              memoryRetrieval: { topK: 4, rrfK: 60, similarityThreshold: 0.05 },
            }
          : { memoryEnabled: false },
      getEmbeddings: async (_providerId: string, _modelId: string, texts: string[]) =>
        texts.map((text) => (text === "query" ? [1, 0, 0] : [0, 1, 0])),
      createVectorStore: async () => vectorStore as never,
      resetVectorStore: async () => undefined,
    };

    return { deps, rows, vectorStore, embedded };
  }

  it("deduplicates writes by provenance key", () => {
    const { deps, rows } = createDeps();
    const presenter = new MemoryPresenter(deps);

    const created = presenter.writeMemoriesSync(
      [
        { kind: "semantic", content: " Remember this  " },
        { kind: "semantic", content: "Remember this" },
      ],
      { agentId: "agent-1", sourceSession: "session-1" },
    );

    expect(created).toHaveLength(1);
    expect(rows.size).toBe(1);
  });

  it("marks pending rows as fts-only when no embedding config exists", async () => {
    const { deps, rows } = createDeps();
    deps.resolveAgentConfig = () => ({ memoryEnabled: true, memoryEmbedding: null, memoryRetrieval: null });
    const presenter = new MemoryPresenter(deps);

    rows.set(
      "mem-1",
      createRow({
        id: "mem-1",
        agent_id: "agent-1",
        kind: "semantic",
        content: "Remember this",
        status: "pending_embedding",
      }),
    );

    await presenter.processPendingEmbeddings("agent-1");
    expect(rows.get("mem-1")?.status).toBe("fts_only");
  });

  it("combines FTS and vector recall and records access", async () => {
    const { deps, rows } = createDeps();
    const presenter = new MemoryPresenter(deps);

    rows.set(
      "mem-fts",
      createRow({
        id: "mem-fts",
        agent_id: "agent-1",
        kind: "semantic",
        content: "query from search",
        status: "embedded",
        embedding_dim: 3,
        embedding_model: "prov:embed",
      }),
    );
    rows.set(
      "mem-vec",
      createRow({
        id: "mem-vec",
        agent_id: "agent-1",
        kind: "episodic",
        content: "different content",
        status: "embedded",
        embedding_dim: 3,
        embedding_model: "prov:embed",
      }),
    );

    const results = await presenter.recall("agent-1", "query");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBeDefined();
    expect(rows.get(results[0].id)?.access_count).toBe(1);
  });
});
