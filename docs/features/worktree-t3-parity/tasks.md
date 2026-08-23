# Tasks — Worktree / Branch Picker T3 Parity

## Phase 0 — SDD
- [x] Draft `spec.md` / `plan.md` / `tasks.md` (this folder)

## Phase 1 — Config type
- [x] `worktreeConfig.ts:2` — added `reuseWorktreePath?: string | null` to `WorktreeDraftConfig` and `emptyWorktreeDraft`

## Phase 2 — WorktreeSelector UI (T3 parity)
- [x] Replaced `Switch` with mode `Select`: `Current checkout` (with `origin/main` hint), `New worktree`, `Previous worktree (<branch>)` for each managed worktree; `enabled` derived from mode (`current→false`, others→true)
- [x] `New worktree` branch picker: `Input Search refs…` + filtered scrollable list merging `remote` + `local`; rows show `name` + `default`/`worktree`/`current` badges; `onClick` → `handleSelectBranch`; removed non-searchable `Select`
- [x] `Previous worktree` mode: `managedWorktrees` now selectable (click sets `reuseWorktreePath`), with checkmark and retained delete button; `Current checkout` shows no branch picker
- [x] Kept `Branch name (optional)` only for `new` mode; kept delete list and “Your current checkout is never touched” note
- [x] Auto-default `defaultBaseBranch` only when `mode=new` and `!value.baseBranch`

## Phase 3 — NewThreadPage integration
- [x] `NewThreadPage.tsx:354` — if `reuseWorktreePath` set, `sessionProjectDir` directly reuses that path and skips `createSubmissionWorktree`; else existing creation flow (requires `baseBranch`)

## Phase 4 — Validation
- [x] `bun run format && bun run lint` — pass
- [ ] Manual verification with a test repo: Current checkout → New worktree → search `main`/`wavespeed` → create → verify `git worktree list` and session `projectDir` is worktree path, original checkout untouched (needs repo)
