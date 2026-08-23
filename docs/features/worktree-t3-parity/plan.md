# Plan — Worktree / Branch Picker T3 Parity

## Architecture decisions

### 1. Replace `Switch` with mode `Select` (Workspace first)
- **Rationale:** The `Switch` (`value.enabled`) is hidden and reads as a checkbox. T3 makes the mode explicit: `Current checkout` (no worktree), `New worktree`, `Previous worktree (<branch>)`. This matches Image 1’s `Workspace` label.
- **Type:** Keep `WorktreeDraftConfig` (`enabled, baseBranch, fromRemote, branchName`) for backward compat, but derive `enabled` from `mode`. Add local UI state `mode: "current"|"new"|"previous"` plus `previousWorktreePath?: string|null`. When mode is `current`, `enabled=false`; otherwise `true`. `onChange` maps back to `WorktreeDraftConfig` plus `previousWorktreePath` via new optional field `reuseWorktreePath?: string` (Plan §3).
- **Button label:** `Worktree` → `Worktree · origin/main` (existing) when `mode=new` and `baseBranch` set; `Worktree · <branch>` for previous; plain `Worktree` for current.

### 2. Searchable branch picker for `New worktree`
- **Component:** Replace `Select` (`SelectTrigger`/`SelectContent`) with an `Input` (`Search refs…`) + scrollable `Command`-style list. Reuse existing `remoteBranches`/`localBranches` derived from `fetchGitSummary`, but merge into one filtered array.
- **Data:** `branches` already fetched via `workspaceClient.gitListBranches` (remote+local with `isDefault`, `isHead`, `worktreePath`). Filter `name.toLowerCase().includes(query)` on `branch.name` (for remote, full `origin/<name>`). Show badges: `default` (Badge), `worktree` (text `worktree` like Image 2), `current` (text).
- **Interaction:** `handleSelectBranch` same as before (sets `baseBranch`/`fromRemote`). Keep auto-default logic but **do not** auto-apply when mode is `current`; only when `mode=new` and `value.baseBranch` empty.
- **No checkout:** Daemon `createGitWorktree` already does `fetch origin` → `rev-parse origin/<branch>^{commit}` → `SHA` → `worktree add -b <new> <path> <SHA>`. UI keeps note “Your current checkout is never touched.” No change to `daemonWorkspacePresenter.ts`.

### 3. Previous worktree reuse
- **UI:** When `mode=previous`, render `managedWorktrees` as selectable rows (existing bottom list, now with `onClick` to select). Selecting a row sets `reuseWorktreePath = worktree.path` and `enabled=true`. The submit path (`NewThreadPage.tsx:355-389`) will detect `reuseWorktreePath` and set `sessionProjectDir = reuseWorktreePath` without calling `createSubmissionWorktree`. Add optional field `reuseWorktreePath?: string` to `WorktreeDraftConfig` (or keep separate state in `NewThreadPage` and pass through).
- **Backward compat:** If `reuseWorktreePath` present, `WorktreeDraftConfig.enabled` true but `createGitWorktree` is skipped. Existing `abandonSubmissionWorktree` not needed.

### 4. Touch points

| File | Change |
|---|---|
| `packages/ui/src/components/worktreeConfig.ts:2` | Add `reuseWorktreePath?: string \| null` to `WorktreeDraftConfig`; update `emptyWorktreeDraft`. |
| `packages/ui/src/components/WorktreeSelector.tsx:87` | Replace `Switch` with mode `Select`; add `searchQuery` state + filtered branch list; branch UI as searchable list; selectable `managedWorktrees` for previous mode; keep `Branch name (optional)` input for `new` mode; keep delete buttons. |
| `packages/ui/src/pages/NewThreadPage.tsx:132` | Handle `reuseWorktreePath` — if set, use it as `sessionProjectDir` directly; otherwise existing `createSubmissionWorktree` flow. |
| `packages/shared-contracts/src/routes/workspace.routes.ts` | No change (branch list already there). |
| `apps/daemon/src/workspace/daemonWorkspacePresenter.ts` | No change (worktree creation already isolated). |

### 5. Event flow

```
ProjectPicker (workspace) → workspacePath prop
       ↓
WorktreeSelector (mode → new → Search refs… → pick origin/main)
       ↓
WorktreeDraftConfig {enabled, baseBranch, fromRemote, branchName, reuseWorktreePath}
       ↓
NewThreadPage.submitText → if reuseWorktreePath → sessionProjectDir = that path
                         else if enabled → createSubmissionWorktree(baseBranch/fromRemote) → worktreePath
                         else → projectState.selectedProjectPath
       ↓
sessionClient.create / ensureAcpDraftSession with projectDir
```

## Alternatives
- Keep `Switch` + add search to existing `Select`: rejected — still hides mode and mixes current/new/previous.
- New route for searchable refs: rejected — `gitListBranches` already returns all refs; filtering is client-side.

## Test strategy
- Manual: open NewThreadPage with a git repo, verify `Current checkout` shows `main`, switching to `New worktree` shows searchable `origin/*` list, typing `wavespeed` filters to `t3code/add-wavespeed-model-skills (worktree)`.
- Existing: `apps/daemon/test` `daemonWorkspacePresenter` branch/worktree listing unaffected.
- Lint/type: `bun run format && bun run lint && bun run typecheck:node` (no new route, so `route-catalog` unchanged).

## Risks
- **Old stored drafts:** `WorktreeDraftConfig` gains optional field; existing empty drafts still `{enabled:false, baseBranch:"", ...}` → mode `current`, no migration.
- **Non-git repo:** mode `new`/`previous` disabled, shows `Not a git repository` as before.
