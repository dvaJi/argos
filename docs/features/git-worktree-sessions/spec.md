# Git Worktree Sessions

## [S1] Problem

Argos sessions always run agents directly in the user's project checkout. When an agent works in the same
directory the developer has open, the agent rewrites files under the developer, branches get switched under
running tooling, and two parallel sessions trample each other's edits. There is no way to say "run this task
on its own branch, starting from `origin/main`, and leave my checkout alone".

## [S2] Current State

- Git support is read-only: `DaemonWorkspacePresenter.getGitStatus/getGitDiff`
  (`apps/daemon/src/workspace/daemonWorkspacePresenter.ts`), exposed via
  `workspace.getGitStatus` / `workspace.getGitDiff` route contracts
  (`packages/shared-contracts/src/routes/workspace.routes.ts`).
- A session's working directory is its `projectDir` (`daemon_sessions.project_dir`), which becomes the ACP
  `workdir` and then the spawned agent process cwd (`apps/daemon/src/host/acp-provider-execution.ts`,
  `packages/acp-runtime/src/process/acpProcessManager.ts`).
- `docs/features/agent-state-semantics/spec.md` explicitly lists "Git worktree integration" as out of scope
  (it was unbuilt).
- No branch-mutation or worktree code exists anywhere in the repo.

## [S3] Reference design (t3code)

Borrowed from `pingdotgg/t3code` (studied from source):

- `git worktree add -b <newBranch> <path> <startPoint>` where `startPoint` is always an **explicit ref**
  (the chosen base branch or a resolved commit SHA) — never the current checkout's HEAD. The main checkout
  is never touched (`apps/server/src/vcs/GitVcsDriverCore.ts` `createWorktree`).
- "Start from origin": when basing on the remote state, `git fetch origin`, resolve
  `refs/remotes/origin/<branch>^{commit}` to a SHA, and use that SHA as start point; repos without an
  `origin` remote fall back to the local branch (`apps/server/src/ws.ts` bootstrap `prepareWorktree`).
- Worktrees live in a **central directory outside the repo** (`<serverDataDir>/worktrees/<repoName>/<branch>`)
  so the repository is not polluted and no `.gitignore` changes are required.
- Auto branch naming `<prefix>/<8-hex-chars>`; the branch is kept when a worktree is removed (opt-in delete).
- A branch-listing API powers the base-branch picker and reports which branches are already checked out in
  some worktree.

## [S4] Proposed behavior

### Guarantees (the core requirement)

1. Worktree creation always takes an explicit start point: the selected base branch ref, or
   `origin/<branch>` (fetched + resolved to a SHA) when "from origin" is chosen.
2. The daemon never runs `checkout`/`switch`/`reset` on the user's checkout as part of this feature.
   `git worktree add` is the only tree-writing command; it writes only into the new worktree directory.
3. A new branch (user-provided or auto-generated `argos/<8hex>`) is created for the worktree, so the base
   branch is never "moved" and cannot collide with a branch already checked out elsewhere.

### Routes (daemon-owned, workspace domain)

- `workspace.gitListBranches { workspacePath }` → `{ isRepo, branches: [{ name, kind: "local"|"remote", isDefault, isHead, worktreePath }], defaultBranch }`
  - `git for-each-ref` over `refs/heads` + `refs/remotes`; `refs/remotes/origin/HEAD` resolves the default
    branch (fallback: main-checkout HEAD); `git worktree list --porcelain` marks branches already checked
    out in a worktree.
- `workspace.gitListWorktrees { workspacePath }` → `{ worktrees: [{ path, branch, head, isMain }] }`
- `workspace.gitCreateWorktree { workspacePath, baseBranch, fromRemote?, branchName? }` → `{ worktreePath, branch, baseRef }`
  1. Gate: `workspacePath` must be inside a registered workspace.
  2. Resolve repo root (`git rev-parse --show-toplevel`).
  3. If `fromRemote` and remote `origin` exists: `git fetch --quiet --no-tags origin`, then start point =
     `git rev-parse --verify refs/remotes/origin/<baseBranch>^{commit}`. No `origin` remote (or fetch
     failure) → fall back to the local ref.
  4. Else start point = `git rev-parse --verify refs/heads/<baseBranch>^{commit}`.
  5. Branch = `branchName` (validated `argos`-style ref name) or auto `argos/<8hex>`.
  6. Target dir = `<daemonDataDir>/worktrees/<repoName>-<rootHash6>/<sanitizedBranch>` (collision-safe
     across same-named repos; sanitized branch replaces `/` with `-` like t3code).
  7. `git worktree add -b <branch> <dir> <startPoint>`.
  8. Register the new dir as an allowed workspace so status/diff/watch work immediately.
- `workspace.gitRemoveWorktree { workspacePath, worktreePath, force?, deleteBranch? }` → `{ removed: true }`
  - The path must appear in `git worktree list --porcelain` for that repo (prevents arbitrary deletion),
    must not be the main worktree, and (for `deleteBranch`) the worktree's branch must not be the
    main-checkout HEAD branch or the default remote branch. `git worktree remove [--force]`, then
    `git worktree prune`, then optional `git branch -D <branch>`.

### Session integration

- New-thread flow: with worktree mode enabled, on submit the UI creates the worktree first, then binds the
  session to `projectDir = worktreePath`:
  - ACP agents: `sessions.ensureAcpDraft` with `projectDir = worktreePath` (drafts are keyed per
    agent+projectDir), then send. The pre-created draft for the base repo dir is simply not used.
  - Argos agent: `sessions.create` with `projectDir = worktreePath`.
- The ACP runtime spawns the agent process with cwd = worktree (existing behavior, no changes).

### UI

`NewThreadPage` gains a worktree control next to the project picker, visible when the selected project is a
git repo:

- Popover with: worktree toggle (Switch), base-branch Select (remote-tracking refs labeled `origin/…`
  first, then local; default = `origin/<defaultBranch>` when present), optional custom branch name
  (Input, placeholder shows the auto `argos/<8hex>` form), and an existing-worktrees list with remove
  actions.
- While a worktree is being created the submit button is disabled and shows progress; errors surface via
  toast.
- Sessions opened in a worktree show the worktree path as their project dir (existing UI already displays
  projectDir).

## [S5] Scope / non-goals

- No PR creation, push, or merge flows.
- No worktree-per-session automatic lifecycle (removal is manual from the picker).
- No reuse of an existing worktree for a base branch (always a fresh worktree + branch).
- No changes to ACP runtime cwd semantics.

## [S6] Security

- Worktree creation only allowed for paths inside registered workspaces.
- Worktree target paths are server-derived (daemon data dir); the client never supplies the target path.
- Removal validates the path belongs to the repo's worktree list, refuses the main worktree, and guards
  protected branches against deletion.
