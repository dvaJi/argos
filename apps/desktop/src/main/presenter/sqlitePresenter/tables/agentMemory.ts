import Database from "better-sqlite3-multiple-ciphers";
import { AGENT_MEMORY_CATEGORIES, type AgentMemoryCategory } from "@shared/types/agent-memory";
import { BaseTable } from "./baseTable";

export type AgentMemoryKind = "episodic" | "semantic" | "reflection" | "persona" | "working";

export type AgentMemoryStatus = "pending_embedding" | "embedded" | "error" | "fts_only" | "archived" | "conflicted";

export interface AgentMemoryRow {
  id: string;
  agent_id: string;
  kind: AgentMemoryKind;
  category: AgentMemoryCategory | null;
  content: string;
  importance: number;
  confidence: number | null;
  status: AgentMemoryStatus;
  source_session: string | null;
  source_entry_ids: string | null;
  user_scope: string | null;
  provenance_key: string;
  embedding_id: string | null;
  embedding_dim: number | null;
  embedding_model: string | null;
  last_consolidated_at: number | null;
  conflict_state: string | null;
  conflict_with: string | null;
  persona_state: string | null;
  is_anchor: number;
  superseded_by: string | null;
  created_at: number;
  accessed_at: number | null;
  access_count: number;
  decay_score: number | null;
  consolidated_at: number | null;
}

export interface AgentMemoryInsertInput {
  id: string;
  agentId: string;
  kind: AgentMemoryKind;
  content: string;
  importance?: number;
  confidence?: number | null;
  status?: AgentMemoryStatus;
  category?: AgentMemoryCategory | null;
  userScope?: string | null;
  sourceSession?: string | null;
  provenanceKey?: string | null;
  isAnchor?: boolean;
  createdAt?: number;
  sourceEntryIds?: number[] | null;
  conflictState?: string | null;
  conflictWith?: string | null;
  personaState?: string | null;
}

export interface AgentMemoryListOptions {
  kinds?: AgentMemoryKind[];
  statuses?: AgentMemoryStatus[];
  includeSuperseded?: boolean;
  includeArchived?: boolean;
  limit?: number;
}

const AGENT_MEMORY_SCHEMA_VERSION = 32;

const AGENT_MEMORY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_kind
    ON agent_memory(agent_id, kind, status);
  CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_active
    ON agent_memory(agent_id, superseded_by);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memory_provenance
    ON agent_memory(agent_id, provenance_key)
    WHERE provenance_key IS NOT NULL;
