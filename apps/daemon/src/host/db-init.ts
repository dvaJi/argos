import { logger } from "../logging";

type BunDatabase = {
  exec(sql: string): void;
  query<T = unknown>(
    sql: string,
  ): {
    get(...params: unknown[]): T | null | undefined;
    all(...params: unknown[]): T[];
    run(...params: unknown[]): { changes: number };
  };
  close(): void;
};

const CORE_TABLES = [
  `CREATE TABLE IF NOT EXISTS schema_versions (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS argos_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL DEFAULT 'argos',
    agent_type TEXT NOT NULL DEFAULT 'argos',
    project_dir TEXT,
    model_id TEXT,
    provider_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    parent_session_id TEXT,
    metadata TEXT DEFAULT '{}'
  )`,

  `CREATE TABLE IF NOT EXISTS argos_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES argos_sessions(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS argos_user_messages (
    message_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    content TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES argos_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES argos_sessions(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS argos_assistant_blocks (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    block_type TEXT NOT NULL,
    content TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    ordinal INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (message_id) REFERENCES argos_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES argos_sessions(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS new_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL DEFAULT 'argos',
    model_id TEXT,
    provider_id TEXT,
    project_dir TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    endpoint_type TEXT NOT NULL DEFAULT 'openai',
    api_key TEXT,
    base_url TEXT,
    config TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS provider_models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    name TEXT NOT NULL,
    config TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS model_configs (
    model_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    config TEXT DEFAULT '{}',
    source TEXT DEFAULT 'user',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (model_id, provider_id)
  )`,

  `CREATE TABLE IF NOT EXISTS model_status (
    model_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (model_id, provider_id)
  )`,

  `CREATE TABLE IF NOT EXISTS mcp_servers (
    name TEXT PRIMARY KEY,
    config TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    agent_type TEXT NOT NULL DEFAULT 'argos',
    config TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS settings_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    timestamp INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS auth_pairing_tokens (
    token_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    issued_by TEXT NOT NULL DEFAULT 'cli'
  )`,

  `CREATE TABLE IF NOT EXISTS acp_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    session_id TEXT,
    workdir TEXT,
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'active', 'error')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    metadata TEXT,
    UNIQUE(conversation_id, agent_id),
    UNIQUE(agent_id, session_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_acp_sessions_session_id ON acp_sessions(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_acp_sessions_agent ON acp_sessions(agent_id)`,

  `CREATE TABLE IF NOT EXISTS agent_memory (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_kind ON agent_memory(agent_id, kind, status)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_active ON agent_memory(agent_id, superseded_by)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memory_provenance ON agent_memory(agent_id, provenance_key) WHERE provenance_key IS NOT NULL`,

  `CREATE VIRTUAL TABLE IF NOT EXISTS agent_memory_fts USING fts5(content, agent_id UNINDEXED, content='agent_memory', content_rowid='rowid', tokenize='unicode61')`,
  `CREATE TRIGGER IF NOT EXISTS agent_memory_fts_ai AFTER INSERT ON agent_memory BEGIN INSERT INTO agent_memory_fts(rowid, content, agent_id) VALUES (new.rowid, new.content, new.agent_id); END`,
  `CREATE TRIGGER IF NOT EXISTS agent_memory_fts_ad AFTER DELETE ON agent_memory BEGIN INSERT INTO agent_memory_fts(agent_memory_fts, rowid, content, agent_id) VALUES ('delete', old.rowid, old.content, old.agent_id); END`,
  `CREATE TRIGGER IF NOT EXISTS agent_memory_fts_au AFTER UPDATE OF content ON agent_memory BEGIN INSERT INTO agent_memory_fts(agent_memory_fts, rowid, content, agent_id) VALUES ('delete', old.rowid, old.content, old.agent_id); INSERT INTO agent_memory_fts(rowid, content, agent_id) VALUES (new.rowid, new.content, new.agent_id); END`,
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_argos_messages_session ON argos_messages(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_argos_messages_role ON argos_messages(role)`,
  `CREATE INDEX IF NOT EXISTS idx_argos_user_messages_session ON argos_user_messages(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_argos_assistant_blocks_session ON argos_assistant_blocks(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_argos_assistant_blocks_message ON argos_assistant_blocks(message_id)`,
  `CREATE INDEX IF NOT EXISTS idx_new_sessions_agent ON new_sessions(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_provider_models_provider ON provider_models(provider_id)`,
  `CREATE INDEX IF NOT EXISTS idx_model_configs_provider ON model_configs(provider_id)`,
  `CREATE INDEX IF NOT EXISTS idx_model_status_provider ON model_status(provider_id)`,
  `CREATE INDEX IF NOT EXISTS idx_settings_activity_key ON settings_activity(key)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_kind ON auth_sessions(kind)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at)`,
];

const CURRENT_SCHEMA_VERSION = 1;

export async function initializeDatabase(dbPath: string): Promise<any> {
  logger.info(`[db] Opening database at ${dbPath}`);

  const { Database } = await import("bun:sqlite");
  const db = new Database(dbPath);

  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");

    logger.info("[db] Running schema creation...");
    for (const sql of CORE_TABLES) {
      db.exec(sql);
    }

    logger.info("[db] Creating indexes...");
    for (const sql of INDEXES) {
      db.exec(sql);
    }

    const currentVersion = getSchemaVersion(db as any);
    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      logger.info(`[db] Migrating schema from v${currentVersion} to v${CURRENT_SCHEMA_VERSION}`);
      runMigrations(db as any, currentVersion);
      setSchemaVersion(db as any, CURRENT_SCHEMA_VERSION);
    }

    logger.info("[db] Database initialized successfully");
    return db;
  } catch (error) {
    logger.error("[db] Database initialization failed, attempting recovery...");
    try {
      db.close();
    } catch {
      // ignore close errors during recovery
    }

    logger.info("[db] Attempting schema repair...");
    try {
      const repairDb = new Database(dbPath);
      repairDb.exec("PRAGMA journal_mode = WAL");

      for (const sql of CORE_TABLES) {
        try {
          repairDb.exec(sql);
        } catch {
          // table may already exist or have different schema
        }
      }

      for (const sql of INDEXES) {
        try {
          repairDb.exec(sql);
        } catch {
          // index may already exist
        }
      }

      logger.info("[db] Schema repair completed");
      return repairDb;
    } catch (repairError) {
      logger.error("[db] Schema repair failed:", repairError);
      throw error;
    }
  }
}

function getSchemaVersion(db: BunDatabase): number {
  try {
    const result = db
      .query<{ version: number }>("SELECT version FROM schema_versions ORDER BY version DESC LIMIT 1")
      .get();
    return result?.version ?? 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(db: BunDatabase, version: number): void {
  db.exec(`INSERT OR REPLACE INTO schema_versions (version, applied_at) VALUES (${version}, ${Date.now()})`);
}

function runMigrations(_db: BunDatabase, _currentVersion: number): void {
  // Future migrations go here
  // Example:
  // if (currentVersion < 2) {
  //   db.exec("ALTER TABLE argos_sessions ADD COLUMN priority INTEGER DEFAULT 0");
  // }
}
