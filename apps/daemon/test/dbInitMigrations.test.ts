import { describe, expect, it } from "vitest";
import { runMigrations } from "../src/host/db-init";

/**
 * Fake of the Bun sqlite surface that `runMigrations` uses. It emulates table
 * columns + indexes so we can prove the additive migrations work without needing
 * the native bun:sqlite addon under vitest.
 */
function makeLegacyDb() {
  const columns = new Map<string, Set<string>>();
  columns.set("agents", new Set(["id", "name", "agent_type", "config", "created_at", "updated_at"]));
  // Legacy settings_activity had the simple key/value/timestamp shape.
  columns.set("settings_activity", new Set(["id", "key", "old_value", "new_value", "timestamp"]));
  columns.set("schema_versions", new Set(["version", "applied_at"]));
  const indexes = new Set<string>();
  const alteredRows: { table: string; column: string }[] = [];
  const droppedTables = new Set<string>();
  const renamedTables: { from: string; to: string }[] = [];

  const db = {
    exec(sql: string): void {
      const normalized = sql.trim();
      const indexMatch = normalized.match(/CREATE INDEX IF NOT EXISTS (\w+)/i);
      if (indexMatch) {
        indexes.add(indexMatch[1]);
        return;
      }
      const dropIndexMatch = normalized.match(/DROP INDEX IF EXISTS (\w+)/i);
      if (dropIndexMatch) {
        indexes.delete(dropIndexMatch[1]);
        return;
      }
      const alterMatch = normalized.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
      if (alterMatch) {
        const [, table, column] = alterMatch;
        const set = columns.get(table);
        if (set && !set.has(column)) {
          set.add(column);
          alteredRows.push({ table, column });
        }
        return;
      }
      const renameMatch = normalized.match(/ALTER TABLE (\w+) RENAME TO (\w+)/i);
      if (renameMatch) {
        const [, from, to] = renameMatch;
        const cols = columns.get(from);
        if (cols) {
          columns.delete(from);
          columns.set(to, cols);
          renamedTables.push({ from, to });
        }
        return;
      }
      const dropTableMatch = normalized.match(/DROP TABLE (\w+)/i);
      if (dropTableMatch) {
        droppedTables.add(dropTableMatch[1]);
        return;
      }
      // CREATE TABLE / INSERT — ignore for this fake.
    },
    query<T>(_sql: string): { all(): T[] } {
      const pragmaMatch = _sql.match(/PRAGMA table_info\((\w+)\)/i);
      if (pragmaMatch) {
        const cols = columns.get(pragmaMatch[1]);
        const rows = cols ? Array.from(cols).map((name) => ({ name })) : [];
        return { all: () => rows as unknown as T[] };
      }
      return { all: () => [] as T[] };
    },
    _indexes: indexes,
    _columns: columns,
    _alteredRows: alteredRows,
    _droppedTables: droppedTables,
    _renamedTables: renamedTables,
  };
  return db;
}

describe("db-init runMigrations (v2: agents table expansion)", () => {
  it("adds all missing columns to a legacy agents table", () => {
    const db = makeLegacyDb();
    runMigrations(db as never, 1);

    const agentsCols = db._columns.get("agents")!;
    for (const col of [
      "source",
      "enabled",
      "protected",
      "description",
      "icon",
      "avatar_json",
      "config_json",
      "state_json",
    ]) {
      expect(agentsCols.has(col)).toBe(true);
    }
  });

  it("creates the agent type/enabled indexes", () => {
    const db = makeLegacyDb();
    runMigrations(db as never, 1);
    expect(db._indexes.has("idx_agents_type")).toBe(true);
    expect(db._indexes.has("idx_agents_enabled")).toBe(true);
  });

  it("is idempotent: re-running adds no columns twice", () => {
    const db = makeLegacyDb();
    runMigrations(db as never, 1);
    const firstCount = db._alteredRows.length;
    runMigrations(db as never, 1);
    expect(db._alteredRows.length).toBe(firstCount);
  });
});

describe("db-init runMigrations (v3: settings_activity rebuild)", () => {
  it("rebuilds a legacy settings_activity table (key/value/timestamp) to the rich schema", () => {
    const db = makeLegacyDb();
    runMigrations(db as never, 2);

    // Legacy table was renamed then dropped.
    expect(db._droppedTables.has("settings_activity_legacy")).toBe(true);
    // Rich-schema indexes are created.
    expect(db._indexes.has("idx_settings_activity_category")).toBe(true);
    expect(db._indexes.has("idx_settings_activity_created")).toBe(true);
    // Stale legacy index removed.
    expect(db._indexes.has("idx_settings_activity_key")).toBe(false);
  });

  it("skips the rebuild when settings_activity already has the rich schema", () => {
    const db = makeLegacyDb();
    const rich = db._columns.get("settings_activity")!;
    rich.clear();
    [
      "id",
      "category",
      "action",
      "target_type",
      "target_id",
      "target_label",
      "route_name",
      "route_params_json",
      "summary_key",
      "summary_params_json",
      "created_at",
    ].forEach((c) => rich.add(c));

    runMigrations(db as never, 2);

    expect(db._droppedTables.has("settings_activity_legacy")).toBe(false);
    expect(db._indexes.has("idx_settings_activity_category")).toBe(true);
  });

  it("does nothing when already at the target version", () => {
    const db = makeLegacyDb();
    runMigrations(db as never, 3);
    expect(db._alteredRows.length).toBe(0);
    expect(db._renamedTables.length).toBe(0);
  });
});
