# Tasks — Thread Sidebar Fixes

- [x] T1. Extract `DeleteConversationDialog` and `SidebarFirstPageSkeleton` into their own modules; update `WindowSideBar` imports.
- [x] T2. Add pure helpers to `threadSidebarLogic.ts`: `diffWorkingTransitions`, `pruneLifecycleEntries`, `parseSettledRecord`, lifecycle map types; drop `matchesTitle`.
- [x] T3. Rework `threadSidebar.ts`: first-sight-aware working-since diff on subscribe (no import-time seed), `notifySessionDeleted`, one-time `!hasMore` sweep.
- [x] T4. `ThreadSidebarList`: store-backed rename/delete with error line, delete dialog, scroll pagination, skeleton + loading row.
- [x] T5. `ThreadSidebarRow`: `onRequestDelete` (no `window.confirm`), rename draft sync during render.
- [x] T6. Wire `notifySessionDeleted` into `WindowSideBar`'s original-mode delete confirm.
- [x] T7. Unit tests for the new pure helpers; run `bun run format` + `bun run lint` + typecheck.
