# Tasks: Turn Changed Files Panel

## 1. Contracts & types
- [ ] 1.1 Extend `AssistantMessageBlockSchema` (shared-contracts `common.ts`) with
      `"file_changes"` enum value + `file_changes` payload schema.
- [ ] 1.2 Mirror type in `@argos/shared` agent-interface `AssistantMessageBlock`.
- [ ] 1.3 Extend `DisplayAssistantMessageBlock` in `packages/ui/src/components/chat/messageListItems.ts`.

## 2. Daemon checkpoint module
- [ ] 2.1 `apps/daemon/src/workspace/turnCheckpointGit.ts`: `captureWorktreeSnapshot`
      (temp index, read-tree/add/write-tree/commit-tree/update-ref, temp cleanup).
- [ ] 2.2 `diffSnapshotsNumstat` + `-z -M` parser (renames, binary, forward-slash normalize).
- [ ] 2.3 bun test suite with temp-repo fixture.

## 3. Daemon orchestration + wiring
- [ ] 3.1 `apps/daemon/src/host/turnCheckpoints.ts`: begin/end API, per-session state,
      warn-and-skip error policy.
- [ ] 3.2 Wire pi-provider-execution (baseline at turn start; append block before finalize).
- [ ] 3.3 Wire acp-provider-execution (same).

## 4. UI
- [ ] 4.1 Port `turnDiffTree.ts` (+ tests).
- [ ] 4.2 Port `changedFilesPresentation.ts` (+ tests).
- [ ] 4.3 Build `TurnChangedFiles.tsx` card + tree (+ render test).
- [ ] 4.4 Mount in `MessageItemAssistant`; thread `isLatestTurn` from `MessageList`.
- [ ] 4.5 Wire Open diff / row click to sidepanel stores.

## 5. Verification
- [ ] 5.1 `bun run format && bun run lint && bun run typecheck`.
- [ ] 5.2 `bun test` (daemon) + desktop/UI vitest suites.
- [ ] 5.3 Manual dev-run: pi turn and ACP turn each produce a correct card; non-git
      workspace shows none; history reload keeps cards.
