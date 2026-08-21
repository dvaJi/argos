# Git Worktree Sessions — Plan

## Layered plan

1. **Contracts** (`packages/shared-contracts`)
   - `src/domainSchemas.ts`: `WorkspaceGitBranchSchema`, `WorkspaceGitWorktreeSchema`,
     `WorkspaceGitWorktreeCreationSchema`.
   - `src/routes/workspace.routes.ts`: `workspaceGitListBranchesRoute`, `workspaceGitListWorktreesRoute`,
     `workspaceGitCreateWorktreeRoute`, `workspaceGitRemoveWorktreeRoute`.
   - `src/routes.ts`: imports + `ARGOS_ROUTE_CATALOG` entries (drift guard enforces sync).
2. **Shared presenter types** (`packages/shared/src/types/presenters/workspace.d.ts`):
   `WorkspaceGitBranch`, `WorkspaceGitWorktree`, `WorkspaceGitWorktreeCreation` (+ result).
3. **Daemon presenter** (`apps/daemon/src/workspace/daemonWorkspacePresenter.ts`)
   - Constructor takes optional `worktreesRootDir` (defaults to `<dataDir>/worktrees`, injected from
     `apps/daemon/src/index.ts`).
   - New methods: `listGitBranches`, `listGitWorktrees`, `createGitWorktree`, `removeGitWorktree`
     reusing `execGit`; a `runGitStrict` helper that surfaces stderr messages (rev-parse failures).
4. **Daemon dispatcher** (`apps/daemon/src/dispatch/daemonDispatcher.ts`)
   - Extend the `workspacePresenter` port type; four new route handlers next to `getGitStatus`.
5. **Desktop proxy** (`apps/desktop/src/main/routes/index.ts`)
   - Four new cases delegating via `invokeDaemonRoute` (workspace routes are daemon-owned so web mode works).
6. **UI client** (`packages/ui/api/WorkspaceClient.ts`)
   - `gitListBranches`, `gitListWorktrees`, `gitCreateWorktree`, `gitRemoveWorktree`.
7. **UI component** (`packages/ui/src/components/WorktreeSelector.tsx`)
   - Popover: toggle + branch select + custom branch name + existing worktrees management.
8. **New-thread integration** (`packages/ui/src/pages/NewThreadPage.tsx`)
   - Render `WorktreeSelector` when the selected project is valid; hold `worktreeDraft`
     (`{ enabled, baseBranch, fromRemote, branchName }`); in `submitText`, create the worktree then bind
     the session (ACP draft per worktree dir, or `createSession` with worktree projectDir).
9. **Tests**
   - Daemon `apps/daemon/test/gitWorktree.test.ts`: real temp repos (git binary), covering
     create-from-local, create-from-remote (fetch + SHA start point — assert current checkout untouched),
     branch listing occupancy, remove guards (main worktree refused, foreign path refused, protected
     branch refused).
   - Contracts: catalog drift guard covers registration automatically.
10. **Docs/format**: run `bun run format` + `bun run lint`; typecheck.

## Risk notes

- `execGit` returns `null` only for missing git binary; non-zero exits throw — new code must catch and
  rethrow with stderr for actionable UI errors.
- Windows paths: always `path.resolve`; compare worktree paths via `path.resolve` normalization.
- `git worktree add` fails if the branch is already checked out elsewhere — we always create a new branch
  (`-b`), matching t3code; user-specified names that collide surface git's error.
- Bun-runtime file ops: use `node:fs` for directory APIs only (no file writes needed here).
