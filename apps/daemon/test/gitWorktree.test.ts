import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DaemonWorkspacePresenter } from "../src/workspace/daemonWorkspacePresenter";

const execFileAsync = promisify(execFile);

const eventPublisherStub = {
  publish: () => {},
  subscribe: () => () => {},
};

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Argos Test",
  GIT_AUTHOR_EMAIL: "test@argos.local",
  GIT_COMMITTER_NAME: "Argos Test",
  GIT_COMMITTER_EMAIL: "test@argos.local",
};

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    env: GIT_ENV,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout.trim();
}

let tmpRoot: string;
let worktreesRoot: string;
let presenter: DaemonWorkspacePresenter;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "argos-worktree-test-"));
  worktreesRoot = path.join(tmpRoot, "wt-root");
  fs.mkdirSync(worktreesRoot, { recursive: true });
  presenter = new DaemonWorkspacePresenter(eventPublisherStub, "http://127.0.0.1:0", worktreesRoot);
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Create a repo with one commit on `main` containing `hello.txt`. */
async function initRepo(dir: string): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  await git(dir, ["init", "-b", "main"]);
  fs.writeFileSync(path.join(dir, "hello.txt"), "hello\n");
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "initial"]);
  return dir;
}

describe("DaemonWorkspacePresenter git worktrees", () => {
  test("createGitWorktree bases the worktree on the named branch, not the current checkout", async () => {
    const repo = await initRepo(path.join(tmpRoot, "repo"));
    const headBefore = await git(repo, ["rev-parse", "HEAD"]);
    // Move the current checkout onto a different branch with extra commits so
    // "based on the branch, not the checkout" is observable.
    await git(repo, ["checkout", "-b", "wip"]);
    fs.writeFileSync(path.join(repo, "wip.txt"), "work in progress\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "wip"]);
    const checkoutHead = await git(repo, ["rev-parse", "HEAD"]);

    await presenter.registerWorkspace(repo);
    const creation = await presenter.createGitWorktree({
      workspacePath: repo,
      baseBranch: "main",
      fromRemote: false,
    });

    expect(fs.existsSync(creation.worktreePath)).toBe(true);
    expect(fs.existsSync(path.join(creation.worktreePath, "hello.txt"))).toBe(true);
    expect(fs.existsSync(path.join(creation.worktreePath, "wip.txt"))).toBe(false);
    expect(creation.branch).toMatch(/^argos\/[0-9a-f]{8}$/);

    // The worktree sits under the daemon-managed root, never inside the repo.
    expect(path.normalize(creation.worktreePath).startsWith(path.normalize(worktreesRoot))).toBe(true);

    // Invariant: the user's checkout was not touched.
    expect(await git(repo, ["rev-parse", "HEAD"])).toBe(checkoutHead);
    expect(await git(repo, ["rev-parse", "HEAD~1"])).toBe(headBefore);
    expect((await git(repo, ["status", "--porcelain"])).length).toBe(0);

    const worktreeHead = await git(creation.worktreePath, ["rev-parse", "HEAD"]);
    expect(worktreeHead).toBe(headBefore);
  });

  test("createGitWorktree with fromRemote uses the fetched origin tip", async () => {
    const originRepo = await initRepo(path.join(tmpRoot, "origin-repo"));
    const cloneDir = path.join(tmpRoot, "clone");
    await git(tmpRoot, ["clone", "-b", "main", originRepo, cloneDir]);
    const localMainHead = await git(cloneDir, ["rev-parse", "HEAD"]);

    // Advance origin past the local clone.
    fs.writeFileSync(path.join(originRepo, "remote-change.txt"), "from origin\n");
    await git(originRepo, ["add", "."]);
    await git(originRepo, ["commit", "-m", "remote advance"]);
    const originHead = await git(originRepo, ["rev-parse", "HEAD"]);
    expect(originHead).not.toBe(localMainHead);

    await presenter.registerWorkspace(cloneDir);
    const creation = await presenter.createGitWorktree({
      workspacePath: cloneDir,
      baseBranch: "main",
      fromRemote: true,
    });

    expect(creation.baseRef).toBe(originHead);
    const worktreeHead = await git(creation.worktreePath, ["rev-parse", "HEAD"]);
    expect(worktreeHead).toBe(originHead);
    expect(fs.existsSync(path.join(creation.worktreePath, "remote-change.txt"))).toBe(true);
    // Local checkout untouched (still stale, still on main).
    expect(await git(cloneDir, ["rev-parse", "HEAD"])).toBe(localMainHead);
  });

  test("createGitWorktree accepts a custom branch name and sanitizes the directory", async () => {
    const repo = await initRepo(path.join(tmpRoot, "repo"));
    await presenter.registerWorkspace(repo);
    const creation = await presenter.createGitWorktree({
      workspacePath: repo,
      baseBranch: "main",
      fromRemote: false,
      branchName: "feature/mine",
    });
    expect(creation.branch).toBe("feature/mine");
    expect(path.basename(creation.worktreePath)).toBe("feature-mine");
    expect(fs.existsSync(creation.worktreePath)).toBe(true);
  });

  test("createGitWorktree rejects unknown branches and unauthorized paths", async () => {
    const repo = await initRepo(path.join(tmpRoot, "repo"));
    await presenter.registerWorkspace(repo);
    expect(presenter.createGitWorktree({ workspacePath: repo, baseBranch: "nope", fromRemote: false })).rejects.toThrow(
      /Branch not found/,
    );

    const other = await initRepo(path.join(tmpRoot, "other"));
    expect(
      presenter.createGitWorktree({ workspacePath: other, baseBranch: "main", fromRemote: false }),
    ).rejects.toThrow(/Unauthorized/);
  });

  test("removeGitWorktree refuses user-owned worktrees outside the managed root", async () => {
    const repo = await initRepo(path.join(tmpRoot, "repo"));
    await presenter.registerWorkspace(repo);
    // A worktree the USER created outside the daemon-managed root.
    const userWorktree = path.join(tmpRoot, "user-checkout");
    await git(repo, ["worktree", "add", "-b", "user-branch", userWorktree]);

    await expect(
      presenter.removeGitWorktree({
        workspacePath: repo,
        worktreePath: userWorktree,
        force: true,
        deleteBranch: false,
      }),
    ).rejects.toThrow(/outside the daemon-managed worktrees root/);
    expect(fs.existsSync(userWorktree)).toBe(true);

    // Daemon-created worktrees (under the managed root) remain removable.
    const creation = await presenter.createGitWorktree({
      workspacePath: repo,
      baseBranch: "main",
      fromRemote: false,
      branchName: "argos/ok123456",
    });
    await presenter.removeGitWorktree({
      workspacePath: repo,
      worktreePath: creation.worktreePath,
      force: false,
      deleteBranch: true,
    });
    expect(fs.existsSync(creation.worktreePath)).toBe(false);
  });

  test("listGitWorktrees flags only daemon-managed worktrees as managed", async () => {
    const repo = await initRepo(path.join(tmpRoot, "repo"));
    await presenter.registerWorkspace(repo);
    const userWorktree = path.join(tmpRoot, "user-checkout");
    await git(repo, ["worktree", "add", "-b", "user-branch", userWorktree]);
    const creation = await presenter.createGitWorktree({
      workspacePath: repo,
      baseBranch: "main",
      fromRemote: false,
      branchName: "argos/mgd12345",
    });

    const worktrees = await presenter.listGitWorktrees(repo);
    const main = worktrees.find((w) => w.isMain);
    const user = worktrees.find((w) => path.resolve(w.path) === path.resolve(userWorktree));
    const managed = worktrees.find((w) => path.resolve(w.path) === path.resolve(creation.worktreePath));

    expect(main?.isManaged).toBe(false);
    expect(user?.isManaged).toBe(false);
    expect(managed?.isManaged).toBe(true);
  });

  test("listGitBranches reports default, HEAD, and worktree occupancy", async () => {
    const repo = await initRepo(path.join(tmpRoot, "repo"));
    await git(repo, ["branch", "develop"]);
    await presenter.registerWorkspace(repo);
    await presenter.createGitWorktree({
      workspacePath: repo,
      baseBranch: "develop",
      fromRemote: false,
      branchName: "argos/abc12345",
    });

    const listing = await presenter.listGitBranches(repo);
    expect(listing.isRepo).toBe(true);
    expect(listing.defaultBranch).toBe("main");
    const mainBranch = listing.branches.find((b) => b.name === "main");
    expect(mainBranch?.isHead).toBe(true);
    expect(mainBranch?.isDefault).toBe(true);
    expect(mainBranch?.worktreePath).toBeNull();
    const worktreeBranch = listing.branches.find((b) => b.name === "argos/abc12345");
    expect(worktreeBranch?.worktreePath).toBeTruthy();
  });

  test("listGitWorktrees marks the main worktree", async () => {
    const repo = await initRepo(path.join(tmpRoot, "repo"));
    await presenter.registerWorkspace(repo);
    const creation = await presenter.createGitWorktree({
      workspacePath: repo,
      baseBranch: "main",
      fromRemote: false,
    });

    const worktrees = await presenter.listGitWorktrees(repo);
    expect(worktrees.length).toBe(2);
    expect(worktrees[0]?.isMain).toBe(true);
    const managed = worktrees.find((w) => !w.isMain);
    expect(managed?.path).toBe(path.normalize(creation.worktreePath));
    expect(managed?.branch).toBe(creation.branch);
  });

  test("removeGitWorktree removes the tree and optionally the branch", async () => {
    const repo = await initRepo(path.join(tmpRoot, "repo"));
    await presenter.registerWorkspace(repo);
    const creation = await presenter.createGitWorktree({
      workspacePath: repo,
      baseBranch: "main",
      fromRemote: false,
      branchName: "argos/deadbeef",
    });

    await presenter.removeGitWorktree({
      workspacePath: repo,
      worktreePath: creation.worktreePath,
      force: false,
      deleteBranch: true,
    });

    expect(fs.existsSync(creation.worktreePath)).toBe(false);
    const branches = await git(repo, ["branch", "--list", "argos/deadbeef"]);
    expect(branches).toBe("");
  });

  test("removeGitWorktree refuses the main worktree and foreign paths", async () => {
    const repo = await initRepo(path.join(tmpRoot, "repo"));
    await presenter.registerWorkspace(repo);

    const worktrees = await presenter.listGitWorktrees(repo);
    const mainWorktree = worktrees.find((w) => w.isMain);
    expect(mainWorktree).toBeTruthy();
    await expect(
      presenter.removeGitWorktree({
        workspacePath: repo,
        worktreePath: mainWorktree!.path,
        force: false,
        deleteBranch: false,
      }),
    ).rejects.toThrow(/main worktree/i);

    const foreign = fs.mkdtempSync(path.join(tmpRoot, "foreign-"));
    await expect(
      presenter.removeGitWorktree({
        workspacePath: repo,
        worktreePath: foreign,
        force: false,
        deleteBranch: false,
      }),
    ).rejects.toThrow(/Not a registered worktree/i);
  });
});
