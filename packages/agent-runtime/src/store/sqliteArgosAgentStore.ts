import type { ArgosAgentRow, SqliteLikeDb } from "../types";

const SELECT_COLUMNS = `
  id, source, name, enabled, protected, description, icon,
  avatar_json, config_json, created_at, updated_at
`;

const mapRow = (row: Record<string, unknown>): ArgosAgentRow => ({
  id: String(row.id),
  source: row.source === "builtin" ? "builtin" : "manual",
  name: String(row.name ?? ""),
  enabled: Number(row.enabled) !== 0,
  protected: Number(row.protected) !== 0,
  description: row.description == null ? null : String(row.description),
  icon: row.icon == null ? null : String(row.icon),
  avatar_json: row.avatar_json == null ? null : String(row.avatar_json),
  config_json: row.config_json == null ? null : String(row.config_json),
  created_at: Number(row.created_at),
  updated_at: Number(row.updated_at),
});

/**
 * SQLite-backed {@link ArgosAgentStore}. Targets the host-injected minimal
 * `prepare/get/all/run` surface (Bun `bun:sqlite` on the daemon). All statements
 * are scoped to `agent_type='argos'` so ACP rows in the same `agents` table can
 * never be read or mutated through this adapter.
 *
 * The host is responsible for ensuring the `agents` table has the full column
 * set (the daemon does this via its schema migration).
 */
export class SqliteArgosAgentStore {
  constructor(private readonly db: SqliteLikeDb) {}

  list(filters?: { enabled?: boolean }): ArgosAgentRow[] {
    const conditions = ["agent_type = ?"];
    const params: unknown[] = ["argos"];
    if (typeof filters?.enabled === "boolean") {
      conditions.push("enabled = ?");
      params.push(filters.enabled ? 1 : 0);
    }
    const sql = `SELECT ${SELECT_COLUMNS} FROM agents WHERE ${conditions.join(" AND ")}
      ORDER BY protected DESC, updated_at DESC, created_at ASC`;
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(mapRow);
  }

  get(id: string): ArgosAgentRow | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM agents WHERE id = ? AND agent_type = ?`)
      .get(id, "argos") as Record<string, unknown> | undefined;
    return row ? mapRow(row) : undefined;
  }

  insert(row: ArgosAgentRow): void {
    this.db
      .prepare(
        `INSERT INTO agents (
          id, agent_type, source, name, enabled, protected,
          description, icon, avatar_json, config_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        "argos",
        row.source,
        row.name,
        row.enabled ? 1 : 0,
        row.protected ? 1 : 0,
        row.description,
        row.icon,
        row.avatar_json,
        row.config_json,
        row.created_at,
        row.updated_at,
      );
  }

  upsert(row: ArgosAgentRow): void {
    this.db
      .prepare(
        `INSERT INTO agents (
          id, agent_type, source, name, enabled, protected,
          description, icon, avatar_json, config_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          agent_type = excluded.agent_type,
          source = excluded.source,
          name = excluded.name,
          enabled = excluded.enabled,
          protected = excluded.protected,
          description = excluded.description,
          icon = excluded.icon,
          avatar_json = excluded.avatar_json,
          config_json = excluded.config_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        row.id,
        "argos",
        row.source,
        row.name,
        row.enabled ? 1 : 0,
        row.protected ? 1 : 0,
        row.description,
        row.icon,
        row.avatar_json,
        row.config_json,
        row.created_at,
        row.updated_at,
      );
  }

  update(id: string, fields: Partial<Omit<ArgosAgentRow, "id" | "created_at">>): void {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (Object.prototype.hasOwnProperty.call(fields, "source")) {
      sets.push("source = ?");
      params.push(fields.source);
    }
    if (Object.prototype.hasOwnProperty.call(fields, "name")) {
      sets.push("name = ?");
      params.push(fields.name);
    }
    if (Object.prototype.hasOwnProperty.call(fields, "enabled")) {
      sets.push("enabled = ?");
      params.push(fields.enabled ? 1 : 0);
    }
    if (Object.prototype.hasOwnProperty.call(fields, "protected")) {
      sets.push("protected = ?");
      params.push(fields.protected ? 1 : 0);
    }
    if (Object.prototype.hasOwnProperty.call(fields, "description")) {
      sets.push("description = ?");
      params.push(fields.description ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(fields, "icon")) {
      sets.push("icon = ?");
      params.push(fields.icon ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(fields, "avatar_json")) {
      sets.push("avatar_json = ?");
      params.push(fields.avatar_json ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(fields, "config_json")) {
      sets.push("config_json = ?");
      params.push(fields.config_json ?? null);
    }

    if (sets.length === 0) {
      return;
    }

    sets.push("updated_at = ?");
    params.push(Date.now());
    params.push(id);

    this.db.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ? AND agent_type = ?`).run(...params, "argos");
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM agents WHERE id = ? AND agent_type = ?`).run(id, "argos");
  }
}
