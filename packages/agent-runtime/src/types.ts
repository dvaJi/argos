import type { Agent, AgentAvatar, ArgosAgentConfig } from "@shared/types/agent-interface";

/**
 * Canonical Argos-agent row shape. Mirrors the desktop `agents` SQLite table
 * columns used by Argos agents. Storage adapters map to/from this shape.
 */
export interface ArgosAgentRow {
  id: string;
  source: "builtin" | "manual";
  name: string;
  enabled: boolean;
  protected: boolean;
  description: string | null;
  icon: string | null;
  avatar_json: string | null;
  config_json: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Storage port for Argos-agent persistence. Host-agnostic: the daemon injects a
 * SQLite-backed implementation; tests inject an in-memory fake.
 *
 * Rows are always Argos agents (`agent_type='argos'`); adapters enforce that
 * scoping so callers cannot mutate ACP rows.
 */
export interface ArgosAgentStore {
  list(filters?: { enabled?: boolean }): ArgosAgentRow[];
  get(id: string): ArgosAgentRow | undefined;
  insert(row: ArgosAgentRow): void;
  upsert(row: ArgosAgentRow): void;
  update(id: string, fields: Partial<Omit<ArgosAgentRow, "id" | "created_at">>): void;
  delete(id: string): void;
}

/**
 * Used by {@link ArgosAgentRuntime.deleteArgosAgent} to enforce the "no sessions
 * attached" guard. The daemon implementation queries its `new_sessions` table.
 */
export interface AgentSessionLookupPort {
  hasAgentSessions(agentId: string): boolean;
}

export interface EnsureBuiltinArgosAgentDefaults {
  name?: string;
  icon?: string | null;
  avatar?: AgentAvatar | null;
  config?: ArgosAgentConfig | null;
}

/** Minimal SQLite-like statement surface the SQLite adapter depends on. */
export interface SqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number };
}

/** Minimal database surface the SQLite adapter depends on (host-injected). */
export interface SqliteLikeDb {
  prepare(sql: string): SqliteStatement;
  exec?(sql: string): void;
}

export const parseJson = <T>(raw?: string | null): T | null => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const stringifyJson = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
};

export const sanitizeString = (value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Maps a stored {@link ArgosAgentRow} to the renderer-facing {@link Agent}
 * contract. Argos agents never carry ACP install state here.
 */
export const toAgent = (row: ArgosAgentRow): Agent => ({
  id: row.id,
  name: row.name,
  type: "argos",
  agentType: "argos",
  enabled: row.enabled,
  protected: row.protected,
  icon: row.icon ?? undefined,
  description: row.description ?? undefined,
  source: row.source,
  avatar: parseJson<AgentAvatar>(row.avatar_json),
  config: parseJson<ArgosAgentConfig>(row.config_json),
  installState: null,
});
