# Plan — Thread Sidebar Fixes

## Approach

Pure helpers move into `threadSidebarLogic.ts` (already the pure module); the store keeps only side effects
(persist + subscribe). The list switches to store actions and gains scroll pagination mirroring
`WindowSideBar`'s original-mode implementation.

## Affected files

| File | Change |
|---|---|
| `packages/ui/src/components/threads/threadSidebarLogic.ts` | Add `diffWorkingTransitions`, `pruneLifecycleEntries`, `parseSettledRecord`, lifecycle map types; remove `matchesTitle` (replaced by existing `filterByTitle`). |
| `packages/ui/src/stores/ui/threadSidebar.ts` | Remove import-time destructive seed; subscribe with first-sight-aware diff; add `notifySessionDeleted`, one-time `!hasMore` sweep. |
| `packages/ui/src/components/threads/ThreadSidebarList.tsx` | Store actions for rename/delete; scroll pagination + skeleton + loading row; delete dialog state; inline action error line. |
| `packages/ui/src/components/threads/ThreadSidebarRow.tsx` | Drop `window.confirm`; `onDelete` becomes `onRequestDelete`; rename draft sync. |
| `packages/ui/src/components/DeleteConversationDialog.tsx` | New: extracted from `WindowSideBar.tsx` (shared by both modes). |
| `packages/ui/src/components/SidebarFirstPageSkeleton.tsx` | New: extracted so the experiment list can reuse it without an import cycle. |
| `packages/ui/src/components/WindowSideBar.tsx` | Import extracted components; call `notifySessionDeleted` on its own delete path. |

## Data flow

- Rename/delete: Row → list handler → `sessionStore.renameSession/deleteSession` → store updates → rows re-render.
  Failure → `reportActionError` → transient error line.
- Delete lifecycle prune: list/`WindowSideBar` confirm → `notifySessionDeleted(id)` → prune maps + persist.
- Startup sweep: existing `sessionStore.subscribe` in the store; first time `sessions.length > 0 && !hasMore` →
  `pruneLifecycleEntries` against known ids (once per renderer lifetime).

## Compatibility

- localStorage keys and v2 format unchanged; sweep/prune only remove ids not present in the fully-loaded session list.
- `matchesTitle` removal: only consumer is `ThreadSidebarList`, which switches to `filterByTitle`.

## Test strategy

Vitest (colocated, mirroring existing `src/**/*.test.ts`): unit tests for `diffWorkingTransitions`,
`pruneLifecycleEntries`, `parseSettledRecord` in `threadSidebarLogic.test.ts` (same file extended by the feature
goal). Manual: restart with working session (AC3), delete from both modes (AC7), scroll long history (AC1).
