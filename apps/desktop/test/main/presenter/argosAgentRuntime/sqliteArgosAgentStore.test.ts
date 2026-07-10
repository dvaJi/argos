import { describe, expect, it } from "vitest";
import { SqliteArgosAgentStore } from "@argos/agent-runtime";

const sqliteModule = await import("better-sqlite3-multiple-ciphers").catch(() => null);
const Database = sqliteModule?.default;

let sqliteAvailable = false;
if (Database) {
  try {
    const smokeDb = new Database(":memory:");
    smokeDb.close();
    sqliteAvailable = true;
  } catch {
    sqliteAvailable = false;
  }
}

const itWithSqlite = sqliteAvailable ? it : it.skip;

const CREATE_TABLE_SQL = `
  CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL DEFAULT 'argos',
    source TEXT NOT NULL DEFAULT 'manual',
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    protected INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    icon TEXT,
    avatar_json TEXT,
    config_json TEXT,
    state_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

const makeDb = (): any => {
  const db = new Database(":memory:");
  db.exec(CREATE_TABLE_SQL);
  return db;
};

describe("SqliteArgosAgentStore", () => {
  itWithSqlite("seeds and reads back the builtin agent", () => {
    const store = new SqliteArgosAgentStore(makeDb());
    const now = Date.now();
    store.insert({
      id: "argos",
      source: "builtin",
      name: "Argos",
      enabled: true,
      protected: true,
      description: null,
      icon: null,
      avatar_json: null,
      config_json: null,
      created_at: now,
      updated_at: now,
    });

    const agents = store.list();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ id: "argos", source: "builtin", protected: true, enabled: true });
  });

  itWithSqlite("ignores ACP rows in the same table", () => {
    const db = makeDb();
    db.prepare(
      `INSERT INTO agents (id, agent_type, source, name, enabled, protected, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("acp-1", "acp", "registry", "ACP Agent", 1, 0, Date.now(), Date.now());

    const store = new SqliteArgosAgentStore(db);
    expect(store.list()).toHaveLength(0);
    expect(store.get("acp-1")).toBeUndefined();
  });

  itWithSqlite("upserts and updates fields", () => {
    const store = new SqliteArgosAgentStore(makeDb());
    const now = Date.now();
    store.upsert({
      id: "argos-1",
      source: "manual",
      name: "First",
      enabled: true,
      protected: false,
      description: null,
      icon: null,
      avatar_json: null,
      config_json: null,
      created_at: now,
      updated_at: now,
    });
    store.upsert({
      id: "argos-1",
      source: "manual",
      name: "Second",
      enabled: false,
      protected: false,
      description: "d",
      icon: null,
      avatar_json: null,
      config_json: null,
      created_at: now,
      updated_at: now,
    });
    expect(store.get("argos-1")?.name).toBe("Second");

    store.update("argos-1", { enabled: true, config_json: JSON.stringify({ systemPrompt: "hi" }) });
    const row = store.get("argos-1");
    expect(row?.enabled).toBe(true);
    expect(JSON.parse(row?.config_json ?? "null")).toEqual({ systemPrompt: "hi" });
  });

  itWithSqlite("deletes only the targeted argos row", () => {
    const store = new SqliteArgosAgentStore(makeDb());
    const now = Date.now();
    const base = {
      source: "manual" as const,
      enabled: true,
      protected: false,
      description: null,
      icon: null,
      avatar_json: null,
      config_json: null,
      created_at: now,
      updated_at: now,
    };
    store.insert({ ...base, id: "argos-1", name: "A" });
    store.insert({ ...base, id: "argos-2", name: "B" });

    store.delete("argos-1");
    expect(store.list()).toHaveLength(1);
    expect(store.get("argos-1")).toBeUndefined();
    expect(store.get("argos-2")).toBeDefined();
  });

  itWithSqlite("filters by enabled", () => {
    const store = new SqliteArgosAgentStore(makeDb());
    const now = Date.now();
    const base = {
      source: "manual" as const,
      protected: false,
      description: null,
      icon: null,
      avatar_json: null,
      config_json: null,
      created_at: now,
      updated_at: now,
    };
    store.insert({ ...base, id: "argos-on", name: "On", enabled: true });
    store.insert({ ...base, id: "argos-off", name: "Off", enabled: false });

    expect(store.list({ enabled: true }).map((r) => r.id)).toEqual(["argos-on"]);
    expect(store.list({ enabled: false }).map((r) => r.id)).toEqual(["argos-off"]);
  });
});
