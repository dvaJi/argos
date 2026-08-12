# Trees + Diffs Workspace — Implementation Plan

Reference: `spec.md` in this folder.

## Architecture

The change is split into four layers, each following the existing typed boundary:

```
shared-contracts/routes/workspace.routes.ts  (new write + read-text routes)
        │  ARGOS_ROUTE_CATALOG registration
        ▼
shared/types/presenters/workspace.d.ts        (IWorkspacePresenter + SidePanelTab)
        │  implemented by
        ▼
apps/desktop/.../workspacePresenter/index.ts  (fs write ops, allow-list, invalidation)
        │  dispatched from
        ▼
apps/desktop/.../routes/index.ts              (new case per route)
        ▲  invoked via bridge
        │
ui/api/WorkspaceClient.ts                     (typed wrappers)
        ▲
ui/components/sidepanel/*                     (Trees + Diffs components)
ui/stores/ui/sidepanel.ts                     (diffs tab state)
```

### New route contracts (shared-contracts)

Add to `packages/shared-contracts/src/routes/workspace.routes.ts` and register each in `ARGOS_ROUTE_CATALOG` (`routes.ts`):

| Route | Input | Output |
| --- | --- | --- |
| `workspace.readFileText` | `{ path }` | `{ content: string \| null, exists: boolean }` — raw text for the editor (distinct from `readFilePreview`, which normalizes for preview). |
| `workspace.writeFile` | `{ path, content }` | `{ written: boolean }` |
| `workspace.createEntry` | `{ parentDir, name, isDirectory }` | `{ path: string }` |
| `workspace.deletePath` | `{ path }` | `{ deleted: boolean }` |
| `workspace.renameOrMovePath` | `{ fromPath, toPath }` | `{ path: string }` |

All use `zod.string().min(1)` and reuse existing `defineRouteContract`.

### Presenter (desktop main)

Extend `WorkspacePresenter` (`apps/desktop/src/main/presenter/workspacePresenter/index.ts`) and the `IWorkspacePresenter` interface (`packages/shared/src/types/presenters/workspace.d.ts`):

- `readFileText(filePath): Promise<string | null>` — read raw UTF-8 text; `isPathAllowed` guard; return `null` for non-text/binary/large files (reuse `resolvePreviewKind`: only proceed when `kind === "text"` and size under a cap, e.g. 2 MB).
- `writeFile(filePath, content): Promise<void>` — guard; `fs.promises.writeFile`; the chokidar content watcher already emits an `fs` invalidation, so no manual emit is required.
- `createEntry(parentDir, name, isDirectory): Promise<string>` — guard parent; resolve target; reject path traversal (`..`); `mkdir`/`writeFile` empty.
- `deletePath(path): Promise<void>` — guard; `fs.promises.rm({ recursive: true, force: false })`.
- `renameOrMovePath(fromPath, toPath): Promise<string>` — guard both; ensure `toPath` resolves inside an allowed workspace; `fs.promises.rename`.

Each write method must: validate via `isPathAllowed`, normalize with `normalizePathForAccess`, reject attempts to escape the allowed workspace root, and let the watcher drive invalidation (already wired). No new event payloads.

### Types (`packages/shared`)

- `SidePanelTab` → `"workspace" | "browser" | "diffs"`.
- `IWorkspacePresenter` gains the five methods above.
- No new `WorkspaceNavSection` (the Git section stays; the Diffs tab is separate).

### UI client (`packages/ui/api/WorkspaceClient.ts`)

Add `readFileText`, `writeFile`, `createEntry`, `deletePath`, `renameOrMovePath` wrappers following the existing `bridge.invoke(route.name, input)` pattern.

### Route dispatcher (`apps/desktop/src/main/routes/index.ts`)

Add one `case` per new route (mirror the `workspaceReadFilePreviewRoute` block), importing the new route contracts alongside the existing workspace imports.

## UI Changes

### Dependencies (`packages/ui/package.json`)

```jsonc
"dependencies": {
  "@pierre/trees": "^1.0.0-beta.6",
  "@pierre/diffs": "^1.3.5"
}
```

Install with `bun add`. Verify Vite bundles Shiki (used by `@pierre/diffs`); add to `optimizeDeps.include` only if dev cold-start breaks.

### New components (`packages/ui/src/components/sidepanel/`)

