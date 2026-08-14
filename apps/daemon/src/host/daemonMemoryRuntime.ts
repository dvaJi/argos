import path from "node:path";
import fs from "node:fs";
import { nanoid } from "nanoid";
import { MemoryPresenter, MemoryVectorStore } from "@argos/memory-runtime";
import type {
  MemoryRepositoryPort,
  AgentMemoryRow,
  AgentMemoryInsertInput,
  AgentMemoryListOptions,
  AgentMemoryStatus,
  AgentMemoryKind,
  MemoryCandidate,
  MemoryRecallItem,
} from "@argos/memory-runtime/types";
import type { MCPToolCall, MCPToolDefinition, MCPToolResponse } from "@argos/shared/types/core/mcp";
import { isAgentMemoryCategory } from "@argos/shared/types/agent-memory";

const MEMORY_TOOL_SERVER_NAME = "agent-memory";

const memoryTool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required?: string[],
): MCPToolDefinition => ({
  type: "function",
  source: "agent",
  function: { name, description, parameters: { type: "object", properties, required } },
  server: { name: MEMORY_TOOL_SERVER_NAME, icons: "\u{1F9E0}", description: "Argos long-term agent memory" },
});

type BunDB = {
  prepare(sql: string): {
    get(...p: unknown[]): any;
    all(...p: unknown[]): any[];
    run(...p: unknown[]): { changes: number };
  };
};

/**
 * Daemon memory runtime. Implements MemoryRepositoryPort against bun:sqlite
 * (agent_memory table + FTS5), wires HTTP-based embeddings + generateText, and
 * constructs the shared MemoryPresenter.
 *
 * v1: vector similarity uses DuckDB with the \`vss\` extension (HNSW index).
 * If the extension isn't available, the presenter falls back to FTS-only search.
 */
export class DaemonMemoryRuntime {
  readonly presenter: MemoryPresenter;
  private readonly db: BunDB;
  private readonly configPresenter: any;
  private readonly repository: MemoryRepositoryPort;

  constructor(deps: { db: BunDB; configPresenter: any; dataDir: string }) {
    this.db = deps.db;
    this.configPresenter = deps.configPresenter;

    const vectorsDir = path.join(deps.dataDir, "memory_vectors");
    if (!fs.existsSync(vectorsDir)) fs.mkdirSync(vectorsDir, { recursive: true });

    this.repository = this.createRepository();
    this.presenter = new MemoryPresenter({
      repository: this.repository,
      resolveAgentConfig: async (agentId: string) => {
        try {
          return await this.configPresenter.resolveArgosAgentConfig(agentId);
        } catch {
          return null;
        }
      },
      getEmbeddings: (providerId: string, modelId: string, texts: string[]) =>
        this.getEmbeddings(providerId, modelId, texts),
      generateText: (providerId: string, modelId: string, prompt: string) =>
        this.generateText(providerId, modelId, prompt),
      createVectorStore: async (
        agentId: string,
        embedding: { providerId: string; modelId: string },
        dimensions: number,
      ) => {
        const dbPath = path.join(vectorsDir, `${agentId}.duckdb`);
        return MemoryVectorStore.create(dbPath, dimensions, embedding);
      },
      resetVectorStore: async (agentId: string) => {
        try {
          const dbPath = path.join(vectorsDir, `${agentId}.duckdb`);
          MemoryVectorStore.destroyFile(dbPath);
        } catch (error) {
          console.warn(`[Memory] Failed to reset vector store for ${agentId}:`, error);
        }
      },
    });
  }