`;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function serializeSourceEntryIds(ids: number[] | null | undefined): string | null {
  if (!ids?.length) {
    return null;
  }
  const valid = ids.filter((id) => Number.isInteger(id) && id >= 0);
  return valid.length > 0 ? JSON.stringify(valid) : null;
}

function normalizeCategory(category: AgentMemoryCategory | null | undefined): AgentMemoryCategory | null {
  return category && AGENT_MEMORY_CATEGORIES.includes(category) ? category : null;
}

export class AgentMemoryTable extends BaseTable {
  private ftsReady = false;

  constructor(db: Database.Database) {
    super(db, "agent_memory");
  }

  getCreateTableSQL(): string {
    return `
      CREATE TABLE IF NOT EXISTS agent_memory (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        category TEXT,
        content TEXT NOT NULL,
        importance REAL NOT NULL DEFAULT 0.5,
        confidence REAL,
        status TEXT NOT NULL DEFAULT 'pending_embedding',
        source_session TEXT,
        source_entry_ids TEXT,
        user_scope TEXT,
        provenance_key TEXT,
        embedding_id TEXT,
        embedding_dim INTEGER,
        embedding_model TEXT,
        last_consolidated_at INTEGER,
        conflict_state TEXT,
        conflict_with TEXT,
        persona_state TEXT,
        is_anchor INTEGER NOT NULL DEFAULT 0,
        superseded_by TEXT,
        created_at INTEGER NOT NULL,
        accessed_at INTEGER,
        access_count INTEGER NOT NULL DEFAULT 0,
        decay_score REAL,
        consolidated_at INTEGER
      );
      ${AGENT_MEMORY_INDEX_SQL}
    `;
  }

  override createTable(): void {
    if (!this.tableExists()) {
      this.db.exec(this.getCreateTableSQL());
    } else {
      this.db.exec(AGENT_MEMORY_INDEX_SQL);
    }
    this.ensureFtsIndex();
  }

  getMigrationSQL(_version: number): string | null {
    return null;
  }

  getLatestVersion(): number {
    return AGENT_MEMORY_SCHEMA_VERSION;
  }

  insert(input: AgentMemoryInsertInput): AgentMemoryRow {
    const row: AgentMemoryRow = {
      id: input.id,
      agent_id: input.agentId,
      kind: input.kind,
      category: normalizeCategory(input.category),
      content: input.content,
      importance: input.importance ?? 0.5,
      confidence: input.confidence ?? null,
      status: input.status ?? "pending_embedding",
      source_session: input.sourceSession ?? null,
      source_entry_ids: serializeSourceEntryIds(input.sourceEntryIds),
      user_scope: input.userScope ?? null,
      provenance_key: input.provenanceKey ?? "",
      embedding_id: null,
      embedding_dim: null,
      embedding_model: null,
      last_consolidated_at: null,
      conflict_state: input.conflictState ?? null,
      conflict_with: input.conflictWith ?? null,
      persona_state: input.personaState ?? null,
      is_anchor: input.isAnchor ? 1 : 0,
      superseded_by: null,
      created_at: input.createdAt ?? Date.now(),
      accessed_at: null,
      access_count: 0,
      decay_score: null,
      consolidated_at: null,
    };

    this.db
      .prepare(
        `INSERT INTO agent_memory (
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
          embedding_id,
          embedding_dim,
          embedding_model,
          last_consolidated_at,
          conflict_state,
          conflict_with,
          persona_state,
          is_anchor,
          superseded_by,
          created_at,
          accessed_at,
          access_count,
          decay_score,
          consolidated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.agent_id,
        row.kind,
        row.category,
        row.content,
        row.importance,
        row.confidence,
        row.status,
        row.source_session,
        row.source_entry_ids,
        row.user_scope,
        row.provenance_key,
        row.embedding_id,
        row.embedding_dim,
        row.embedding_model,
        row.last_consolidated_at,
        row.conflict_state,
        row.conflict_with,
        row.persona_state,
        row.is_anchor,
        row.superseded_by,
        row.created_at,
        row.accessed_at,
        row.access_count,
        row.decay_score,
        row.consolidated_at,
      );

    return row;
  }

  getById(id: string): AgentMemoryRow | undefined {
    return this.db.prepare("SELECT * FROM agent_memory WHERE id = ?").get(id) as AgentMemoryRow | undefined;
  }

  getByProvenanceKey(agentId: string, provenanceKey: string): AgentMemoryRow | undefined {
    return this.db
      .prepare("SELECT * FROM agent_memory WHERE agent_id = ? AND provenance_key = ? LIMIT 1")
      .get(agentId, provenanceKey) as AgentMemoryRow | undefined;
  }

  listByAgent(agentId: string, options: AgentMemoryListOptions = {}): AgentMemoryRow[] {
    const where: string[] = ["agent_id = ?"];
    const params: Array<string | number> = [agentId];

    if (!options.includeSuperseded) {
      where.push("superseded_by IS NULL");
    }
    if (!options.includeArchived && !options.statuses?.includes("archived")) {
      where.push("status != 'archived'");
    }
    if (options.kinds?.length) {
      where.push(`kind IN (${options.kinds.map(() => "?").join(", ")})`);
      params.push(...options.kinds);
    }
    if (options.statuses?.length) {
      where.push(`status IN (${options.statuses.map(() => "?").join(", ")})`);
      params.push(...options.statuses);
    }

    let sql = `SELECT * FROM agent_memory WHERE ${where.join(" AND ")} ORDER BY created_at DESC`;
    if (Number.isFinite(options.limit)) {
      sql += " LIMIT ?";
      params.push(Math.max(1, Math.floor(options.limit as number)));
    }

    return this.db.prepare(sql).all(...params) as AgentMemoryRow[];
  }

  getActivePersona(agentId: string): AgentMemoryRow | undefined {
    return this.db
      .prepare(
        `SELECT *
         FROM agent_memory
         WHERE agent_id = ?
           AND kind = 'persona'
           AND superseded_by IS NULL
           AND status != 'archived'
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(agentId) as AgentMemoryRow | undefined;
  }

  listPersonaVersions(agentId: string): AgentMemoryRow[] {
    return this.db
      .prepare(
        `SELECT *
         FROM agent_memory
         WHERE agent_id = ? AND kind = 'persona'
         ORDER BY created_at DESC`,
      )
      .all(agentId) as AgentMemoryRow[];
  }

  search(agentId: string, query: string, limit = 20): AgentMemoryRow[] {
    const normalized = query.trim();
    if (!normalized) {
      return [];
    }

    const cappedLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const ordered: AgentMemoryRow[] = [];
    const seen = new Set<string>();
    const collect = (rows: AgentMemoryRow[]): void => {
      for (const row of rows) {
        if (seen.has(row.id)) {
          continue;
        }
        seen.add(row.id);
        ordered.push(row);
      }
    };

    if (this.ftsReady) {
      collect(this.searchFts(agentId, normalized, cappedLimit));
    }
    collect(this.searchLike(agentId, normalized, cappedLimit));
    return ordered;
  }

  listPendingEmbedding(limit = 50, agentId?: string): AgentMemoryRow[] {
    const cappedLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
    if (agentId) {
      return this.db
        .prepare(
          `SELECT *
           FROM agent_memory
           WHERE status = 'pending_embedding'
             AND kind != 'persona'
             AND agent_id = ?
           ORDER BY created_at ASC
           LIMIT ?`,
        )
        .all(agentId, cappedLimit) as AgentMemoryRow[];
    }

    return this.db
      .prepare(
        `SELECT *
         FROM agent_memory
         WHERE status = 'pending_embedding'
           AND kind != 'persona'
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(cappedLimit) as AgentMemoryRow[];
  }

  updateStatus(
    id: string,
    status: AgentMemoryStatus,
    embedding?: {
      embeddingId?: string | null;
      embeddingDim?: number | null;
      embeddingModel?: string | null;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE agent_memory
         SET status = ?,
             embedding_id = ?,
             embedding_dim = ?,
             embedding_model = ?
         WHERE id = ?`,
      )
      .run(
        status,
        embedding?.embeddingId ?? null,
        embedding?.embeddingDim ?? null,
        embedding?.embeddingModel ?? null,
        id,
      );
  }

  requeueForEmbedding(agentId: string, statuses: AgentMemoryStatus[]): number {
    if (statuses.length === 0) {
      return 0;
    }

    const placeholders = statuses.map(() => "?").join(", ");
    const result = this.db
      .prepare(
        `UPDATE agent_memory
         SET status = 'pending_embedding',
             embedding_id = NULL,
             embedding_dim = NULL,
             embedding_model = NULL
         WHERE agent_id = ?
           AND superseded_by IS NULL
           AND kind != 'persona'
           AND status IN (${placeholders})`,
      )
      .run(agentId, ...statuses);
    return result.changes;
  }

  markSuperseded(id: string, supersededBy: string | null): void {
    this.db.prepare("UPDATE agent_memory SET superseded_by = ? WHERE id = ?").run(supersededBy, id);
  }

  recordAccess(id: string, accessedAt: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE agent_memory
         SET accessed_at = ?,
             access_count = access_count + 1
         WHERE id = ?`,
      )
      .run(accessedAt, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM agent_memory WHERE id = ?").run(id);
  }

  clearByAgent(agentId: string): number {
    const result = this.db.prepare("DELETE FROM agent_memory WHERE agent_id = ?").run(agentId);
    return result.changes;
  }

  countByAgent(agentId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM agent_memory WHERE agent_id = ?").get(agentId) as
      | { count: number }
      | undefined;
    return row?.count ?? 0;
  }

  private detectFtsCapability(): { available: boolean; tokenizer: "trigram" | "unicode61" } {
    const probe = (tokenizer: string): boolean => {
      const name = `temp.agent_memory_probe_${tokenizer}`;
      try {
        this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS ${name} USING fts5(c, tokenize='${tokenizer}');`);
        this.db.exec(`DROP TABLE IF EXISTS ${name};`);
        return true;
      } catch {
        return false;
      }
    };

    if (probe("trigram")) {
      return { available: true, tokenizer: "trigram" };
    }
    if (probe("unicode61")) {
      return { available: true, tokenizer: "unicode61" };
    }
    return { available: false, tokenizer: "unicode61" };
  }

  private ftsTableExists(): boolean {
    const row = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_memory_fts'").get();
    return Boolean(row);
  }

  private ensureFtsIndex(): void {
    const capability = this.detectFtsCapability();
    if (!capability.available) {
      this.ftsReady = false;
      return;
    }

    const alreadyBuilt = this.ftsTableExists();
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS agent_memory_fts USING fts5(
        content,
        agent_id UNINDEXED,
        content='agent_memory',
        content_rowid='rowid',
        tokenize='${capability.tokenizer}'
      );
      CREATE TRIGGER IF NOT EXISTS agent_memory_fts_ai AFTER INSERT ON agent_memory BEGIN
        INSERT INTO agent_memory_fts(rowid, content, agent_id)
        VALUES (new.rowid, new.content, new.agent_id);
      END;
      CREATE TRIGGER IF NOT EXISTS agent_memory_fts_ad AFTER DELETE ON agent_memory BEGIN
        INSERT INTO agent_memory_fts(agent_memory_fts, rowid, content, agent_id)
        VALUES ('delete', old.rowid, old.content, old.agent_id);
      END;
      CREATE TRIGGER IF NOT EXISTS agent_memory_fts_au AFTER UPDATE OF content ON agent_memory BEGIN
        INSERT INTO agent_memory_fts(agent_memory_fts, rowid, content, agent_id)
        VALUES ('delete', old.rowid, old.content, old.agent_id);
        INSERT INTO agent_memory_fts(rowid, content, agent_id)
        VALUES (new.rowid, new.content, new.agent_id);
      END;
    `);

    if (!alreadyBuilt) {
      this.db.exec(
        `INSERT INTO agent_memory_fts(rowid, content, agent_id)
         SELECT rowid, content, agent_id FROM agent_memory;`,
      );
    }
    this.ftsReady = true;
  }

  private searchFts(agentId: string, normalized: string, limit: number): AgentMemoryRow[] {
    const match = `"${normalized.replace(/"/g, '""')}"`;
    try {
      return this.db
        .prepare(
          `SELECT am.*
           FROM agent_memory_fts f
           JOIN agent_memory am ON am.rowid = f.rowid
           WHERE agent_memory_fts MATCH ?
             AND am.agent_id = ?
             AND am.superseded_by IS NULL
             AND am.status != 'archived'
           ORDER BY bm25(agent_memory_fts)
           LIMIT ?`,
        )
        .all(match, agentId, limit) as AgentMemoryRow[];
    } catch {
      return [];
    }
  }

  private searchLike(agentId: string, normalized: string, limit: number): AgentMemoryRow[] {
    const pattern = `%${escapeLikePattern(normalized)}%`;
    return this.db
      .prepare(
        `SELECT *
         FROM agent_memory
         WHERE agent_id = ?
           AND superseded_by IS NULL
           AND status != 'archived'
           AND content LIKE ? ESCAPE '\\'
         ORDER BY importance DESC, created_at DESC
         LIMIT ?`,
      )
      .all(agentId, pattern, limit) as AgentMemoryRow[];
  }
}
