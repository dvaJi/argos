import { describe, expect, it, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { BunSessionRepository } from "../src/host/bun-session-repository";

/** Thread archive (docs/features/thread-archive): archived_at column, setArchived, filtered paging. */
describe("session archive", () => {
  let db: Database;
  let repo: BunSessionRepository;

  function seed(id: string, updatedAt: number): void {
    db.run(
      `INSERT INTO daemon_sessions (id, agent_id, title, status, created_at, updated_at)
       VALUES (?, 'argos', ?, 'idle', ?, ?)`,
      [id, `Title ${id}`, updatedAt, updatedAt],
    );
  }

  function archiveAt(id: string, at: number): void {
    db.run("UPDATE daemon_sessions SET archived_at = ? WHERE id = ?", [at, id]);
  }

  beforeEach(() => {
    db = new Database(":memory:");
    repo = new BunSessionRepository(db as never);
  });

  it("migrates a pre-archive database by adding archived_at", () => {
    const legacy = new Database(":memory:");
    legacy.exec(`
      CREATE TABLE daemon_sessions (
        id TEXT PRIMARY KEY, agent_id TEXT NOT NULL DEFAULT 'argos', title TEXT NOT NULL DEFAULT '',
        project_dir TEXT, is_pinned INTEGER NOT NULL DEFAULT 0, is_draft INTEGER NOT NULL DEFAULT 0,
        session_kind TEXT NOT NULL DEFAULT 'chat', parent_session_id TEXT, subagent_enabled INTEGER NOT NULL DEFAULT 1,
        provider_id TEXT DEFAULT '', model_id TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'idle',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )
    `);
    legacy.run("INSERT INTO daemon_sessions (id, provider_id, created_at, updated_at) VALUES ('old', 'acp', 1, 1)");
    new BunSessionRepository(legacy as never);
    const columns = (legacy.prepare("PRAGMA table_info(daemon_sessions)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    );
    expect(columns).toContain("archived_at");
    const row = legacy.prepare("SELECT archived_at FROM daemon_sessions WHERE id = 'old'").get() as {
      archived_at: number | null;
    };
    expect(row.archived_at).toBeNull();
  });

  it("archives and restores without bumping updated_at", async () => {
    seed("a", 100);
    await repo.setArchived("a", true);
    const archived = await repo.get("a");
    expect(typeof archived?.archivedAt).toBe("number");
    expect(archived?.updatedAt).toBe(100);
    await repo.setArchived("a", false);
    expect((await repo.get("a"))?.archivedAt).toBeNull();
  });

  it("list includes archived by default; listPage excludes them", async () => {
    seed("live", 200);
    seed("gone", 100);
    archiveAt("gone", 300);
    expect((await repo.list()).map((s) => s.id).sort()).toEqual(["gone", "live"]);
    const page = await repo.listPage();
    expect(page.records.map((s) => s.id)).toEqual(["live"]);
  });

  it("pages archived sessions by archive time without skipping or duplicating", async () => {
    for (const [id, at] of [
      ["a", 500],
      ["b", 400],
      ["c", 400],
      ["d", 100],
    ] as const) {
      seed(id, 1000 - at);
      archiveAt(id, at);
    }
    seed("live", 50);
    const first = await repo.listPage({ archived: "only", limit: 2 });
    expect(first.records.map((s) => s.id)).toEqual(["a", "c"]);
    expect(first.hasMore).toBe(true);
    const second = await repo.listPage({ archived: "only", limit: 2, cursor: first.nextCursor });
    expect(second.records.map((s) => s.id)).toEqual(["b", "d"]);
    expect(second.hasMore).toBe(false);
  });
});
