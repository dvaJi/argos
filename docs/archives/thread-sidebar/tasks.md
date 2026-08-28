# Thread Sidebar — Tasks

Small, ordered tasks mapping to commits/PRs.

## Phase 1 — Experiment flag (config entry)

- [x] `packages/shared-contracts/src/routes/config.routes.ts`: add
  `thread_sidebar_enabled: boolean` to `CONFIG_ENTRY_KEYS`,
  `ConfigEntryValuesSchema`, and `ConfigEntryChangeSchema`.
- [x] `apps/desktop/src/main/routes/config/configRouteSupport.ts`: read
  `thread_sidebar_enabled` (default `false`).
- [x] `packages/backend-core/src/dispatch/config/configRouteSupport.ts`: same.

## Phase 2 — Store (flag + live working-since)

- [x] `packages/ui/src/stores/ui/threadSidebar.ts`
  - TanStack `Store` with `{ enabled, enabledLoaded, workingSinceById, tick }`.
  - `loadThreadSidebarEnabled()` / `setThreadSidebarEnabled()` via `configClient`
    (`thread_sidebar_enabled` entry).
  - Seed `workingSinceById` once from the session store on import.
  - `sessionStore.subscribe` diffs the sessions array; sets the timestamp when a
    session enters `working` and clears the entry when it leaves.
  - `bumpThreadSidebarTick()` for the live "Working Ns" pill re-render.
  - `useThreadSidebarStore()` hook.

## Phase 3 — UI

- [x] `packages/ui/src/components/threads/ThreadSidebarList.tsx`
  - t3code-faithful layout: search input + new-chat icon, "All projects"
    selector, single active row (agent chip + title + live "Working Ns" pill +
    project label), Settled list with relative ages and search filter.
  - `pickActiveSession(sessions, activeId)` chooses the row.
  - `partitionSettled(...)` derives the list, excluding the active row and
    filtering by the search query.
  - 1s `setInterval` only while at least one session is `working`; ticks the
    store so the pill re-renders.
- [x] Removed obsolete files:
  `ThreadSidebarShelf.tsx`, `ThreadSidebarRow.tsx`, `ThreadSidebar.logic.ts`.
- [x] Wire into `WindowSideBar` (`packages/ui/src/components/WindowSideBar.tsx`):
  render `<ThreadSidebarList />` in the session column when the experiment is
  on; load flag in startup effect.
- [x] `DisplaySettings.tsx` (Settings → Appearance): "Thread Sidebar
  (Experiment)" switch.

## Phase 4 — Quality gates

- [x] `bun run format`
- [x] `bun run lint` (agent-cleanup + architecture + route-catalog guards,
  oxlint)
- [x] `bun run typecheck` (web + node)
- [x] Config-route tests (`contracts.test.ts`,
  `configRouteHandler.test.ts`) pass

## Definition of Done

- [x] All acceptance criteria from `spec.md` met
- [x] Experiment toggle in Settings persists via daemon config entry
- [x] Lint/typecheck/format clean
- [ ] SDD folder archived per retention policy when the experiment ships