| File | Responsibility |
| --- | --- |
| `TreesFileTree.tsx` | Adapter around `@pierre/trees/react` `useFileTree` + `<FileTree>`. Feeds prepared paths from `readDirectory`/`expandDirectory`, maps git status (`getGitStatus`) to Trees `gitStatus`, wires `onRename`/`dragAndDrop` to `workspace.renameOrMovePath`, `renderContextMenu` for New File/Folder/Delete. Calls `sidepanelStore.selectFile` on selection. |
| `DiffsCodePane.tsx` | Read-only code view via `@pierre/diffs/react` `<File file={{name, contents}} options={{theme}} />`. Theme toggled by `themeStore.isDark` (`pierre-dark`/`pierre-light`). |
| `DiffsEditorPane.tsx` | Editable editor via `@pierre/diffs` `EditProvider` + `Editor` + `<File edit>` (Shiki highlight while editing). Dirty tracking through `Editor.onChange`/`getText()`; on save calls `workspaceClient.writeFile`. Cmd/Ctrl+S handler. Mounted keyed by file path. |
| `DiffsPatchPane.tsx` | Single-file diff via `@pierre/diffs/react` `<PatchDiff patch={staged||unstaged} />`. Replaces `WorkspaceDiffView` for the Git section. |
| `DiffsPanel.tsx` | The new top-level tab body. Loads `getGitStatus` + per-file `getGitDiff`; renders `@pierre/diffs/react` `<CodeView items={[...]}>` (virtualized multi-file diffs) with sticky headers. Reuses `useWorkspaceSync` invalidation. |

### Edited components

- `ChatSidePanel.tsx`: add the **Diffs** button (lines ~230-253) and a third branch rendering `<DiffsPanel>` when `activeTab === "diffs"`.
- `WorkspacePanel.tsx`: replace the custom `<WorkspaceFileNode>` tree with `<TreesFileTree>`; replace the code/diff panes with the new `Diffs*Pane` components; keep Files/Git/Artifacts nav sections and the preview pane.
- `WorkspaceViewer.tsx`: add an **Edit** toggle for text files (view = `<DiffsCodePane>`, edit = `<DiffsEditorPane>`); keep Preview/Code toggle for preview-eligible files.

### Store (`packages/ui/src/stores/ui/sidepanel.ts`)

- `openDiffs()` action mirroring `openBrowser()` (`activeTab: "diffs"`).
- Expose `openDiffs` through `useSidepanelStore()`.
- Optional `diffsStore` (new `stores/ui/diffs.ts`) holding the Diffs tab's selected-file filter and expanded-file set — keep small; reuse `useWorkspaceSync` for data.

### Editor dirty-state

`DiffsEditorPane` holds local `original`/`current` strings; dirty = `current !== original`. On save: `writeFile` then set `original = current`. If the file is invalidated externally (watcher) while dirty, prompt or reload-on-confirm (first iteration: reload silently only when not dirty).

## Data Flow (editing)

```
user drags src/a.ts -> lib/a.ts in <FileTree>
  -> onDropComplete({ draggedPaths: ["src/a.ts"], target: "lib/" })
  -> workspaceClient.renameOrMovePath("…/src/a.ts", "…/lib/a.ts")
  -> bridge.invoke -> routes dispatcher -> WorkspacePresenter.renameOrMovePath
  -> isPathAllowed(both) -> fs.rename
  -> chokidar content watcher fires -> scheduleInvalidation("fs")
  -> renderer onInvalidated -> useWorkspaceSync re-reads tree + git status
  -> model.resetPaths(...) refreshes <FileTree>
```

## Compatibility / Migration

- Read-only routes are unchanged; the daemon/headless path is unaffected (write routes simply aren't dispatched there — they'll return the standard "desktop-only" error, matching `revealFileInFolder`/`openFile`).
- The preview protocol (`workspacePreviewProtocol`) and markdown linked-file resolution are untouched.
- `WorkspaceDiffView.tsx` is retired (replaced by `DiffsPatchPane`); remove it and its imports in the same change to avoid dead code.
- The custom `WorkspaceFileNode.tsx` tree renderer is retired; `WorkspaceFileNode` *type* stays (presenter still returns it).

## Test Strategy

- **Unit (main, `apps/desktop/test/main`):** extend `workspacePresenter.test.ts` with the five new methods — allow-list rejections, path-traversal guards, round-trip write/read/delete/rename. Use a temp dir fixture; mock the watcher where needed.
- **Unit (renderer, `packages/ui`):** `TreesFileTree.test.tsx` (rename/dnd calls the client), `DiffsPanel.test.tsx` (renders changed files from a mock `getGitStatus`/`getGitDiff`), `DiffsEditorPane.test.tsx` (dirty + save calls `writeFile`).
- **Manual:** verify AC-1..AC-10 in dev (`bun run dev`).
- **Gates:** `bun run format`, `bun run lint` (incl. architecture-guard), `bun run typecheck`, `bun test`, and `bun run build` for AC-11/AC-12.

## Build Size Check

After install, run `bun run build` and record the `@argos/ui` chunk-size delta from Shiki + Trees. If the delta is large, configure dynamic import of the Diffs components (`React.lazy`) so the editor/chat bundle stays lean.

## Rollout

Single PR to `master` (default base). No flags; the feature replaces existing read-only surfaces in place. Keep `WorkspaceDiffView`/`WorkspaceFileNode` (renderer) removal in the same PR.
