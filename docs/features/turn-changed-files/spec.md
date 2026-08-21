# Spec: Turn Changed Files Panel

## Summary

Render a collapsible "changed files" card at the end of completed assistant turns,
showing which files the agent changed during that turn with per-file and rolled-up
`+additions / −deletions` stats, a directory tree, and an "Open diff" action.
Interaction model and visuals are ported from t3code's `ChangedFilesCard`
(pingdotgg/t3code), adapted to Argos architecture.

Reference implementation studied:
- `apps/web/src/components/chat/ChangedFilesTree.tsx` (card + tree UI)
- `apps/web/src/lib/turnDiffTree.ts` (tree building + stat rollup)
- `apps/web/src/components/chat/changedFilesPresentation.ts` (auto-expand/preview rules)
- `apps/server/src/checkpointing/*` + `apps/server/src/vcs/GitVcsDriver.ts` (shadow checkpoints)

## Problem

Argos threads show tool activity ("Worked for 22s" fold) but no summary of *what changed*
at the end of a turn. Users must open the sidepanel Diffs tab and mentally map working-tree
state back to the turn that produced it.

## Goals

1. After each completed assistant turn, persist an accurate list of files changed during
   that turn with `+N/−N` line counts.
2. Render a t3code-style card at the end of the assistant message:
   header (`N changed files +A −D`, Show/Hide files, expand-all-folders, Open diff),
   collapsed preview chips, expanded directory tree with rolled-up stats.
3. Clicking a file (or Open diff) opens the sidepanel Diffs tab focused on that file.
4. Works for both provider executions (pi worker and ACP).
5. Best-effort: any failure degrades to "no card", never fails the turn.

## Non-Goals

- Checkpoint restore / rollback UI (t3code has it; later feature).
- Historical per-turn diff viewing inside the sidepanel (v1 opens current working-tree diffs).
- Ref garbage collection policy (refs are retained; cleanup deferred).

## Approach: Shadow Checkpoints (t3code technique)

Per session turn, the daemon records two invisible git tree snapshots using hidden refs
and a temporary index file — the user's branch, index, stash, and status are untouched:

```
GIT_INDEX_FILE=<gitdir>/argos-checkpoint-index-<uuid>
git read-tree HEAD          # seed temp index (skip if unborn HEAD)
git add -A -- .             # stage entire worktree incl. untracked files
git write-tree              # -> tree oid
git commit-tree <tree> -m "argos turn checkpoint ..."   # orphan commit
git update-ref refs/argos/turns/<sessionId>/<n> <commit>
```

- **Baseline** captured when generation starts.
- **End** captured when the turn settles (before `finalizeAssistantMessage`).
- Changes computed as `git diff --numstat -z -M <baselineRef>..<endRef>`.

Because snapshots are full trees, untracked files created during the turn are included
automatically and mid-turn user edits do not corrupt attribution.

### Why numstat instead of parsing a unified patch

t3code parses the full patch with `@pierre/diffs`. The daemon does not depend on
`@pierre/diffs`; `--numstat -z -M` gives the same `{path, additions, deletions}` data
with a trivial NUL-separated parser (handles renames `{old => new}`, binary `-` markers,
and non-ASCII paths without quoting). The card displays only path + stats, so a full
patch is unnecessary.

## Data Contract

New assistant message block type `file_changes` (persisted with the message):

```ts
type: "file_changes";
status: "success";
timestamp: number;
file_changes?: {
  files: Array<{
    path: string;            // workspace-relative, forward slashes
    additions: number | null; // null = binary
    deletions: number | null;
  }>;
};
```

Schema changes:
- `packages/shared-contracts/src/common.ts`: extend `AssistantMessageBlockSchema.type`
  enum + optional `file_changes` object.
- `packages/shared` agent-interface `AssistantMessageBlock` type mirror.
- `packages/ui/src/components/chat/messageListItems.ts`: extend
  `DisplayAssistantMessageBlock` union.

## UI Behavior (full parity)

- Header row: chevron, `N changed file(s)`, total `+A −D` (green/red), hover hint
  "Show files"/"Hide files"; right side: expand/collapse-all-folders icon button (expanded
  state only) and "Open diff" outline button.
- Expanded: directory tree built from flat file list; directories roll up child stats;
  single-child directory chains compact (`skills/infs-wavespeed`); rows clickable.
- Collapsed preview (when not latest turn or too large): top-scope summary
  (`skills · 2 files`) + up to 3 file chips + "Show all N files".
- Auto-expand rules (latest turn only): ≤5 files AND ≤200 changed lines.
- Non-git workspace, missing baseline, empty diff → no block, no card.

## Open Diff Action

Reuses the sidepanel: `openDiffs()` + `setDiffsSelection(path)` from
`#/stores/ui/sidepanel`. v1 shows the *current* working-tree diff (same limitation as
clicking a file chip); historical turn-diff viewing is a non-goal.

## Resolved Decisions

| Question | Decision |
|---|---|
| Per-turn attribution mechanism | Shadow checkpoint refs (t3code technique) |
| Stats source | `git diff --numstat -z -M` between checkpoint refs |
| Persistence | New persisted `file_changes` block appended before finalize |
| Ref retention | Keep `refs/argos/turns/<sessionId>/<n>`; GC deferred |
| Non-git workspaces | Feature silently disabled (no block) |
| Failure handling | Log warn, skip block; never reject the turn |

## Testing

- Daemon (bun test): checkpoint capture/diff against a temp git repo fixture; numstat
  parser unit tests (renames, binary, quoted/-z paths, deletions); skip-cases (no repo,
  no baseline).
- UI (vitest): tree builder + stat rollup + compaction; presentation helpers
  (auto-expand thresholds, scope summary, preview selection); card render test
  (collapsed/expanded states, callbacks).
