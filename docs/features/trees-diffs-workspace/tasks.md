# Trees + Diffs Workspace — Tasks

Ordered for reviewable commits. Update status as work lands.

## 1. Contracts & types

- [x] 1.1 Add `workspace.readFileText`, `workspace.writeFile`, `workspace.createEntry`, `workspace.deletePath`, `workspace.renameOrMovePath` route contracts to `packages/shared-contracts/src/routes/workspace.routes.ts`.
- [x] 1.2 Register the five new routes in `ARGOS_ROUTE_CATALOG` (`packages/shared-contracts/src/routes.ts`).
- [x] 1.3 Extend `SidePanelTab` to `"workspace" | "browser" | "diffs"` in `packages/shared/src/types/presenters/workspace.d.ts`.
- [x] 1.4 Add the five new methods to `IWorkspacePresenter` (same file).

## 2. Presenter (desktop main)

- [x] 2.1 Implement `readFileText` on `WorkspacePresenter` (text-only, size cap, allow-list).
- [x] 2.2 Implement `writeFile`, `createEntry`, `deletePath`, `renameOrMovePath` (allow-list + path-traversal guard).
- [x] 2.3 Add the five `case` blocks to `apps/desktop/src/main/routes/index.ts`.

## 3. UI client & store

- [x] 3.1 Add the five wrappers to `packages/ui/api/WorkspaceClient.ts`.
- [x] 3.2 Add `openDiffs()` action + `SidePanelTab` handling in `packages/ui/src/stores/ui/sidepanel.ts`.
- [~] 3.3 (Optional) Add `stores/ui/diffs.ts` for Diffs-tab filter/expand state — deferred; DiffsPanel holds local state for now.

## 4. Dependencies & build

- [x] 4.1 `bun add @pierre/trees@^1.0.0-beta.6 @pierre/diffs@^1.3.5` in `packages/ui`.
- [x] 4.2 Verified Vite dev/build bundles Shiki; used `disableWorkerPool` to avoid worker-URL plumbing.
- [x] 4.3 `bun run build` passes; chunk-size warning is pre-existing (icons/editor.api), not introduced here.

## 5. Tree replacement

- [x] 5.1 Create `TreesFileTree.tsx` adapter (paths from `readDirectory`/`expandDirectory`, git status -> Trees `gitStatus`).
- [x] 5.2 Wire inline rename + drag/drop to `workspaceClient.renameOrMovePath`.
- [x] 5.3 Wire context menu: New File / New Folder / Delete -> `createEntry`/`deletePath`.
- [x] 5.4 Swap `<WorkspaceFileNode>` for `<TreesFileTree>` in `WorkspacePanel.tsx`.
- [x] 5.5 Keep drag-to-chat file-reference behavior (context menu "Insert reference" dispatches `INSERT_REFERENCE_REQUESTED` via `onInsertFileReference`).
- [x] 5.6 Removed dead `WorkspaceFileNode.tsx` renderer (type retained in `@argos/shared/presenter`).

## 6. Code viewer + editing

- [x] 6.1 Create `DiffsCodePane.tsx` (read-only `@pierre/diffs` `<File>`).
- [x] 6.2 Create `DiffsEditorPane.tsx` (editable `@pierre/diffs` `EditProvider` + `Editor` + `<File edit>`, Save/dirty + Cmd/Ctrl+S; Monaco removed).
- [x] 6.3 Add View/Edit toggle in `WorkspaceViewer.tsx`; swap `WorkspaceCodePane` usages for `DiffsCodePane`.

## 7. Diff renderer

- [x] 7.1 Create `DiffsPatchPane.tsx` (`@pierre/diffs` `<PatchDiff>` from staged/unstaged patch text).
- [x] 7.2 Replace `WorkspaceDiffView` usages with `<DiffsPatchPane>`.
- [x] 7.3 Delete `WorkspaceDiffView.tsx`.

## 8. Diffs tab

- [x] 8.1 Create `DiffsPanel.tsx` (changed-file list + `@pierre/diffs` `<PatchDiff>` per selection; full patch by default). Note: used `<PatchDiff>` over a per-file list rather than `<CodeView>` multi-file to consume the presenter's unified patch directly (see plan "Diff renderer" decision; `<CodeView>` remains a future enhancement).
- [x] 8.2 Add the **Diffs** button + branch in `ChatSidePanel.tsx`.
- [x] 8.3 Wire `workspaceClient.onInvalidated` into the Diffs tab (status + focused patch refresh).

## 9. Tests

- [x] 9.1 Extend `workspacePresenter.test.ts` (read/write/create/delete/rename + allow-list/traversal) — 12 new cases, 25 total passing.
- [~] 9.2 UI component tests (`TreesFileTree`/`DiffsPanel`) — deferred. `@pierre/trees`/`@pierre/diffs` use shadow DOM + Shiki that do not render in jsdom; coverage is provided by the presenter tests + manual verification (AC-1..AC-10).

## 10. Gates

- [x] 10.1 `bun run format`.
- [x] 10.2 `bun run lint` (architecture-guard, agent-cleanup-guard, route-catalog-drift-guard, oxlint all green; 342 routes registered).
- [x] 10.3 `bun run typecheck` (desktop `typecheck:node` + `@argos/ui` `typecheck:web`).
- [x] 10.4 `workspacePresenter` test run (25 passed).
- [x] 10.5 `bun run build` (`@argos/ui` builds with the new deps).

## 11. Daemon port (workspace routes are NOT desktop-only)

The workspace FS/git/edit routes belong in the daemon (web/headless + desktop), not fenced off as desktop-only. Implemented so the HybridBridge routes them to the daemon where the logic actually lives.

- [x] 11.1 Reverted the temporary `desktop-only` band-aid (only `workspace.revealFileInFolder`/`openFile` remain desktop-only — Electron `shell`).
- [x] 11.2 `apps/daemon/src/workspace/daemonWorkspacePresenter.ts` — Bun port: allow-list, readDirectory/expandDirectory, readFilePreview (HTTP preview URLs), readFileText/writeFile/createEntry/deletePath/renameOrMovePath, resolveMarkdownLinkedFile, getGitStatus/getGitDiff (git CLI), searchFiles (recursive), reveal/open throw.
- [x] 11.3 chokidar watchers → `eventPublisher.publish(workspace.invalidated)`.
- [x] 11.4 HTTP preview endpoint `GET /api/v1/workspace/preview?path=` in `apps/daemon/src/index.ts` (allow-list enforced; serves html/pdf/svg raw bytes).
- [x] 11.5 Wired all 16 workspace routes into `createDaemonDispatcher` (new optional `workspacePresenter` param); instantiated in `index.ts`, base URL set after `serve()`.
- [x] 11.6 `chokidar` added to `@argos/daemon` deps.
- [x] 11.7 Gates: daemon + desktop + UI typecheck, lint, daemon test suite (50 passed; 1 unrelated MCP env failure).

## Follow-ups (out of this iteration)

- Remove the now-dead desktop main `WorkspacePresenter` + its unreachable route `case`s (routes go to the daemon; the desktop presenter is only referenced by its own dispatcher).
- Adopt `@pierre/diffs` `<CodeView>` for the Diffs tab once old/new file-content fetching is wired (richer virtualized multi-file review).
- Preserve Trees expansion across invalidation reloads (track expanded paths; pass to `resetPaths({ initialExpandedPaths })`).
- Daemon preview endpoint auth (today it relies on local-only exposure; add a token for network-exposed daemons).
