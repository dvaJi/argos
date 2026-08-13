import type { SessionRepository, SessionListFilters } from "@argos/backend-core";
import type { IEventPublisher } from "@argos/backend-core";
import type {
  ChatMessagePageResult,
  ChatMessageRecord,
  CreateSessionInput,
  MessageFile,
  MessagePageCursor,
  MessageTraceRecord,
  SessionGenerationSettings,
  PendingSessionInputRecord,
  PendingSessionInputState,
  SendMessageInput,
  SessionWithState,
} from "@argos/shared/types/agent-interface";
import type { SearchResult } from "@argos/shared/types/core/search";
import type { ArgosTapeViewManifest, ArgosTapeViewManifestRecord } from "@argos/shared/types/tape-view-manifest";

type BunDatabase = any;

interface PendingInputRow {
  id: string;
  session_id: string;
  mode: "queue" | "steer";
  state: "pending" | "claimed" | "consumed";
  payload_json: string;
  queue_order: number | null;
  claimed_at: number | null;
  consumed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface DaemonSessionMetadata {
  generationSettings?: Partial<SessionGenerationSettings> | null;
  disabledAgentTools?: string[];
  piSessionFile?: string;
}

interface MessageSearchResultRow {
  id: string;
  session_id: string;
  message_id: string;
  search_id: string | null;
  rank: number | null;
  content: string;
  dedupe_key: string;
  created_at: number;
}

interface MessageTraceRow {
  id: string;
  message_id: string;
  session_id: string;
  provider_id: string;
  model_id: string;
  request_seq: number;
  endpoint: string;
  headers_json: string;
  body_json: string;
  truncated: number;
  created_at: number;
}

interface TapeEntryRow {
  session_id: string;
  entry_id: number;
  kind: "event" | "anchor" | "message" | "tool_call" | "tool_result";
  name: string | null;
  source_type: string | null;
  source_id: string | null;
  source_seq: number | null;
  provenance_key: string | null;
  payload_json: string;
  meta_json: string;
  created_at: number;
}

/** Per-message usage stat captured at the daemon execution layer (Pi + ACP). */
export interface UsageStatRecord {
  messageId: string;
  sessionId: string;
  providerId: string;
  modelId: string;
  usageDate: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUsd: number | null;
  costSource: "reported" | "estimated" | "none";
  createdAt: number;
}

export type UsageWindow = "past24h" | "7d" | "30d" | "90d";

const USAGE_WINDOW_MS: Record<UsageWindow, number> = {
  past24h: 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

export function usageWindowCutoffMs(window: UsageWindow, now = Date.now()): number {
  return now - USAGE_WINDOW_MS[window];
}

/** Local `YYYY-MM-DD` key for a timestamp. */
export function usageDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MAX_ACTIVE_PENDING_INPUTS = 5;

/**
 * Coerce a stored session status into a value the renderer's SessionStatusSchema
 * accepts (`idle | generating | blocked | done | error`). The daemon's `daemon_sessions`
 * table also uses `'active'` to mark the currently-selected session (a UI concept),
 * which isn't a valid generation status — map it (and any unknown value) to `idle`.
 */
const VALID_SESSION_STATUSES = new Set(["idle", "generating", "blocked", "done", "error"]);
function coerceSessionStatus(raw: unknown): "idle" | "generating" | "blocked" | "done" | "error" {
  const value = typeof raw === "string" ? raw : "";
  return VALID_SESSION_STATUSES.has(value) ? (value as "idle" | "generating" | "blocked" | "done" | "error") : "idle";
}

/**
 * Coerce message content into the JSON string format the renderer expects:
 *  - user messages → `{text, files: []}`
 *  - assistant messages → `[{type:"content", content, status, timestamp}]`
 *
 * If the stored content is already valid JSON in the right shape, pass through.
 * If it's legacy plain text (pre-fix), wrap it on the fly so old messages render.
 */
function coerceMessageContent(role: string, raw: unknown): string {
  const content = typeof raw === "string" ? raw : "";

  if (content) {
    try {
      const parsed = JSON.parse(content);
      if (role === "user" && parsed && typeof parsed === "object" && !Array.isArray(parsed) && "text" in parsed) {
        return content;
      }
      if (role === "assistant" && Array.isArray(parsed)) {
        return content;
      }
    } catch {
      // plain text — fall through to wrap
    }
  }

  if (role === "user") {
    return JSON.stringify({ text: content, files: [] });
  }
  return JSON.stringify([{ type: "content", content, status: "success", timestamp: 0 }]);
}

function normalizeInput(input: string | SendMessageInput): SendMessageInput {
  if (typeof input === "string") {
    return { text: input, files: [] };
  }

  return {
    text: typeof input?.text === "string" ? input.text : "",
    files: Array.isArray(input?.files) ? input.files.filter(Boolean) : [],
  };
}

function extractUserMessageInput(content: string): SendMessageInput {
  try {
    const parsed = JSON.parse(content) as SendMessageInput | string | null;
    if (typeof parsed === "string") {
      return { text: parsed, files: [] };
    }
    if (!parsed || typeof parsed !== "object") {
      return { text: "", files: [] };
    }
    return normalizeInput(parsed);
  } catch {
    return { text: content, files: [] };
  }
}

function buildEditedUserContent(rawContent: string, text: string): string {
  const fallback = {
    text,
    files: [] as MessageFile[],
    links: [] as unknown[],
    search: false,
    think: false,
  };

  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown> | string;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return JSON.stringify(fallback);
    }

    const next: Record<string, unknown> = { ...parsed, text };
    if (!Array.isArray(next.files)) next.files = [];
    if (!Array.isArray(next.links)) next.links = [];
    if (typeof next.search !== "boolean") next.search = false;
    if (typeof next.think !== "boolean") next.think = false;

    if (Array.isArray(next.content)) {
      let replaced = false;
      const contentBlocks = next.content.map((item: unknown) => {
        if (
          !replaced &&
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          (item as { type?: unknown }).type === "text"
        ) {
          replaced = true;
          return { ...(item as Record<string, unknown>), content: text };
        }
        return item;
      });
      if (!replaced) {
        contentBlocks.unshift({ type: "text", content: text });
      }
      next.content = contentBlocks;
    }

    return JSON.stringify(next);
  } catch {
    return JSON.stringify(fallback);
  }
}

