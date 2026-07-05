import type { ISQLitePresenter } from "@shared/presenter";

type BunDatabase = {
  prepare(sql: string): {
    get(...params: unknown[]): any;
    all(...params: unknown[]): any[];
    run(...params: unknown[]): { changes: number };
  };
};

/**
 * Minimal ISQLitePresenter for ACP session persistence on the daemon.
 * Implements only the methods `AcpSessionPersistence` calls — all routed to the
 * `acp_sessions` table created in db-init.
 */
export function createDaemonAcpSqlitePresenter(db: BunDatabase): ISQLitePresenter {
  const presenter: ISQLitePresenter = {
    async getAcpSession(conversationId: string, agentId: string) {
      const row = db
        .prepare(`SELECT * FROM acp_sessions WHERE conversation_id = ? AND agent_id = ? LIMIT 1`)
        .get(conversationId, agentId);
      return row ? mapRow(row) : null;
    },

    async getAcpSessionByAgentAndSessionId(agentId: string, sessionId: string) {
      const row = db
        .prepare(`SELECT * FROM acp_sessions WHERE agent_id = ? AND session_id = ? LIMIT 1`)
        .get(agentId, sessionId);
      return row ? mapRow(row) : null;
    },

    async upsertAcpSession(conversationId: string, agentId: string, data: any) {
      const now = Date.now();
      db.prepare(
        `INSERT INTO acp_sessions (conversation_id, agent_id, session_id, workdir, status, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(conversation_id, agent_id) DO UPDATE SET
           session_id = excluded.session_id,
           workdir = excluded.workdir,
           status = excluded.status,
           metadata = excluded.metadata,
           updated_at = excluded.updated_at`,
      ).run(
        conversationId,
        agentId,
        data.sessionId ?? null,
        data.workdir ?? null,
        data.status ?? "idle",
        data.metadata ? JSON.stringify(data.metadata) : null,
        now,
        now,
      );
    },

    async updateAcpSessionId(conversationId: string, agentId: string, sessionId: string | null) {
      db.prepare(
        `UPDATE acp_sessions SET session_id = ?, updated_at = ? WHERE conversation_id = ? AND agent_id = ?`,
      ).run(sessionId, Date.now(), conversationId, agentId);
    },

    async updateAcpSessionStatus(conversationId: string, agentId: string, status: string) {
      db.prepare(`UPDATE acp_sessions SET status = ?, updated_at = ? WHERE conversation_id = ? AND agent_id = ?`).run(
        status,
        Date.now(),
        conversationId,
        agentId,
      );
    },

    async updateAcpWorkdir(conversationId: string, agentId: string, workdir: string | null) {
      db.prepare(`UPDATE acp_sessions SET workdir = ?, updated_at = ? WHERE conversation_id = ? AND agent_id = ?`).run(
        workdir,
        Date.now(),
        conversationId,
        agentId,
      );
    },

    async startAcpTurn() {},
    async finishAcpTurn() {},
    async deleteAcpSession(conversationId: string, agentId?: string) {
      if (agentId) {
        db.prepare(`DELETE FROM acp_sessions WHERE conversation_id = ? AND agent_id = ?`).run(conversationId, agentId);
      } else {
        db.prepare(`DELETE FROM acp_sessions WHERE conversation_id = ?`).run(conversationId);
      }
    },

    async createConversation() {
      return null;
    },
    async deleteConversation() {},

    // --- stubs for ISQLitePresenter methods not needed by AcpSessionPersistence ---
  } as unknown as ISQLitePresenter;

  return presenter;
}

function mapRow(row: any) {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    agentId: row.agent_id,
    sessionId: row.session_id,
    workdir: row.workdir,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata,
  };
}
