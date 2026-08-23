# Spec — Worktree / Branch Picker T3 Parity

## Goal
Make the workspace → branch flow explicit and searchable like T3, and ensure creating a worktree never touches the current checkout. Current UI hides the worktree toggle as a `Switch` inside the popover and uses a non-searchable `Select` for base branch. Users misread it as a checkbox and cannot quickly find `origin/*` refs.

## Source images
- Image 1 (T3): top label **Workspace** → options `Current checkout` (branch `main`) / `New worktree` / `Previous worktree (t3code/add-wavespeed-model-skills)` . The worktree mode is a first-class dropdown, not a switch.
- Image 2 (T3): searchable input `Search refs…` listing `main (current)`, `fix/auth-review-followup`, `t3code/add-wavespeed-model-skills (worktree)` … with `worktree` badges and `current` marker. Selection is the branch *origin* (remote or local) used as worktree start point.

## Current vs desired
| Aspect | Current Argos (`WorktreeSelector.tsx`) | T3 desired | Gap |
|---|---|---|---|
| Workspace first | Project picker is outside `WorktreeSelector`; worktree toggle is a hidden `Switch` (`value.enabled`) inside popover | Workspace mode is the **first** dropdown inside the popover (Current checkout / New worktree / Previous worktree) | Expose mode as a Select, not a Switch |
| Branch origin | `Select` with groups `Remote (origin)` / `Local`, no filter, auto-picks default on open | Searchable `Input` `Search refs…` filtering both remote and local, with `worktree` badge and `default/current` markers, no auto-checkout | Replace `Select` with filterable list (e.g. `Command`) |
| Previous worktree | `Existing worktrees` list at bottom is delete-only | `Previous worktree` is a selectable mode that reuses an existing managed worktree path | Make existing worktrees selectable |
| Checkout safety | Already safe: `daemonWorkspacePresenter.createGitWorktree` does `fetch origin` → `rev-parse` SHA → `worktree add -b <new> <path> <SHA>` without touching current checkout | Same | Keep, but make UI copy explicit (“Your current checkout is never touched”) |

## User stories
1. As a user starting a new thread, I first see my **Workspace** (current project path). I open the worktree control and choose **Current checkout / New worktree / Previous worktree** without a hidden switch.
2. When I choose **New worktree**, I can **search** for a base ref (e.g. typing `wavespeed` finds `t3code/add-wavespeed-model-skills`) and see which refs are already in a worktree or are `default/current`.
3. The worktree is created from `origin/<branch>` SHA (or local ref) via `git worktree add`, and the session’s `projectDir` becomes the new worktree path — current checkout stays on `main`.

## Acceptance criteria
- **Mode picker:** `WorktreeSelector` popover top section is a `Select` with `Current checkout` (branch badge `main`), `New worktree`, `Previous worktree (<branch>)` for each managed worktree. No `Switch`. `value.enabled` is derived from mode (`current` → false, others → true) for backward compat.
- **New worktree branch picker:** When mode is `New worktree`, show `Input Search refs…` + scrollable filtered list of `remoteBranches + localBranches` (merged, remote first). Each row shows `name`, `default` badge, `worktree` badge if `branch.worktreePath`, `current` if `branch.isHead`. Click sets `baseBranch`/`fromRemote` and closes the list (or keeps popover open).
- **Previous worktree picker:** When mode is `Previous worktree`, show selectable list of `managedWorktrees` (the existing bottom list, now clickable). Selecting one sets the draft to reuse that path (see Plan for contract).
- **No auto-checkout:** Creating a worktree never runs `git checkout` in the workspace; daemon path unchanged. Existing `createGitWorktree` flow kept.
- **A11y/search:** `Search refs…` autofocuses, filters case-insensitive on `name`, shows `No refs found` empty state. Keyboard `↑/↓ Enter` works.

## Non-goals (v1)
- Persisting worktree mode per-project (still `WorktreeDraftConfig` in page state, not `projectStore`).
- Reusing an existing worktree *without* creating a new branch (v1 still creates `argos/<auto>` unless user picks Previous worktree).

## Open questions
- [x] Workspace is already outside `WorktreeSelector` (project picker) — keep it there, but surface mode first inside popover as Image 1.
- [ ] How to represent “Current checkout” branch name in button label when no repo? Show `Worktree` + `Not a git repo` disabled state (existing).