  // ---- MemoryRepositoryPort implementation ----
  private createRepository(): MemoryRepositoryPort {
    const db = this.db;
    return {
      insert(input: AgentMemoryInsertInput): AgentMemoryRow {
        const now = input.createdAt ?? Date.now();
        db.prepare(
          `INSERT OR REPLACE INTO agent_memory (id, agent_id, kind, category, content, importance, confidence, status, source_session, source_entry_ids, user_scope, provenance_key, is_anchor, created_at, access_count, conflict_state, conflict_with, persona_state)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        ).run(
          input.id,
          input.agentId,
          input.kind,
          input.category ?? null,
          input.content,
          input.importance ?? 0.5,
          input.confidence ?? null,
          input.status ?? "pending_embedding",
          input.sourceSession ?? null,
          input.sourceEntryIds ? JSON.stringify(input.sourceEntryIds) : null,
          input.userScope ?? null,
          input.provenanceKey ?? `auto-${nanoid(8)}`,
          input.isAnchor ? 1 : 0,
          now,
          input.conflictState ?? null,
          input.conflictWith ?? null,
          input.personaState ?? null,
        );
        return db.prepare(`SELECT * FROM agent_memory WHERE id = ?`).get(input.id) as AgentMemoryRow;
      },

      getById(id: string): AgentMemoryRow | undefined {
        return (db.prepare(`SELECT * FROM agent_memory WHERE id = ?`).get(id) as AgentMemoryRow) ?? undefined;
      },

      getByProvenanceKey(agentId: string, provenanceKey: string): AgentMemoryRow | undefined {
        return (
          (db
            .prepare(`SELECT * FROM agent_memory WHERE agent_id = ? AND provenance_key = ?`)
            .get(agentId, provenanceKey) as AgentMemoryRow) ?? undefined
        );
      },

      listByAgent(agentId: string, options?: AgentMemoryListOptions): AgentMemoryRow[] {
        let sql = `SELECT * FROM agent_memory WHERE agent_id = ?`;
        const params: unknown[] = [agentId];
        if (!options?.includeSuperseded) sql += ` AND superseded_by IS NULL`;
        if (!options?.includeArchived) sql += ` AND status != 'archived'`;
        if (options?.kinds?.length) {
          sql += ` AND kind IN (${options.kinds.map(() => "?").join(",")})`;
          params.push(...options.kinds);
        }
        if (options?.statuses?.length) {
          sql += ` AND status IN (${options.statuses.map(() => "?").join(",")})`;
          params.push(...options.statuses);
        }
        sql += ` ORDER BY created_at DESC`;
        if (options?.limit) sql += ` LIMIT ${options.limit}`;
        return db.prepare(sql).all(...params) as AgentMemoryRow[];
      },

      getActivePersona(agentId: string): AgentMemoryRow | undefined {
        return (
          (db
            .prepare(
              `SELECT * FROM agent_memory WHERE agent_id = ? AND kind = 'persona' AND persona_state = 'active' AND superseded_by IS NULL LIMIT 1`,
            )
            .get(agentId) as AgentMemoryRow) ?? undefined
        );
      },

      listPersonaVersions(agentId: string): AgentMemoryRow[] {
        return db
          .prepare(`SELECT * FROM agent_memory WHERE agent_id = ? AND kind = 'persona' ORDER BY created_at DESC`)
          .all(agentId) as AgentMemoryRow[];
      },

      search(agentId: string, query: string, limit?: number): AgentMemoryRow[] {
        const lim = limit ?? 20;
        try {
          return db
            .prepare(
              `SELECT m.* FROM agent_memory m
               JOIN agent_memory_fts f ON f.rowid = m.rowid
               WHERE m.agent_id = ? AND agent_memory_fts MATCH ?
               ORDER BY bm25(agent_memory_fts) LIMIT ?`,
            )
            .all(agentId, query, lim) as AgentMemoryRow[];
        } catch {
          // FTS fallback: LIKE scan
          return db
            .prepare(
              `SELECT * FROM agent_memory WHERE agent_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT ?`,
            )
            .all(agentId, `%${query}%`, lim) as AgentMemoryRow[];
        }
      },

      listPendingEmbedding(limit = 50, agentId?: string): AgentMemoryRow[] {
        if (agentId) {
          return db
            .prepare(
              `SELECT * FROM agent_memory WHERE status = 'pending_embedding' AND agent_id = ? ORDER BY created_at ASC LIMIT ?`,
            )
            .all(agentId, limit) as AgentMemoryRow[];
        }
        return db
          .prepare(`SELECT * FROM agent_memory WHERE status = 'pending_embedding' ORDER BY created_at ASC LIMIT ?`)
          .all(limit) as AgentMemoryRow[];
      },

      updateStatus(
        id: string,
        status: AgentMemoryStatus,
        embedding?: { embeddingId?: string | null; embeddingDim?: number | null; embeddingModel?: string | null },
      ): void {
        db.prepare(
          `UPDATE agent_memory SET status = ?, embedding_id = ?, embedding_dim = ?, embedding_model = ? WHERE id = ?`,
        ).run(
          status,
          embedding?.embeddingId ?? null,
          embedding?.embeddingDim ?? null,
          embedding?.embeddingModel ?? null,
          id,
        );
      },

      requeueForEmbedding(agentId: string, statuses: AgentMemoryStatus[]): number {
        const placeholders = statuses.map(() => "?").join(",");
        return db
          .prepare(
            `UPDATE agent_memory SET status = 'pending_embedding' WHERE agent_id = ? AND status IN (${placeholders})`,
          )
          .run(agentId, ...statuses).changes;
      },

      markSuperseded(id: string, supersededBy: string | null): void {
        db.prepare(`UPDATE agent_memory SET superseded_by = ? WHERE id = ?`).run(supersededBy, id);
      },

      recordAccess(id: string, accessedAt?: number): void {
        db.prepare(`UPDATE agent_memory SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?`).run(
          accessedAt ?? Date.now(),
          id,
        );
      },

      delete(id: string): void {
        db.prepare(`DELETE FROM agent_memory WHERE id = ?`).run(id);
      },

      clearByAgent(agentId: string): number {
        return db.prepare(`DELETE FROM agent_memory WHERE agent_id = ?`).run(agentId).changes;
      },

      countByAgent(agentId: string): number {
        const row = db.prepare(`SELECT COUNT(*) as count FROM agent_memory WHERE agent_id = ?`).get(agentId) as {
          count: number;
        };
        return row?.count ?? 0;
      },
    };
  }

  // ---- Route-facing methods ----
  async addMemory(
    agentId: string,
    content: string,
    kind: string = "semantic",
    importance: number = 0.5,
    category?: string | null,
  ): Promise<{ id: string }> {
    const row = this.repository.insert({
      id: nanoid(),
      agentId,
      kind: kind as AgentMemoryKind,
      content,
      importance,
      category: (category as never) ?? null,
      status: "pending_embedding" as AgentMemoryStatus,
    });
    void this.presenter.processPendingEmbeddings(agentId).catch(() => undefined);
    return { id: row.id };
  }

  // ---- Agent memory tools (Pi worker loop) ----
  toolDefinitions(): MCPToolDefinition[] {
    return [
      memoryTool(
        "memory_remember",
        "Persist a durable long-term memory (stable fact, preference, or notable event) about the user or project for future sessions.",
        {
          content: { type: "string" },
          kind: { type: "string", enum: ["episodic", "semantic"] },
          category: { type: "string" },
          importance: { type: "number", minimum: 0, maximum: 1 },
        },
        ["content"],
      ),
      memoryTool("memory_recall", "Recall relevant long-term memories for a query.", {
        query: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 20 },
      }),
      memoryTool("memory_forget", "Archive a specific long-term memory by id so it is no longer recalled.", {
        memoryId: { type: "string" },
      }),
    ];
  }

  handlesTool(name: string): boolean {
    return this.toolDefinitions().some((tool) => tool.function.name === name);
  }

  async rememberMemory(
    agentId: string,
    input: { content: string; kind?: "episodic" | "semantic"; category?: string | null; importance?: number },
  ): Promise<{ action: "created" | "noop"; id?: string; reason?: string }> {
    const candidate: MemoryCandidate = {
      kind: input.kind === "episodic" ? "episodic" : "semantic",
      content: input.content,
      category: typeof input.category === "string" && isAgentMemoryCategory(input.category) ? input.category : null,
      importance: input.importance ?? 0.7,
    };
    const ids = this.presenter.writeMemoriesSync([candidate], { agentId });
    if (ids.length > 0) {
      void this.presenter.processPendingEmbeddings(agentId).catch(() => undefined);
      return { action: "created", id: ids[0] };
    }
    return { action: "noop", reason: "duplicate" };
  }

  async recallMemory(agentId: string, query: string): Promise<MemoryRecallItem[]> {
    return this.presenter.recall(agentId, query);
  }

  async forgetMemory(agentId: string, memoryId: string): Promise<boolean> {
    return this.presenter.deleteMemory(agentId, memoryId);
  }

  async callMemoryTool(request: MCPToolCall, agentId: string): Promise<MCPToolResponse> {
    const args = JSON.parse(request.function.arguments || "{}") as Record<string, unknown>;
    let result: unknown;
    switch (request.function.name) {
      case "memory_remember":
        result = await this.rememberMemory(agentId, {
          content: String(args.content ?? ""),
          kind: args.kind === "episodic" ? "episodic" : args.kind === "semantic" ? "semantic" : undefined,
          category: typeof args.category === "string" ? args.category : null,
          importance: typeof args.importance === "number" ? args.importance : undefined,
        });
        break;
      case "memory_recall":
        result = await this.recallMemory(agentId, String(args.query ?? ""));
        break;
      case "memory_forget":
        result = await this.forgetMemory(agentId, String(args.memoryId ?? ""));
        break;
      default:
        throw new Error(`Unknown memory tool: ${request.function.name}`);
    }
    return {
      toolCallId: request.id,
      content: [{ type: "text", text: JSON.stringify(result) }],
      toolResult: result,
    };
  }

  private async getEmbeddings(providerId: string, modelId: string, texts: string[]): Promise<number[][]> {
    const provider = this.resolveProvider(providerId);
    let base = provider.baseUrl.replace(/\/+$/, "");
    if (!base.endsWith("/v1")) base += "/v1";
    base += "/embeddings";

    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({ model: modelId, input: texts }),
    });
    if (!response.ok) throw new Error(`Embeddings API error (${response.status})`);
    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }

  private async generateText(providerId: string, modelId: string, prompt: string): Promise<string> {
    const provider = this.resolveProvider(providerId);
    let base = provider.baseUrl.replace(/\/+$/, "");
    if (!base.endsWith("/v1")) base += "/v1";
    base += "/chat/completions";

    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        max_tokens: 2000,
      }),
    });
    if (!response.ok) throw new Error(`LLM API error (${response.status})`);
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  }

  private resolveProvider(providerId: string): { apiKey: string; baseUrl: string } {
    const providers = this.configPresenter.getProviders() as Array<{
      id: string;
      apiKey: string;
      baseUrl: string;
    }>;
    const provider = providers.find((p) => p.id === providerId);
    if (!provider?.apiKey) throw new Error(`Provider ${providerId} not found or no API key`);
    if (!provider.baseUrl) throw new Error(`Provider ${providerId} has no baseUrl`);
    return provider;
  }
}
