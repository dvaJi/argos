# Plan: Turn Changed Files Panel

## Architecture

```
packages/ui (renderer)                 apps/daemon (Bun)
┌───────────────────────────┐          ┌─────────────────────────────────────┐
│ MessageItemAssistant      │          │ host/turnCheckpoints.ts (new)       │
│  └─ TurnChangedFiles card │          │  captureTurnBaseline(cwd, key)      │
│     data from block type  │◄─ events ┤  finalizeTurnFileChanges(...)       │
│     "file_changes"        │          │   -> {files[]} | null               │
│  "Open diff" → sidepanel  │          │ workspace/turnCheckpointGit.ts      │
└───────────────────────────┘          │   (temp-index snapshot + numstat)   │
                                       │ pi-provider-execution.ts  (wire)    │
shared-contracts: block schema         │ acp-provider-execution.ts (wire)    │
+ shared types + UI display type       └─────────────────────────────────────┘
```

## Steps

1. **Contracts & types**
   - `AssistantMessageBlockSchema`: add `"file_changes"` to enum; optional
     `file_changes: { files: [{path, additions, deletions}] }`.
   - Mirror in `@argos/shared` agent-interface type and UI
     `DisplayAssistantMessageBlock`.

2. **Daemon git module** (`apps/daemon/src/workspace/turnCheckpointGit.ts`)
   - `captureWorktreeSnapshot(cwd, refName)`: temp index (`GIT_INDEX_FILE` inside git
     common dir), `read-tree HEAD` (tolerate unborn), `add -A -- .`, `write-tree`,
     `commit-tree`, `update-ref`. Cleanup temp index on all paths.
   - `diffSnapshotsNumstat(cwd, fromRef, toRef)`: parse `--numstat -z -M` output →
     `{path, additions, deletions}[]`; expand `{old => new}` rename segments to the new
     path; `-` → null stats.
   - Follow `execGit` pattern from `daemonWorkspacePresenter.ts`
     (node:child_process — daemon is Bun runtime but this module shells out to git).

3. **Daemon orchestration** (`apps/daemon/src/host/turnCheckpoints.ts`)
   - `beginTurnChanges(sessionId, cwd)`: captures baseline at next turn index;
     in-memory map keyed by sessionId (single daemon owns generation).
   - `endTurnChanges(sessionId, messageId)`: capture end ref, numstat diff, delete
     nothing, return `file_changes` block or null. Warn-and-skip on any error.

4. **Wire executors**
   - `pi-provider-execution.ts`: call `beginTurnChanges` where the ActiveTurn is created
     (cwd already resolved at line ~376); in `settled`, before
     `finalizeAssistantMessage`, append returned block to `turn.blocks`.
   - `acp-provider-execution.ts`: same at prompt start / completion assembly.

5. **UI components** (`packages/ui/src/components/message/`)
   - `turnDiffTree.ts`: port of t3code tree builder (stat rollup, single-child dir
     compaction, locale sort).
   - `changedFilesPresentation.ts`: port scope summary / preview selection /
     auto-expand thresholds.
   - `TurnChangedFiles.tsx`: card + tree. Icons via `@iconify/react`
     (`lucide:chevron-right`, `lucide:folder`, `lucide:folder-closed`,
     `lucide:file-diff`, `lucide:chevrons-down-up`, `lucide:chevrons-up-down`);
     shadcn Tooltip; styling matches screenshot (rounded-2xl bordered card,
     mono file labels, tabular-nums green/red stats).
   - Mount in `MessageItemAssistant` after render items, before `MessageToolbar`;
     pass `isLatestTurn` down from `MessageList`.
   - "Open diff" / row click → `openDiffs()` + `setDiffsSelection(path)`.

6. **Tests**
   - Daemon: `test/turnCheckpointGit.test.ts` (temp repo fixture: init, commit,
     modify/add/delete/rename/binary cases; no-repo skip; unborn HEAD).
   - Daemon: orchestrator unit tests with injected git module.
   - UI: `turnDiffTree.test.ts`, `changedFilesPresentation.test.ts`,
     `TurnChangedFiles.test.tsx`.

7. **Guards & hygiene**: route catalog untouched (no new routes); run
   `bun run format && bun run lint && bun run typecheck && bun test`.

## Risks

- Large worktrees make `git add -A` snapshots slow → acceptable (t3code ships same);
  baseline capture is off the streaming hot path.
- Concurrent turns per session are serialized by existing execution flow; keyed map is
  safe. Daemon restart mid-turn loses baseline → skip card (logged).
- Windows paths: refs use sessionId only; numstat paths normalized to forward slashes.
