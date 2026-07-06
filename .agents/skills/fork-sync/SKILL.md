---
name: fork-sync
description: Selectively integrate source features into this fork (dvaJi/argos) as native, self-contained PRs. The fork diverged from the source tree and cannot merge upstream directly. Use when asked to "sync", "port", "bring in an upstream feature", or to continue an in-progress integration. Produces commits/PRs/code that read as ordinary Argos work — never advertise origin.
---

# Fork Sync

## Context (read first)

- **This fork**: `dvaJi/argos` (origin), integration branch is `master`. No `dev`/`main`.
- **Source repo**: `ThinkInAIXYZ/deepchat` (remote `upstream`), default branch `dev`.
- **Divergence**: the fork point is `b67332c`. The fork has since been rewritten
  (renderer migration, ACP SDK migration, dependency modernization, restructured
  main process). Histories **share** `b67332c` but a `git merge`/`cherry-pick` is
  **not viable** — many overlapping files no longer exist in this fork.
- **Therefore**: integrate by **selectively re-implementing** a source feature in the
  fork's current structure, as a standalone PR. Never `git merge upstream`.

## Golden rule

**Artifacts must read as native Argos work.** Do NOT mention "upstream", "port",
"source repo", "deepchat", or the source PR#/commit SHA in:

- commit messages,
- PR titles or bodies,
- code comments,
- test descriptions.

The source origin is tracked **only inside this skill's files** (registry,
sync-state) for the AI's own reference — never surfaced into the repo.

## Files this skill maintains (self-evolving)

- `ported-files.md` — registry mapping each fork file touched to its source ref
  and role. **Read this first** to understand fork↔source relationships. The map
  accumulates, so each iteration the AI knows more about where things live.
- `learnings.md` — dated gotchas/patterns discovered during integrations
  (style deltas, test-setup quirks, circular imports, etc.).
- `sync-state.md` — the fork point, the source remote, and which source commits
  have been integrated (so the next run knows what's done).

**After every integration, update all three** (see step 9). That is the
self-evolution: the skill gets smarter each run.

## Workflow

1. **Pick the next source change** from `sync-state.md` (status `pending`).
2. **Branch:** `git checkout master && git pull && git checkout -b feature/<slug>`
   (plain feature branch — not `upstream-sync/...`; the branch name is internal but
   keep it neutral).
3. **Study intent:** `git show <source-sha> -- src/main src/shared src/preload`.
   Skip source-renderer UI files the fork no longer carries, and process docs.
   Capture the behavioral intent, not the line diff.
4. **Consult `ported-files.md`** to find where the equivalent code lives in the fork
   now. Add/update mappings as you discover them.
5. **Re-implement** in the fork's current code + style (TS, double quotes, semicolons,
   2-space indent — match the file). Adapt names/signatures to the fork's API.
   UI changes are out of scope unless we deliberately rebuild them in the current
   renderer — note as a follow-up in your work log, **not** in the PR.
6. **Port tests** where meaningful; adapt to the fork's test setup (see
   `learnings.md` for the vitest-4 mock rules and global mocks).
7. **Verify gate (mandatory):**
   - `pnpm run typecheck`
   - `pnpm test` — must stay **0 failures**
   - `pnpm run lint` then `pnpm run format`
   - `pnpm run build` if `src/main`/preload changed
8. **Commit + PR, native style:**
   - Commit: `feat(<scope>): <what>` or `fix(<scope>): <what>` — **no origin ref**.
     Body explains the *what* and *why* in plain Argos terms.
   - **Rebase onto current master** (`git fetch origin master && git rebase origin/master`)
     so skill-bookkeeping commits on master don't surface as spurious diffs in the PR.
     After rebase, confirm `git diff --name-only origin/master..HEAD` shows only the port
     files (no `.agents/skills/**`).
   - Push: `git push -u origin feature/<slug>` (use `--force-with-lease` if you rebased).
   - PR: `gh pr create --repo dvaJi/argos --base master --head feature/<slug>`
     (`--repo` is required: two remotes confuse gh's default). PR body describes the
     change and gate results — no origin mention.
   - Never commit `routeTree.gen.ts` (generated); `pnpm-lock.yaml` is tracked, commit
     it when deps change.
9. **Evolve the skill (mandatory, before finishing):**
   - `sync-state.md`: mark the source commit `done` (add the PR#).
   - `ported-files.md`: add/refresh the file mappings you discovered.
   - `learnings.md`: append a dated entry for anything surprising (a new gotcha, a
     fork-vs-source structural difference, a test pattern that wasn't already logged).
   - **SKILL.md**: if you discovered a *reusable* rule or step that isn't here, add
     it. This file is meant to be amended by the agent over time.

## Non-portable categories (skip in step 3)

- source-renderer UI files that no longer exist in this fork.
  If a feature's value is its UI, open a separate renderer-rebuild task (not this PR).
- Release/version commits — the fork versions independently.
- Process docs under the source's `docs/issues/**`, `docs/features/**`.

## When an integration is not feasible

Mark the `sync-state.md` row `blocked` with the reason (e.g. "depends on the memory
subsystem, not yet integrated"). Do not force a partial change past the gate.

## AI agent usage

When asked to "sync", "port", or "bring in" a feature:
1. Read `sync-state.md` → report what's pending and suggest the next pick.
2. Confirm scope with the user (one feature per PR).
3. Run the workflow above.
4. Leave the skill files updated.
