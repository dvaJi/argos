import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { isProjectPathWithin, normalizeProjectKey } from "@argos/shared/projectKey";
import { BunSessionRepository } from "../src/host/bun-session-repository";
import { DaemonWorkspacePresenter } from "../src/workspace/daemonWorkspacePresenter";

/** Project settings + checkout description (docs/features/project-settings). */

const execFileAsync = promisify(execFile);
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Argos Test",
  GIT_AUTHOR_EMAIL: "test@argos.local",
  GIT_COMMITTER_NAME: "Argos Test",
  GIT_COMMITTER_EMAIL: "test@argos.local",
};
const git = async (cwd: string, args: string[]) =>
  (await execFileAsync("git", args, { cwd, env: GIT_ENV, windowsHide: true })).stdout.trim();

describe("normalizeProjectKey", () => {
  test("is separator-, trailing-slash- and (Windows) case-insensitive", () => {
    expect(normalizeProjectKey("C:\\Repo\\")).toBe(normalizeProjectKey("c:/repo"));
    expect(normalizeProjectKey("C:\\Repo\\sub")).toBe("c:/repo/sub");
    expect(normalizeProjectKey("/home/Me/Repo/")).toBe("/home/Me/Repo");
    expect(normalizeProjectKey("C:\\")).toBe("c:/");
  });
  test("containment respects segment boundaries", () => {
    expect(isProjectPathWithin("C:\\Repo\\src", "c:/repo")).toBe(true);
    expect(isProjectPathWithin("C:\\Repository", "c:/repo")).toBe(false);
  });
});

describe("project settings repository", () => {
  let repo: BunSessionRepository;
  beforeEach(() => {
    repo = new BunSessionRepository(new Database(":memory:") as never);
  });

  test("round-trips and looks up through the canonical key", async () => {
    await repo.updateProjectSettings("C:\\Repo\\", {
      name: "  Bank Ledger ",
      icon: { kind: "icon", value: "lucide:rocket" },
      pinned: true,
      defaultModel: { providerId: "openai", modelId: "gpt" },
      defaultWorkspace: "worktree",
    });
    const found = await repo.getProjectSettings("c:/repo");
    expect(found).toMatchObject({
      key: "c:/repo",
      name: "Bank Ledger",
      icon: { kind: "icon", value: "lucide:rocket" },
      archivedAt: null,
      defaultModel: { providerId: "openai", modelId: "gpt" },
      defaultWorkspace: "worktree",
    });
    expect(typeof found?.pinnedAt).toBe("number");
  });

  test("null clears, undefined keeps", async () => {
    await repo.updateProjectSettings("/p", { name: "X", archived: true, defaultWorkspace: "current" });
    const updated = await repo.updateProjectSettings("/p", { name: null, archived: false });
    expect(updated.name).toBeNull();
    expect(updated.archivedAt).toBeNull();
    expect(updated.defaultWorkspace).toBe("current");
    expect((await repo.listProjectSettings()).length).toBe(1);
  });
});

describe("ACP workdir fallback", () => {
  test("sessions with an empty project_dir expose their ACP workdir", async () => {
    const db = new Database(":memory:");
    const repo = new BunSessionRepository(db as never);
    db.exec(
      `CREATE TABLE acp_sessions (conversation_id TEXT NOT NULL, agent_id TEXT, workdir TEXT, updated_at INTEGER NOT NULL)`,
    );
    db.run(
      `INSERT INTO daemon_sessions (id, agent_id, title, status, project_dir, created_at, updated_at)
       VALUES ('acp1', 'claude', 'T', 'idle', NULL, 1, 1), ('own', 'claude', 'T', 'idle', 'C:/proj', 1, 1)`,
    );
    db.run(
      "INSERT INTO acp_sessions (conversation_id, agent_id, workdir, updated_at) VALUES ('acp1', 'claude', 'C:/work', 1), ('own', 'claude', 'C:/other', 1)",
    );
    expect((await repo.get("acp1"))?.projectDir).toBe("C:/work");
    expect((await repo.get("own"))?.projectDir).toBe("C:/proj");
    const listed = await repo.list();
    expect(listed.find((s) => s.id === "acp1")?.projectDir).toBe("C:/work");
  });
});

describe("describeCheckout", () => {
  let tmpRoot: string;
  let presenter: DaemonWorkspacePresenter;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "argos-project-test-"));
    presenter = new DaemonWorkspacePresenter(
      { publish: () => {}, subscribe: () => () => {} } as never,
      "http://127.0.0.1:0",
      path.join(tmpRoot, "wt-root"),
    );
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("resolves main checkouts, subfolders, linked worktrees and non-repos", async () => {
    const repoDir = path.join(tmpRoot, "repo");
    fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
    await git(repoDir, ["init", "-b", "main"]);
    fs.writeFileSync(path.join(repoDir, "src", "a.txt"), "a\n");
    await git(repoDir, ["add", "."]);
    await git(repoDir, ["commit", "-m", "init"]);
    const worktreeDir = path.join(tmpRoot, "feature-wt");
    await git(repoDir, ["worktree", "add", "-b", "feature", worktreeDir]);

    const main = await presenter.describeCheckout(repoDir);
    expect(main.isLinkedWorktree).toBe(false);
    expect(main.branch).toBe("main");
    expect(normalizeProjectKey(main.repoRoot!)).toBe(normalizeProjectKey(fs.realpathSync(repoDir)));

    const sub = await presenter.describeCheckout(path.join(repoDir, "src"));
    expect(sub).toMatchObject({ isLinkedWorktree: false, branch: "main" });

    const linked = await presenter.describeCheckout(worktreeDir);
    expect(linked.isLinkedWorktree).toBe(true);
    expect(linked.branch).toBe("feature");
    expect(normalizeProjectKey(linked.repoRoot!)).toBe(normalizeProjectKey(fs.realpathSync(repoDir)));

    const plain = path.join(tmpRoot, "plain");
    fs.mkdirSync(plain);
    expect(await presenter.describeCheckout(plain)).toEqual({ repoRoot: null, isLinkedWorktree: false, branch: null });
    expect(await presenter.describeCheckout(path.join(tmpRoot, "missing"))).toEqual({
      repoRoot: null,
      isLinkedWorktree: false,
      branch: null,
    });
  });
});
