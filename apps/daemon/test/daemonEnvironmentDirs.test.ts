import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { BunSessionRepository } from "../src/host/bun-session-repository";

function createRepo() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE daemon_sessions (
      id TEXT PRIMARY KEY, agent_id TEXT, title TEXT, project_dir TEXT,
      permission_mode TEXT, is_pinned INTEGER, is_draft INTEGER, session_kind TEXT,
      parent_session_id TEXT, subagent_enabled INTEGER, provider_id TEXT, model_id TEXT,
      status TEXT, created_at INTEGER, updated_at INTEGER, metadata TEXT
    );
    CREATE TABLE acp_sessions (
      id TEXT PRIMARY KEY, conversation_id TEXT, agent_id TEXT, session_id TEXT,
      workdir TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, metadata TEXT
    );
  `);
  const eventPublisher = {
    publish: () => undefined,
    subscribe: () => () => undefined,
  };
  return { db, repo: new BunSessionRepository(db as any, eventPublisher as any) };
}

describe("BunSessionRepository.listEnvironmentDirs", () => {
  it("aggregates project_dir of committed sessions, most-recent first", async () => {
    const { db, repo } = createRepo();
    const insert = db.prepare(
      `INSERT INTO daemon_sessions
       (id, agent_id, title, project_dir, permission_mode, is_pinned, is_draft, session_kind,
        parent_session_id, subagent_enabled, provider_id, model_id, status, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, 'default', 0, 0, 'regular', NULL, 1, 'deepseek', 'deepseek-chat', 'idle', ?, ?, '{}')`,
    );

    insert.run("s1", "argos", "One", "/repos/a", 100, 300);
    insert.run("s2", "argos", "Two", "/repos/a", 150, 400);
    insert.run("s3", "argos", "Three", "/repos/b", 200, 500);

    const dirs = await repo.listEnvironmentDirs();

    expect(dirs).toEqual([
      { path: "/repos/b", sessionCount: 1, lastUsedAt: 500 },
      { path: "/repos/a", sessionCount: 2, lastUsedAt: 400 },
    ]);
  });

  it("excludes draft sessions and falls back to acp workdir when project_dir is empty", async () => {
    const { db, repo } = createRepo();
    const insertSession = db.prepare(
      `INSERT INTO daemon_sessions
       (id, agent_id, title, project_dir, permission_mode, is_pinned, is_draft, session_kind,
        parent_session_id, subagent_enabled, provider_id, model_id, status, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, 'default', 0, ?, 'regular', NULL, 1, 'acp', ?, 'active', ?, ?, '{}')`,
    );
    const insertAcp = db.prepare(
      `INSERT INTO acp_sessions
       (id, conversation_id, agent_id, session_id, workdir, status, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, '{}')`,
    );

    // Draft session: must not contribute.
    insertSession.run("draft-1", "argos", "Draft", "/repos/draft", 1, "acp-agent", 900, 950);
    // Committed session with a project_dir.
    insertSession.run("s1", "argos", "One", "/repos/a", 0, "argos", 100, 300);
    // Committed session without a project_dir -> uses acp workdir.
    insertSession.run("s2", "acp-1", "Two", null, 0, "acp-1", 150, 400);
    insertAcp.run("acp-1-a", "s2", "acp-1", "acp-session-1", "/repos/workdir-b", 150, 380);

    const dirs = await repo.listEnvironmentDirs();

    expect(dirs.map((d) => d.path).sort()).toEqual(["/repos/a", "/repos/workdir-b"]);
    const workdirEntry = dirs.find((d) => d.path === "/repos/workdir-b");
    expect(workdirEntry).toEqual({ path: "/repos/workdir-b", sessionCount: 1, lastUsedAt: 400 });
  });

  it("returns an empty list when there are no committed sessions", async () => {
    const { repo } = createRepo();
    expect(await repo.listEnvironmentDirs()).toEqual([]);
  });
});
