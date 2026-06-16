import type { SessionRepository, SessionListFilters } from "@argos/backend-core";
import type { CreateSessionInput, SessionWithState } from "@shared/types/agent-interface";

type BunDatabase = any;

export class BunSessionRepository implements SessionRepository {
  private db: BunDatabase;

  constructor(db: BunDatabase) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL DEFAULT 'argos',
        title TEXT NOT NULL DEFAULT '',
        project_dir TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        is_draft INTEGER NOT NULL DEFAULT 0,
        session_kind TEXT NOT NULL DEFAULT 'chat',
        parent_session_id TEXT,
        subagent_enabled INTEGER NOT NULL DEFAULT 1,
        provider_id TEXT DEFAULT '',
        model_id TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'idle',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (session_id) REFERENCES daemon_sessions(id) ON DELETE CASCADE
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_messages_session ON daemon_messages(session_id)
    `);
  }

  async create(input: CreateSessionInput, webContentsId: number): Promise<SessionWithState> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const session = {
      id,
      agent_id: input.agentId || "argos",
      title: input.message?.slice(0, 80) || "New Chat",
      project_dir: input.projectDir || null,
      is_pinned: 0,
      is_draft: 0,
      session_kind: "regular",
      parent_session_id: null,
      subagent_enabled: input.subagentEnabled ?? 1,
      provider_id: input.providerId || "",
      model_id: input.modelId || "",
      status: "idle",
      created_at: now,
      updated_at: now,
      metadata: JSON.stringify({}),
    };

    const stmt = this.db.prepare(`
      INSERT INTO daemon_sessions (id, agent_id, title, project_dir, is_pinned, is_draft, session_kind, parent_session_id, subagent_enabled, provider_id, model_id, status, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.agent_id,
      session.title,
      session.project_dir,
      session.is_pinned,
      session.is_draft,
      session.session_kind,
      session.parent_session_id,
      session.subagent_enabled,
      session.provider_id,
      session.model_id,
      session.status,
      session.created_at,
      session.updated_at,
      session.metadata,
    );

    if (input.message) {
      const msgId = crypto.randomUUID();
      this.db
        .prepare(`
        INSERT INTO daemon_messages (id, session_id, role, content, created_at, updated_at)
        VALUES (?, ?, 'user', ?, ?, ?)
      `)
        .run(msgId, id, input.message, now, now);
    }

    return this.toSessionWithState(session);
  }

  async get(sessionId: string): Promise<SessionWithState | null> {
    const row = this.db.prepare("SELECT * FROM daemon_sessions WHERE id = ?").get(sessionId) as any;
    return row ? this.toSessionWithState(row) : null;
  }

  async list(filters?: SessionListFilters): Promise<SessionWithState[]> {
    let sql = "SELECT * FROM daemon_sessions";
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.agentId) {
      conditions.push("agent_id = ?");
      params.push(filters.agentId);
    }
    if (filters?.projectDir) {
      conditions.push("project_dir = ?");
      params.push(filters.projectDir);
    }
    if (filters?.parentSessionId) {
      conditions.push("parent_session_id = ?");
      params.push(filters.parentSessionId);
    }
    if (!filters?.includeSubagents) {
      conditions.push("parent_session_id IS NULL");
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY updated_at DESC";

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => this.toSessionWithState(row));
  }

  async activate(webContentsId: number, sessionId: string): Promise<void> {
    this.db
      .prepare("UPDATE daemon_sessions SET status = 'active', updated_at = ? WHERE id = ?")
      .run(Date.now(), sessionId);
  }

  async deactivate(webContentsId: number): Promise<void> {
    this.db
      .prepare("UPDATE daemon_sessions SET status = 'idle', updated_at = ? WHERE status = 'active'")
      .run(Date.now());
  }

  async getActive(webContentsId: number): Promise<SessionWithState | null> {
    const row = this.db.prepare("SELECT * FROM daemon_sessions WHERE status = 'active' LIMIT 1").get() as any;
    return row ? this.toSessionWithState(row) : null;
  }

  async delete(sessionId: string): Promise<void> {
    this.db.prepare("DELETE FROM daemon_messages WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM daemon_sessions WHERE id = ?").run(sessionId);
  }

  async rename(sessionId: string, title: string): Promise<void> {
    this.db
      .prepare("UPDATE daemon_sessions SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, Date.now(), sessionId);
  }

  async togglePinned(sessionId: string): Promise<void> {
    this.db
      .prepare("UPDATE daemon_sessions SET is_pinned = NOT is_pinned, updated_at = ? WHERE id = ?")
      .run(Date.now(), sessionId);
  }

  async setPinned(sessionId: string, pinned: boolean): Promise<void> {
    this.db
      .prepare("UPDATE daemon_sessions SET is_pinned = ?, updated_at = ? WHERE id = ?")
      .run(pinned ? 1 : 0, Date.now(), sessionId);
  }

  async setProjectDir(sessionId: string, projectDir: string | null): Promise<void> {
    this.db
      .prepare("UPDATE daemon_sessions SET project_dir = ?, updated_at = ? WHERE id = ?")
      .run(projectDir, Date.now(), sessionId);
  }

  async listMessages(sessionId: string): Promise<any[]> {
    return this.db.prepare("SELECT * FROM daemon_messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
  }

  async getMessage(messageId: string): Promise<any | null> {
    return this.db.prepare("SELECT * FROM daemon_messages WHERE id = ?").get(messageId) || null;
  }

  async addMessage(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db
      .prepare(`
      INSERT INTO daemon_messages (id, session_id, role, content, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .run(id, sessionId, role, content, now, now, JSON.stringify(metadata || {}));
    return id;
  }

  private toSessionWithState(row: any): SessionWithState {
    return {
      id: row.id,
      agentId: row.agent_id,
      title: row.title,
      projectDir: row.project_dir,
      isPinned: Boolean(row.is_pinned),
      isDraft: Boolean(row.is_draft),
      sessionKind: row.session_kind || "chat",
      parentSessionId: row.parent_session_id,
      subagentEnabled: Boolean(row.subagent_enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status || "idle",
      providerId: row.provider_id || "",
      modelId: row.model_id || "",
    };
  }
}