function normalizeDisabledAgentTools(disabledAgentTools?: string[]): string[] {
  if (!Array.isArray(disabledAgentTools)) {
    return [];
  }

  return Array.from(
    new Set(
      disabledAgentTools
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export class BunSessionRepository implements SessionRepository {
  private db: BunDatabase;
  private readonly eventPublisher?: IEventPublisher;

  constructor(db: BunDatabase, eventPublisher?: IEventPublisher) {
    this.db = db;
    this.eventPublisher = eventPublisher;
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL DEFAULT 'argos',
        title TEXT NOT NULL DEFAULT '',
        project_dir TEXT,
        permission_mode TEXT NOT NULL DEFAULT 'default',
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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_pending_inputs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending',
        payload_json TEXT NOT NULL,
        queue_order INTEGER,
        claimed_at INTEGER,
        consumed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_pending_inputs_session
        ON daemon_pending_inputs(session_id, state, mode, queue_order, created_at)
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_message_search_results (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        search_id TEXT DEFAULT NULL,
        rank INTEGER DEFAULT NULL,
        content TEXT NOT NULL,
        dedupe_key TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_message_search_results_message
        ON daemon_message_search_results(message_id, created_at ASC)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_message_search_results_message_search
        ON daemon_message_search_results(message_id, search_id, rank)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_message_search_results_session
        ON daemon_message_search_results(session_id, created_at DESC)
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_message_traces (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        request_seq INTEGER NOT NULL,
        endpoint TEXT NOT NULL,
        headers_json TEXT NOT NULL,
        body_json TEXT NOT NULL,
        truncated INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_message_traces_message_seq
        ON daemon_message_traces(message_id, request_seq DESC)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_message_traces_session_time
        ON daemon_message_traces(session_id, created_at DESC)
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_tape_entries (
        session_id TEXT NOT NULL,
        entry_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        name TEXT,
        source_type TEXT,
        source_id TEXT,
        source_seq INTEGER,
        provenance_key TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}',
        meta_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, entry_id)
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_tape_entries_session_kind
        ON daemon_tape_entries(session_id, kind, entry_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_tape_entries_session_name
        ON daemon_tape_entries(session_id, name, entry_id)
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_usage_stats (
        message_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        usage_date TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        cost_source TEXT NOT NULL DEFAULT 'none',
        created_at INTEGER NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_usage_stats_date
        ON daemon_usage_stats(usage_date, created_at)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_daemon_usage_stats_session
        ON daemon_usage_stats(session_id)
    `);
    // Migration: the first version of this table carried a FK to
    // daemon_sessions, which rejects rows for sessions Argos doesn't own
    // (external Codex/Claude Code sessions scanned from local JSONL). Rebuild
    // the table without the FK when present.
    try {
      const usageFks = this.db.prepare("PRAGMA foreign_key_list(daemon_usage_stats)").all() as Array<{ table: string }>;
      if (usageFks.some((fk) => fk.table === "daemon_sessions")) {
        this.db.exec("ALTER TABLE daemon_usage_stats RENAME TO daemon_usage_stats_legacy");
        this.db.exec(`
          CREATE TABLE daemon_usage_stats (
            message_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            provider_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            cached_input_tokens INTEGER NOT NULL DEFAULT 0,
            cache_write_input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            reasoning_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            cost_usd REAL,
            cost_source TEXT NOT NULL DEFAULT 'none',
            created_at INTEGER NOT NULL
          )
        `);
        this.db.exec(
          `INSERT INTO daemon_usage_stats
             (message_id, session_id, provider_id, model_id, usage_date,
              input_tokens, cached_input_tokens, cache_write_input_tokens,
              output_tokens, reasoning_tokens, total_tokens,
              cost_usd, cost_source, created_at)
           SELECT message_id, session_id, provider_id, model_id, usage_date,
              input_tokens, cached_input_tokens, cache_write_input_tokens,
              output_tokens, reasoning_tokens, total_tokens,
              cost_usd, cost_source, created_at
           FROM daemon_usage_stats_legacy`,
        );
        this.db.exec("DROP TABLE daemon_usage_stats_legacy");
      }
    } catch {
      // non-fatal: schema migration is best-effort
    }
    const sessionColumns = new Set(
      (this.db.prepare("PRAGMA table_info(daemon_sessions)").all() as Array<{ name: string }>).map((row) => row.name),
    );
    if (!sessionColumns.has("permission_mode")) {
      this.db.exec("ALTER TABLE daemon_sessions ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'default'");
    }
    if (!sessionColumns.has("metadata")) {
      this.db.exec("ALTER TABLE daemon_sessions ADD COLUMN metadata TEXT DEFAULT '{}'");
    }
    const messageColumns = new Set(
      (this.db.prepare("PRAGMA table_info(daemon_messages)").all() as Array<{ name: string }>).map((row) => row.name),
    );
    if (!messageColumns.has("status")) {
      this.db.exec("ALTER TABLE daemon_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'");
    }
    if (!messageColumns.has("is_context_edge")) {
      this.db.exec("ALTER TABLE daemon_messages ADD COLUMN is_context_edge INTEGER NOT NULL DEFAULT 0");
    }
    if (!messageColumns.has("trace_count")) {
      this.db.exec("ALTER TABLE daemon_messages ADD COLUMN trace_count INTEGER NOT NULL DEFAULT 0");
    }
    this.resetPrePiAgentSessions();
  }

  /**
   * Pi JSONL sessions cannot safely continue the removed Argos message-loop
   * history. This alpha migration deliberately removes non-ACP sessions once.
   */
  private resetPrePiAgentSessions(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_runtime_migrations (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);
    const migrationId = "pi-runtime-hard-cutover-v1";
    const applied = this.db.prepare("SELECT 1 FROM daemon_runtime_migrations WHERE id = ?").get(migrationId);
    if (applied) return;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const obsolete = "SELECT id FROM daemon_sessions WHERE provider_id != 'acp'";
      this.db.exec(`DELETE FROM daemon_pending_inputs WHERE session_id IN (${obsolete})`);
      this.db.exec(`DELETE FROM daemon_message_search_results WHERE session_id IN (${obsolete})`);
      this.db.exec(`DELETE FROM daemon_message_traces WHERE session_id IN (${obsolete})`);
      this.db.exec(`DELETE FROM daemon_tape_entries WHERE session_id IN (${obsolete})`);
      this.db.exec(`DELETE FROM daemon_messages WHERE session_id IN (${obsolete})`);
      this.db.exec("DELETE FROM daemon_sessions WHERE provider_id != 'acp'");
      this.db
        .prepare("INSERT INTO daemon_runtime_migrations (id, applied_at) VALUES (?, ?)")
        .run(migrationId, Date.now());
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async create(input: CreateSessionInput, webContentsId: number): Promise<SessionWithState> {
    return this.insertSession({
      agentId: input.agentId || "argos",
      title: input.message?.slice(0, 80) || "New Chat",
      projectDir: input.projectDir || null,
      permissionMode: input.permissionMode || "default",
      isPinned: false,
      isDraft: false,
      sessionKind: "regular",
      parentSessionId: null,
      subagentEnabled: input.subagentEnabled ?? true,
      providerId: input.providerId || "",
      modelId: input.modelId || "",
      // Message persistence belongs to the provider execution path. Keeping
      // session creation side-effect free lets the caller start the initial
      // turn exactly once, just like later chat.sendMessage requests.
      message: null,
      generationSettings: input.generationSettings ?? null,
      disabledAgentTools: input.disabledAgentTools ?? [],
    });
  }

  async createDraftAcpSession(input: {
    agentId: string;
    projectDir: string;
    permissionMode?: "default" | "full_access";
  }): Promise<SessionWithState> {
    const agentId = input.agentId.trim();
    const projectDir = input.projectDir.trim();
    const permissionMode = input.permissionMode === "default" ? "default" : "full_access";
    const reusable = await this.findReusableDraftSession(agentId, projectDir);
    if (reusable) {
      return reusable;
    }

    const session = await this.insertSession({
      agentId,
      title: "New Chat",
      projectDir,
      permissionMode,
      isPinned: false,
      isDraft: true,
      sessionKind: "regular",
      parentSessionId: null,
      subagentEnabled: false,
      providerId: "acp",
      modelId: agentId,
      message: null,
      generationSettings: null,
      disabledAgentTools: [],
    });
    return session;
  }

  async listPendingInputs(sessionId: string): Promise<PendingSessionInputRecord[]> {
    return this.listPendingRows(sessionId)
      .filter((row) => row.state !== "claimed")
      .map((row) => this.toPendingRecord(row));
  }

  async queuePendingInput(
    sessionId: string,
    input: string | SendMessageInput,
    options?: { state?: PendingSessionInputState },
  ): Promise<PendingSessionInputRecord> {
    this.ensureSessionExists(sessionId);
    this.ensureWithinLimit(sessionId);
    const normalized = normalizeInput(input);
    const now = Date.now();
    const id = crypto.randomUUID();
    const queueOrder = this.getNextQueueOrder(sessionId);
    this.db
      .prepare(
        `
        INSERT INTO daemon_pending_inputs (
          id, session_id, mode, state, payload_json, queue_order, claimed_at, consumed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        sessionId,
        "queue",
        options?.state ?? "pending",
        JSON.stringify(normalized),
        queueOrder,
        options?.state === "claimed" ? now : null,
        null,
        now,
        now,
      );
    const row = this.getPendingRow(id);
    if (!row) {
      throw new Error(`Failed to create pending input ${id}`);
    }
    this.emitPendingInputsUpdated(sessionId);
    return this.toPendingRecord(row);
  }

  async updateQueuedInput(
    sessionId: string,
    itemId: string,
    input: string | SendMessageInput,
  ): Promise<PendingSessionInputRecord> {
    const row = this.assertQueueInput(sessionId, itemId);
    if (row.state !== "pending") {
      throw new Error("Steer inputs are locked and cannot be modified.");
    }
    this.db
      .prepare("UPDATE daemon_pending_inputs SET payload_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(normalizeInput(input)), Date.now(), itemId);
    const updated = this.getPendingRow(itemId);
    if (!updated) {
      throw new Error(`Pending input not found: ${itemId}`);
    }
    this.emitPendingInputsUpdated(sessionId);
    return this.toPendingRecord(updated);
  }

  async moveQueuedInput(sessionId: string, itemId: string, toIndex: number): Promise<PendingSessionInputRecord[]> {
    this.assertQueueInput(sessionId, itemId);
    const queueRows = this.getActiveQueueRows(sessionId);
    const fromIndex = queueRows.findIndex((row) => row.id === itemId);
    if (fromIndex === -1) {
      throw new Error(`Pending queue item not found: ${itemId}`);
    }

    const clampedIndex = Math.max(0, Math.min(toIndex, queueRows.length - 1));
    if (fromIndex !== clampedIndex) {
      const [moved] = queueRows.splice(fromIndex, 1);
      queueRows.splice(clampedIndex, 0, moved);
      this.resequenceQueueRows(queueRows);
      this.emitPendingInputsUpdated(sessionId);
    }
    return this.listPendingInputs(sessionId);
  }

  async convertPendingInputToSteer(sessionId: string, itemId: string): Promise<PendingSessionInputRecord> {
    this.assertQueueInput(sessionId, itemId);
    this.db
      .prepare("UPDATE daemon_pending_inputs SET mode = 'steer', queue_order = null, updated_at = ? WHERE id = ?")
      .run(Date.now(), itemId);
    this.resequenceQueue(sessionId);
    const row = this.getPendingRow(itemId);
    if (!row) {
      throw new Error(`Pending input not found: ${itemId}`);
    }
    this.emitPendingInputsUpdated(sessionId);
    return this.toPendingRecord(row);
  }

  async deletePendingInput(sessionId: string, itemId: string): Promise<void> {
    const row = this.assertDeletablePendingInput(sessionId, itemId);
    this.db.prepare("DELETE FROM daemon_pending_inputs WHERE id = ?").run(itemId);
    if (row.mode === "queue") {
      this.resequenceQueue(sessionId);
    }
    this.emitPendingInputsUpdated(sessionId);
  }

  async steerPendingInput(sessionId: string, itemId: string): Promise<PendingSessionInputRecord> {
    const row = this.assertDeletablePendingInput(sessionId, itemId);
    if (row.mode === "queue") {
      return await this.convertPendingInputToSteer(sessionId, itemId);
    }
    return this.toPendingRecord(row);
  }

  async resumePendingQueue(sessionId: string): Promise<void> {
    this.ensureSessionExists(sessionId);
  }

  private async insertSession(input: {
    agentId: string;
    title: string;
    projectDir: string | null;
    permissionMode: "default" | "full_access";
    isPinned: boolean;
    isDraft: boolean;
    sessionKind: string;
    parentSessionId: string | null;
    subagentEnabled: boolean;
    providerId: string;
    modelId: string;
    message: string | null;
    generationSettings?: Partial<SessionGenerationSettings> | null;
    disabledAgentTools?: string[];
  }): Promise<SessionWithState> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const metadata: DaemonSessionMetadata = {};

    if (input.generationSettings !== undefined && input.generationSettings !== null) {
      metadata.generationSettings = this.normalizeGenerationSettings(input.generationSettings);
    }
    if (input.disabledAgentTools !== undefined) {
      metadata.disabledAgentTools = normalizeDisabledAgentTools(input.disabledAgentTools);
    }

    const session = {
      id,
      agent_id: input.agentId || "argos",
      title: input.title || "New Chat",
      project_dir: input.projectDir || null,
      permission_mode: input.permissionMode || "default",
      is_pinned: input.isPinned ? 1 : 0,
      is_draft: input.isDraft ? 1 : 0,
      session_kind: input.sessionKind || "regular",
      parent_session_id: input.parentSessionId,
      subagent_enabled: input.subagentEnabled ? 1 : 0,
      provider_id: input.providerId || "",
      model_id: input.modelId || "",
      status: "idle",
      created_at: now,
      updated_at: now,
      metadata: JSON.stringify(metadata),
    };

    const stmt = this.db.prepare(`
      INSERT INTO daemon_sessions (id, agent_id, title, project_dir, permission_mode, is_pinned, is_draft, session_kind, parent_session_id, subagent_enabled, provider_id, model_id, status, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.agent_id,
      session.title,
      session.project_dir,
      session.permission_mode,
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

    const record = this.toSessionWithState(session);
    this.emitSessionUpdated([record.id], "created");
    return record;
  }

  private async findReusableDraftSession(agentId: string, projectDir: string): Promise<SessionWithState | null> {
    const candidates = await this.list({ agentId, projectDir });
    for (const session of candidates) {
      if (!session.isDraft || session.providerId !== "acp") {
        continue;
      }
      const page = await this.listMessagesPage(session.id, { limit: 1 });
      if (page.messages.length === 0) {
        return session;
      }
    }
    return null;
  }

  private ensureSessionExists(sessionId: string): void {
    const session = this.db.prepare("SELECT id FROM daemon_sessions WHERE id = ?").get(sessionId) as
      | { id: string }
      | undefined;
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
  }

  private getPendingRow(id: string): PendingInputRow | undefined {
    return this.db.prepare("SELECT * FROM daemon_pending_inputs WHERE id = ?").get(id) as PendingInputRow | undefined;
  }

  private listPendingRows(sessionId: string): PendingInputRow[] {
    return this.db
      .prepare(
        `SELECT *
         FROM daemon_pending_inputs
         WHERE session_id = ?
         ORDER BY
           CASE mode WHEN 'steer' THEN 0 ELSE 1 END ASC,
           CASE
             WHEN mode = 'queue' THEN COALESCE(queue_order, 2147483647)
             ELSE created_at
           END ASC,
           created_at ASC`,
      )
      .all(sessionId) as PendingInputRow[];
  }

  private getActiveQueueRows(sessionId: string): PendingInputRow[] {
    return this.listPendingRows(sessionId).filter((row) => row.mode === "queue" && row.state !== "consumed");
  }

  private getNextQueueOrder(sessionId: string): number {
    const rows = this.getActiveQueueRows(sessionId);
    return rows.length > 0 ? Math.max(...rows.map((row) => row.queue_order ?? 0)) + 1 : 0;
  }

  private resequenceQueue(sessionId: string): void {
    this.resequenceQueueRows(this.getActiveQueueRows(sessionId));
  }

  private resequenceQueueRows(rows: PendingInputRow[]): void {
    rows.forEach((row, index) => {
      this.db
        .prepare("UPDATE daemon_pending_inputs SET queue_order = ?, updated_at = ? WHERE id = ?")
        .run(index, Date.now(), row.id);
    });
  }

  private assertQueueInput(sessionId: string, itemId: string): PendingInputRow {
    const row = this.getPendingRow(itemId);
    if (!row || row.session_id !== sessionId) {
      throw new Error(`Pending input not found: ${itemId}`);
    }
    if (row.mode !== "queue") {
      throw new Error("Steer inputs are locked and cannot be modified.");
    }
    return row;
  }

  private assertDeletablePendingInput(sessionId: string, itemId: string): PendingInputRow {
    const row = this.getPendingRow(itemId);
    if (!row || row.session_id !== sessionId) {
      throw new Error(`Pending input not found: ${itemId}`);
    }
    return row;
  }

  private ensureWithinLimit(sessionId: string): void {
    if (this.getActiveQueueRows(sessionId).length >= MAX_ACTIVE_PENDING_INPUTS) {
      throw new Error("Pending input limit reached for this session.");
    }
  }

  private parsePayload(row: PendingInputRow): SendMessageInput {
    try {
      const parsed = JSON.parse(row.payload_json) as SendMessageInput;
      return {
        text: typeof parsed?.text === "string" ? parsed.text : "",
        files: Array.isArray(parsed?.files) ? parsed.files.filter(Boolean) : [],
      };
    } catch {
      return { text: "", files: [] };
    }
  }

  private toPendingRecord(row: PendingInputRow): PendingSessionInputRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      mode: row.mode,
      state: row.state,
      payload: this.parsePayload(row),
      queueOrder: row.queue_order,
      claimedAt: row.claimed_at,
      consumedAt: row.consumed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private emitSessionUpdated(sessionIds: string[], reason: "created" | "updated" | "deleted" = "updated"): void {
    this.eventPublisher?.publish("sessions.updated", {
      sessionIds,
      reason,
      activeSessionId: null,
    });
  }

  private emitPendingInputsUpdated(sessionId: string): void {
    void this.listPendingInputs(sessionId).then((items) => {
      this.eventPublisher?.publish("sessions.pendingInputs.changed", {
        sessionId,
        items,
        version: Date.now(),
      });
    });
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

  async listPage(options?: {
    limit?: number;
    cursor?: {
      updatedAt: number;
      id: string;
    } | null;
    agentId?: string;
    includeSubagents?: boolean;
    parentSessionId?: string;
  }): Promise<{
    records: SessionWithState[];
    nextCursor: { updatedAt: number; id: string } | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(Math.max(Math.floor(options?.limit ?? 100), 1), 100);
    const records = await this.list({
      agentId: options?.agentId,
      includeSubagents: options?.includeSubagents,
      parentSessionId: options?.parentSessionId,
    });
    const cursor = options?.cursor ?? null;
    const filtered = cursor
      ? records.filter(
          (record) =>
            record.updatedAt < cursor.updatedAt || (record.updatedAt === cursor.updatedAt && record.id < cursor.id),
        )
      : records;
    const pageRecords = filtered.slice(0, limit);
    const hasMore = filtered.length > pageRecords.length;
    const lastRecord = pageRecords.at(-1);
    return {
      records: pageRecords,
      nextCursor: hasMore && lastRecord ? { updatedAt: lastRecord.updatedAt, id: lastRecord.id } : null,
      hasMore,
    };
  }

  async getMany(ids: string[]): Promise<SessionWithState[]> {
    const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    const sessions = await Promise.all(uniqueIds.map(async (id) => await this.get(id)));
    return sessions.filter((session): session is SessionWithState => session !== null);
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
    this.ensureSessionExists(sessionId);
    this.db.prepare("DELETE FROM daemon_messages WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM daemon_pending_inputs WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM daemon_sessions WHERE id = ?").run(sessionId);
    this.emitSessionUpdated([sessionId], "deleted");
  }

  async rename(sessionId: string, title: string): Promise<void> {
    this.ensureSessionExists(sessionId);
    this.db
      .prepare("UPDATE daemon_sessions SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, Date.now(), sessionId);
    this.emitSessionUpdated([sessionId], "updated");
  }

  async activateDraftSession(sessionId: string, title?: string): Promise<void> {
    this.ensureSessionExists(sessionId);
    if (title) {
      this.db
        .prepare("UPDATE daemon_sessions SET is_draft = 0, title = ?, status = 'active', updated_at = ? WHERE id = ?")
        .run(title, Date.now(), sessionId);
    } else {
      this.db
        .prepare("UPDATE daemon_sessions SET is_draft = 0, status = 'active', updated_at = ? WHERE id = ?")
        .run(Date.now(), sessionId);
    }
    this.emitSessionUpdated([sessionId], "updated");
  }

  async togglePinned(sessionId: string): Promise<void> {
    this.ensureSessionExists(sessionId);
    this.db
      .prepare("UPDATE daemon_sessions SET is_pinned = NOT is_pinned, updated_at = ? WHERE id = ?")
      .run(Date.now(), sessionId);
    this.emitSessionUpdated([sessionId], "updated");
  }

  async setPinned(sessionId: string, pinned: boolean): Promise<void> {
    this.ensureSessionExists(sessionId);
    this.db
      .prepare("UPDATE daemon_sessions SET is_pinned = ?, updated_at = ? WHERE id = ?")
      .run(pinned ? 1 : 0, Date.now(), sessionId);
    this.emitSessionUpdated([sessionId], "updated");
  }

  async setProjectDir(sessionId: string, projectDir: string | null): Promise<void> {
    this.ensureSessionExists(sessionId);
    this.db
      .prepare("UPDATE daemon_sessions SET project_dir = ?, updated_at = ? WHERE id = ?")
      .run(projectDir, Date.now(), sessionId);
    this.emitSessionUpdated([sessionId], "updated");
  }

  async setSubagentEnabled(sessionId: string, enabled: boolean): Promise<void> {
    this.ensureSessionExists(sessionId);
    this.db
      .prepare("UPDATE daemon_sessions SET subagent_enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, Date.now(), sessionId);
    this.emitSessionUpdated([sessionId], "updated");
  }

  async getPermissionMode(sessionId: string): Promise<"default" | "full_access"> {
    const row = this.db.prepare("SELECT permission_mode FROM daemon_sessions WHERE id = ?").get(sessionId) as
      | { permission_mode?: string }
      | undefined;
    return row?.permission_mode === "full_access" ? "full_access" : "default";
  }

  async setPermissionMode(sessionId: string, mode: "default" | "full_access"): Promise<void> {
    this.ensureSessionExists(sessionId);
    this.db
      .prepare("UPDATE daemon_sessions SET permission_mode = ?, updated_at = ? WHERE id = ?")
      .run(mode, Date.now(), sessionId);
    this.emitSessionUpdated([sessionId], "updated");
  }

  async setProviderModel(sessionId: string, providerId: string, modelId: string): Promise<void> {
    this.ensureSessionExists(sessionId);
    this.db
      .prepare("UPDATE daemon_sessions SET provider_id = ?, model_id = ?, updated_at = ? WHERE id = ?")
      .run(providerId, modelId, Date.now(), sessionId);
    this.emitSessionUpdated([sessionId], "updated");
  }

  async setAgentId(sessionId: string, agentId: string): Promise<void> {
    this.ensureSessionExists(sessionId);
    this.db
      .prepare("UPDATE daemon_sessions SET agent_id = ?, updated_at = ? WHERE id = ?")
      .run(agentId, Date.now(), sessionId);
    this.emitSessionUpdated([sessionId], "updated");
  }

  async moveSessionToAgent(
    sessionId: string,
    input: {
      agentId: string;
      providerId: string;
      modelId: string;
      projectDir: string | null;
      permissionMode: "default" | "full_access";
      subagentEnabled: boolean;
      generationSettings?: Partial<SessionGenerationSettings> | null;
      disabledAgentTools?: string[];
    },
  ): Promise<SessionWithState> {
    this.ensureSessionExists(sessionId);
    const metadata: DaemonSessionMetadata = {};
    if (input.generationSettings !== undefined && input.generationSettings !== null) {
      metadata.generationSettings = this.normalizeGenerationSettings(input.generationSettings);
    }
    if (input.disabledAgentTools !== undefined) {
      metadata.disabledAgentTools = normalizeDisabledAgentTools(input.disabledAgentTools);
    }
    this.db
      .prepare(
        `
        UPDATE daemon_sessions
        SET agent_id = ?, provider_id = ?, model_id = ?, project_dir = ?, permission_mode = ?, subagent_enabled = ?, metadata = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(
        input.agentId,
        input.providerId,
        input.modelId,
        input.projectDir,
        input.permissionMode,
        input.subagentEnabled ? 1 : 0,
        JSON.stringify(metadata),
        Date.now(),
        sessionId,
      );
    const updated = await this.get(sessionId);
    if (!updated) {
      throw new Error(`Session not found after transfer: ${sessionId}`);
    }
    this.emitSessionUpdated([sessionId], "updated");
    return updated;
  }

  async getGenerationSettings(sessionId: string): Promise<SessionGenerationSettings | null> {
    const metadata = this.getSessionMetadata(sessionId);
    if (!("generationSettings" in metadata)) {
      return null;
    }
    return this.normalizeGenerationSettings(metadata.generationSettings ?? null);
  }

  async updateGenerationSettings(
    sessionId: string,
    settings: Partial<SessionGenerationSettings>,
  ): Promise<SessionGenerationSettings> {
    const current = (await this.getGenerationSettings(sessionId)) ?? this.buildDefaultGenerationSettings();
    const next = this.normalizeGenerationSettings({ ...current, ...settings });
    this.updateSessionMetadata(sessionId, (metadata) => ({
      ...metadata,
      generationSettings: next,
    }));
    return next;
  }

  async getDisabledAgentTools(sessionId: string): Promise<string[]> {
    const metadata = this.getSessionMetadata(sessionId);
    return normalizeDisabledAgentTools(metadata.disabledAgentTools);
  }

  getPiSessionFile(sessionId: string): string | undefined {
    return this.getSessionMetadata(sessionId).piSessionFile;
  }

  setPiSessionFile(sessionId: string, sessionFile: string): void {
    this.updateSessionMetadata(sessionId, (metadata) => ({ ...metadata, piSessionFile: sessionFile }));
  }

  async updateDisabledAgentTools(sessionId: string, disabledAgentTools: string[]): Promise<string[]> {
    const normalized = normalizeDisabledAgentTools(disabledAgentTools);
    this.updateSessionMetadata(sessionId, (metadata) => ({
      ...metadata,
      disabledAgentTools: normalized,
    }));
    return normalized;
  }

  async clearMessages(sessionId: string): Promise<void> {
    this.ensureSessionExists(sessionId);
    this.db.prepare("DELETE FROM daemon_messages WHERE session_id = ?").run(sessionId);
    this.emitSessionUpdated([sessionId], "updated");
  }

  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    const target = await this.requireMessage(sessionId, messageId);
    this.deleteMessagesFromOrderSeq(sessionId, target.orderSeq);
    this.emitSessionUpdated([sessionId], "updated");
  }

  async editUserMessage(sessionId: string, messageId: string, text: string): Promise<ChatMessageRecord> {
    const target = await this.requireMessage(sessionId, messageId);
    if (target.role !== "user") {
      throw new Error("Only user messages can be edited.");
    }
    const nextText = text.trim();
    if (!nextText) {
      throw new Error("Edited message cannot be empty.");
    }
    this.db
      .prepare("UPDATE daemon_messages SET content = ?, updated_at = ? WHERE id = ?")
      .run(buildEditedUserContent(target.content, nextText), Date.now(), messageId);
    const updated = await this.getMessage(messageId);
    if (!updated) {
      throw new Error(`Message ${messageId} not found after edit`);
    }
    this.emitSessionUpdated([sessionId], "updated");
    return updated;
  }

  async prepareRetryMessage(sessionId: string, messageId: string): Promise<SendMessageInput> {
    const target = await this.requireMessage(sessionId, messageId);
    const sourceUserMessage =
      target.role === "user" ? target : await this.getLastUserMessageBeforeOrAt(sessionId, target.orderSeq);
    if (!sourceUserMessage) {
      throw new Error("No user message found for retry.");
    }
    const retryInput = extractUserMessageInput(sourceUserMessage.content);
    if (!retryInput.text.trim()) {
      throw new Error("Cannot retry an empty user message.");
    }
    this.deleteMessagesFromOrderSeq(sessionId, sourceUserMessage.orderSeq);
    this.emitSessionUpdated([sessionId], "updated");
    return retryInput;
  }

  async forkSession(sourceSessionId: string, targetMessageId: string, newTitle?: string): Promise<SessionWithState> {
    const sourceSession = await this.get(sourceSessionId);
    if (!sourceSession) {
      throw new Error(`Session not found: ${sourceSessionId}`);
    }
    const target = await this.requireMessage(sourceSessionId, targetMessageId);
    const fork = await this.insertSession({
      agentId: sourceSession.agentId,
      title: newTitle?.trim() || `Fork of ${sourceSession.title}`,
      projectDir: sourceSession.projectDir,
      permissionMode: sourceSession.providerId === "acp" ? await this.getPermissionMode(sourceSessionId) : "default",
      isPinned: false,
      isDraft: false,
      sessionKind: sourceSession.sessionKind,
      parentSessionId: null,
      subagentEnabled: sourceSession.subagentEnabled,
      providerId: sourceSession.providerId,
      modelId: sourceSession.modelId,
      message: null,
      generationSettings: await this.getGenerationSettings(sourceSessionId),
      disabledAgentTools: await this.getDisabledAgentTools(sourceSessionId),
    });
    const messages = (await this.listMessages(sourceSessionId)).filter(
      (message) => message.orderSeq <= target.orderSeq,
    );
    for (const message of messages) {
      await this.addMessage(fork.id, message.role, message.content, this.parseMetadata(message.metadata));
    }
    this.emitSessionUpdated([fork.id], "created");
    return fork;
  }

  async listMessages(sessionId: string): Promise<ChatMessageRecord[]> {
    const rows = this.db
      .prepare("SELECT * FROM daemon_messages WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as any[];
    return rows.map((row, index) => this.toChatMessageRecord(row, index + 1));
  }

  async getMessage(messageId: string): Promise<ChatMessageRecord | null> {
    const row = this.db.prepare("SELECT * FROM daemon_messages WHERE id = ?").get(messageId) as any | undefined;
    if (!row) {
      return null;
    }
    const messages = await this.listMessages(String(row.session_id));
    return messages.find((message) => message.id === messageId) ?? null;
  }

  /**
   * Distinct project directories used by sessions, most-recent-first. Powers the
   * daemon's `project.listRecent` route (recent-projects list) in web mode.
   */
  async listRecentProjectDirs(limit = 20): Promise<Array<{ path: string; lastAccessedAt: number }>> {
    const rows = this.db
      .prepare(
        `SELECT project_dir, MAX(updated_at) AS last_accessed_at
         FROM daemon_sessions
         WHERE project_dir IS NOT NULL AND project_dir != ''
         GROUP BY project_dir
         ORDER BY last_accessed_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{ project_dir: string; last_accessed_at: number }>;
    return rows.map((r) => ({ path: r.project_dir, lastAccessedAt: r.last_accessed_at }));
  }

  async addMessage(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.ensureSessionExists(sessionId);
    this.db
      .prepare(`
      INSERT INTO daemon_messages (id, session_id, role, content, created_at, updated_at, metadata, status, is_context_edge, trace_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', 0, 0)
    `)
      .run(id, sessionId, role, content, now, now, JSON.stringify(metadata || {}));
    this.emitSessionUpdated([sessionId], "updated");
    return id;
  }

  async updateAssistantContent(messageId: string, blocks: unknown[]): Promise<void> {
    this.db
      .prepare(`UPDATE daemon_messages SET content = ?, updated_at = ? WHERE id = ? AND role = 'assistant'`)
      .run(JSON.stringify(blocks), Date.now(), messageId);
  }

  async finalizeAssistantMessage(messageId: string, blocks: unknown[], metadataJson: string): Promise<void> {
    const result = this.db
      .prepare(
        `UPDATE daemon_messages SET content = ?, status = 'sent', metadata = ?, updated_at = ? WHERE id = ? AND role = 'assistant'`,
      )
      .run(JSON.stringify(blocks), metadataJson, Date.now(), messageId);
    this.emitSessionUpdated(this.sessionIdsForMessage(messageId), "updated");
  }

  /**
   * Upsert a per-message usage stat. One row per assistant message; re-running
   * (e.g. ACP `usage_update` arriving multiple times per turn) overwrites.
   */
  upsertUsageStat(record: UsageStatRecord): void {
    this.db
      .prepare(
        `
        INSERT INTO daemon_usage_stats (
          message_id, session_id, provider_id, model_id, usage_date,
          input_tokens, cached_input_tokens, cache_write_input_tokens,
          output_tokens, reasoning_tokens, total_tokens,
          cost_usd, cost_source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(message_id) DO UPDATE SET
          provider_id = excluded.provider_id,
          model_id = excluded.model_id,
          usage_date = excluded.usage_date,
          input_tokens = excluded.input_tokens,
          cached_input_tokens = excluded.cached_input_tokens,
          cache_write_input_tokens = excluded.cache_write_input_tokens,
          output_tokens = excluded.output_tokens,
          reasoning_tokens = excluded.reasoning_tokens,
          total_tokens = excluded.total_tokens,
          cost_usd = excluded.cost_usd,
          cost_source = excluded.cost_source,
          created_at = excluded.created_at
      `,
      )
      .run(
        record.messageId,
        record.sessionId,
        record.providerId,
        record.modelId,
        record.usageDate,
        record.inputTokens,
        record.cachedInputTokens,
        record.cacheWriteInputTokens,
        record.outputTokens,
        record.reasoningTokens,
        record.totalTokens,
        record.costUsd,
        record.costSource,
        record.createdAt,
      );
  }

  /** Raw rows within a window (for aggregation). `window` selects the date cutoff. */
  getUsageStatsRows(window: UsageWindow): UsageStatRecord[] {
    const cutoff = usageWindowCutoffMs(window);
    const rows = this.db
      .prepare(
        `
        SELECT *
        FROM daemon_usage_stats
        WHERE created_at >= ?
        ORDER BY created_at ASC
      `,
      )
      .all(cutoff) as Array<{
      message_id: string;
      session_id: string;
      provider_id: string;
      model_id: string;
      usage_date: string;
      input_tokens: number;
      cached_input_tokens: number;
      cache_write_input_tokens: number;
      output_tokens: number;
      reasoning_tokens: number;
      total_tokens: number;
      cost_usd: number | null;
      cost_source: string;
      created_at: number;
    }>;
    return rows.map((row) => ({
      messageId: row.message_id,
      sessionId: row.session_id,
      providerId: row.provider_id,
      modelId: row.model_id,
      usageDate: row.usage_date,
      inputTokens: row.input_tokens,
      cachedInputTokens: row.cached_input_tokens,
      cacheWriteInputTokens: row.cache_write_input_tokens,
      outputTokens: row.output_tokens,
      reasoningTokens: row.reasoning_tokens,
      totalTokens: row.total_tokens,
      costUsd: row.cost_usd,
      costSource: row.cost_source as UsageStatRecord["costSource"],
      createdAt: row.created_at,
    }));
  }

  async setMessageError(messageId: string, blocks: unknown[], metadataJson: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE daemon_messages SET content = ?, status = 'error', metadata = ?, updated_at = ? WHERE id = ? AND role = 'assistant'`,
      )
      .run(JSON.stringify(blocks), metadataJson, Date.now(), messageId);
    this.emitSessionUpdated(this.sessionIdsForMessage(messageId), "updated");
  }

  private sessionIdsForMessage(messageId: string): string[] {
    const row = this.db.prepare(`SELECT session_id FROM daemon_messages WHERE id = ?`).get(messageId) as
      | { session_id: string }
      | undefined;
    return row ? [row.session_id] : [];
  }

  async listMessagesPage(
    sessionId: string,
    options?: {
      limit?: number;
      cursor?: MessagePageCursor | null;
    },
  ): Promise<ChatMessagePageResult> {
    const limit = Math.min(Math.max(Math.floor(options?.limit ?? 100), 1), 500);
    const messages = await this.listMessages(sessionId);
    const cursor = options?.cursor ?? null;
    const filtered = cursor
      ? messages.filter(
          (message) =>
            message.orderSeq < cursor.orderSeq || (message.orderSeq === cursor.orderSeq && message.id < cursor.id),
        )
      : messages;
    const hasMore = filtered.length > limit;
    const page = (hasMore ? filtered.slice(-limit) : filtered).sort(
      (a, b) => a.orderSeq - b.orderSeq || a.id.localeCompare(b.id),
    );
    return {
      messages: page,
      nextCursor: hasMore && page.length > 0 ? { orderSeq: page[0].orderSeq, id: page[0].id } : null,
      hasMore,
    };
  }

  async getSearchResults(messageId: string, searchId?: string): Promise<SearchResult[]> {
    const normalizedMessageId = messageId?.trim();
    if (!normalizedMessageId) {
      return [];
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM daemon_message_search_results
         WHERE message_id = ?
         ORDER BY created_at ASC, CASE WHEN rank IS NULL THEN 2147483647 ELSE rank END ASC`,
      )
      .all(normalizedMessageId) as MessageSearchResultRow[];

    const parsed: SearchResult[] = [];
    for (const row of rows) {
      try {
        const result = JSON.parse(row.content) as SearchResult;
        parsed.push({
          ...result,
          rank: typeof result.rank === "number" ? result.rank : (row.rank ?? undefined),
          searchId: result.searchId ?? row.search_id ?? undefined,
        });
      } catch {
        continue;
      }
    }

    if (searchId) {
      const filtered = parsed.filter((item) => item.searchId === searchId);
      if (filtered.length > 0) {
        return filtered;
      }
      const legacy = parsed.filter((item) => !item.searchId);
      if (legacy.length > 0) {
        return legacy;
      }
    }

    return parsed;
  }

  async listMessageTraces(messageId: string): Promise<MessageTraceRecord[]> {
    const normalizedMessageId = messageId?.trim();
    if (!normalizedMessageId) {
      return [];
    }

    const rows = this.db
      .prepare("SELECT * FROM daemon_message_traces WHERE message_id = ? ORDER BY request_seq DESC")
      .all(normalizedMessageId) as MessageTraceRow[];

    return rows.map((row) => ({
      id: row.id,
      messageId: row.message_id,
      sessionId: row.session_id,
      providerId: row.provider_id,
      modelId: row.model_id,
      requestSeq: row.request_seq,
      endpoint: row.endpoint,
      headersJson: row.headers_json,
      bodyJson: row.body_json,
      truncated: row.truncated === 1,
      createdAt: row.created_at,
    }));
  }

  async getViewManifests(sessionId: string): Promise<ArgosTapeViewManifestRecord[]> {
    const normalizedSessionId = sessionId?.trim();
    if (!normalizedSessionId) {
      return [];
    }

    const rows = this.db
      .prepare("SELECT * FROM daemon_tape_entries WHERE session_id = ? ORDER BY entry_id ASC")
      .all(normalizedSessionId) as TapeEntryRow[];
    const records: ArgosTapeViewManifestRecord[] = [];

    for (const row of rows) {
      if (row.kind !== "event" || row.name !== "tape/view-manifest") {
        continue;
      }

      try {
        const payload = JSON.parse(row.payload_json) as { data?: { manifest?: unknown } };
        const manifest = payload.data?.manifest as Record<string, unknown> | undefined;
        if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
          continue;
        }
        if (typeof manifest.messageId !== "string" || typeof manifest.requestSeq !== "number") {
          continue;
        }
        const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
        records.push({
          sessionId: row.session_id,
          messageId: manifest.messageId,
          requestSeq: manifest.requestSeq,
          entryId: row.entry_id,
          createdAt: row.created_at,
          manifest: manifest as unknown as ArgosTapeViewManifest,
          integrity:
            typeof meta.integrity === "string" ? (meta.integrity as "valid" | "invalid" | "unverified") : "unverified",
        });
      } catch {
        continue;
      }
    }

    return records;
  }

  async getViewLineage(sessionId: string): Promise<ArgosTapeViewManifestRecord[]> {
    const records = await this.getViewManifests(sessionId);
    return records
      .slice()
      .sort((a, b) => (a.manifest.assembledAt ?? a.createdAt) - (b.manifest.assembledAt ?? b.createdAt));
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
      status: coerceSessionStatus(row.status),
      providerId: row.provider_id || "",
      modelId: row.model_id || "",
    };
  }

  private toSessionListItem(row: any) {
    const session = this.toSessionWithState(row);
    const { providerId: _providerId, modelId: _modelId, ...item } = session;
    return item;
  }

  private toChatMessageRecord(row: any, orderSeq: number): ChatMessageRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      orderSeq,
      role: row.role,
      content: coerceMessageContent(row.role, row.content),
      status: row.status === "success" ? "sent" : row.status || "sent",
      isContextEdge: Number(row.is_context_edge ?? 0),
      metadata: row.metadata ?? "{}",
      traceCount: Number(row.trace_count ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseMetadata(metadata: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private getSessionMetadata(sessionId: string): DaemonSessionMetadata {
    const row = this.db.prepare("SELECT metadata FROM daemon_sessions WHERE id = ?").get(sessionId) as
      | { metadata?: string | null }
      | undefined;
    if (!row?.metadata) {
      return {};
    }
    try {
      const parsed = JSON.parse(row.metadata) as DaemonSessionMetadata;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private updateSessionMetadata(
    sessionId: string,
    updater: (metadata: DaemonSessionMetadata) => DaemonSessionMetadata,
  ): void {
    this.ensureSessionExists(sessionId);
    const current = this.getSessionMetadata(sessionId);
    const next = updater(current);
    this.db
      .prepare("UPDATE daemon_sessions SET metadata = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(next), Date.now(), sessionId);
    this.emitSessionUpdated([sessionId], "updated");
  }

  private buildDefaultGenerationSettings(): SessionGenerationSettings {
    return {
      systemPrompt: "",
      temperature: 0.7,
      contextLength: 32000,
      maxTokens: 8000,
      timeout: 300000,
    };
  }

  private normalizeGenerationSettings(settings: Partial<SessionGenerationSettings> | null): SessionGenerationSettings {
    const base = this.buildDefaultGenerationSettings();
    if (!settings) {
      return base;
    }
    return {
      ...base,
      ...settings,
      systemPrompt: typeof settings.systemPrompt === "string" ? settings.systemPrompt : base.systemPrompt,
      temperature: typeof settings.temperature === "number" ? settings.temperature : base.temperature,
      contextLength: typeof settings.contextLength === "number" ? settings.contextLength : base.contextLength,
      maxTokens: typeof settings.maxTokens === "number" ? settings.maxTokens : base.maxTokens,
      timeout: typeof settings.timeout === "number" ? settings.timeout : base.timeout,
    };
  }

  private async requireMessage(sessionId: string, messageId: string): Promise<ChatMessageRecord> {
    const message = await this.getMessage(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    if (message.sessionId !== sessionId) {
      throw new Error(`Message ${messageId} does not belong to session ${sessionId}`);
    }
    return message;
  }

  private async getLastUserMessageBeforeOrAt(sessionId: string, orderSeq: number): Promise<ChatMessageRecord | null> {
    const messages = await this.listMessages(sessionId);
    return (
      messages
        .filter((message) => message.role === "user" && message.orderSeq <= orderSeq)
        .sort((a, b) => b.orderSeq - a.orderSeq)[0] ?? null
    );
  }

  private deleteMessagesFromOrderSeq(sessionId: string, orderSeq: number): void {
    const messages = this.db
      .prepare("SELECT * FROM daemon_messages WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as any[];
    const sorted = messages.sort((a, b) => a.created_at - b.created_at || String(a.id).localeCompare(String(b.id)));
    const ids = sorted.slice(Math.max(orderSeq - 1, 0)).map((row) => row.id);
    for (const id of ids) {
      this.db.prepare("DELETE FROM daemon_messages WHERE id = ?").run(id);
    }
  }
}
