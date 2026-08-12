# Trees + Diffs Workspace

Status: in-progress
Owner: workspace-sidepanel
Created: 2026-08-10

## User Need

The right-hand workspace sidepanel currently ships a hand-rolled recursive file tree (`WorkspaceFileNode`), a read-only Monaco code viewer, and a custom unified-diff parser. (Monaco has since been removed; editing now uses `@pierre/diffs`.) Users want to:

1. **Edit files** directly from the sidepanel — rename, move (drag & drop), create, delete entries in the tree, and edit file contents inline. Today everything is read-only.
2. See a richer, consistent **diff** surface than the hand-rolled parser provides.
3. Get to the repo's pending changes fast through a dedicated **Diffs** tab, instead of only via the collapsed "Git" section inside the workspace.

## Goal

Replace the workspace sidepanel's tree, code viewer, and diff renderer with the Pierre libraries, enable full filesystem editing, and add a top-level "Diffs" tab:

| Surface | Today | After |
| --- | --- | --- |
| File tree | Custom recursive `WorkspaceFileNode` | `@pierre/trees` `<FileTree>` (path-first, virtualized, built-in search/rename/dnd/git-status) |
| Code viewer (read) | Read-only Monaco | `@pierre/diffs` `<File>` (Shiki highlight, matches diff styling) |
| Code editing | None | `@pierre/diffs` `<File edit>` via `EditProvider` + `Editor` (Shiki highlighting while editing); Save (Cmd/Ctrl+S) writes via `workspace.writeFile` |
| Diff renderer | Custom unified-diff row parser (`WorkspaceDiffView`) | `@pierre/diffs` `<PatchDiff>` (parses the unified patch the presenter already returns) |
| Preview pane (md/html/img/pdf/svg) | Iframe preview protocol | **Unchanged** |
| Top-level tab | `workspace` \| `browser` | `workspace` \| `browser` \| `diffs` |

### Single rendering pipeline

`@pierre/diffs` powers read-only code viewing (`<File>`), inline editing (`<File edit>` + `EditProvider`), and diffs (`<PatchDiff>`) with one Shiki pipeline and theme. Monaco is removed entirely (`monaco-editor`, `stream-monaco`, `@dvaji/vite-plugin-monaco-editor`, Vite workers, and the dead `WorkspaceCodePane`/`TraceDialog` Monaco setup). `TraceDialog`'s JSON body now uses `<File>` too.

## Acceptance Criteria

- **AC-1** Selecting a text file in the workspace renders it with `@pierre/diffs <File>`.
- **AC-2** A view/edit toggle switches a text file to an editable `@pierre/diffs` editor; Cmd/Ctrl+S (and a Save button) writes content via `workspace.writeFile`; a dirty indicator shows unsaved changes.
- **AC-3** Inline rename in the tree renames the file on disk and refreshes the tree.
- **AC-4** Drag-and-drop in the tree moves files/directories on disk and refreshes the tree.
- **AC-5** Context menu + tree affordances support "New File" and "New Folder" creation and "Delete".
- **AC-6** Git-status row signals (added/modified/deleted/untracked/...) render in the tree via Trees' built-in `gitStatus`.
- **AC-7** Selecting a changed file in the Git section renders its diff with `@pierre/diffs <PatchDiff>` (staged + unstaged).
- **AC-8** A new top-level **Diffs** tab exists beside Workspace/Browser; it lists all changed files (from `getGitStatus`) and renders them via `@pierre/diffs <CodeView>` (virtualized multi-file) using the workspace's unified diff.
- **AC-9** All write operations enforce the existing workspace path allow-list (`isPathAllowed`); unauthorized paths are rejected.
- **AC-10** Write operations trigger the existing `workspace.invalidated` invalidation flow so the tree/diffs refresh.
- **AC-11** `bun run typecheck`, `bun run lint`, `bun run format`, and the relevant `bun test` suites pass.
- **AC-12** `@argos/ui` build (`bun run build`) succeeds with the new dependencies bundled.

## Constraints

- Follow the typed route/client boundary: new capabilities go through `shared-contracts/routes`, `routes/index.ts` dispatcher, `WorkspacePresenter`, and `WorkspaceClient`. No new `window.api`/legacy paths.
- All filesystem writes must be inside a registered workspace/workdir (security boundary already enforced by `isPathAllowed`).
- Desktop is the primary target (the presenter lives in main). The daemon/headless path only needs to remain non-breaking for the existing read routes; write routes are desktop-only for now.
- Do not regress the markdown/html/pdf/svg/image preview pane or the artifact viewer.
- Editing uses `@pierre/diffs` (`EditProvider` + `Editor` + `<File edit>`); Monaco is removed entirely.
- `@pierre/trees` is `1.0.0-beta.x`; pin a caret range and treat beta API drift as a tracked risk.

## Non-Goals

- Replace the markdown/html/image/pdf preview pane with `@pierre/diffs`.
- Port write/edit routes to the daemon (web/headless mode stays read-only for workspace files in this iteration).
- Multi-file staging/unstaging/commit actions in the Diffs tab (future work).
- Migrating the unrelated "WorkspaceSelector" (machine switcher) feature.

## Open Questions

Resolved before implementation:

- **Q1:** Where does the "Diffs" tab live? **A:** Top-level peer of Workspace/Browser (new `SidePanelTab = "diffs"`).
- **Q2:** What does "replace the whole workspace" include? **A:** Tree + diff renderer + code viewer; preview pane stays.
- **Q3:** What editing? **A:** Rename, move (dnd), create, delete, and inline file-content editing.

None remain open.

## Out-of-Scope Risks

- Trees beta API churn — mitigated by pinning the version and a thin adapter component.
- Shiki bundle size added by `@pierre/diffs` — verify build size delta at AC-12.
