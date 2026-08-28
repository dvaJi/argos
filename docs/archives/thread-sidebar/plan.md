# Thread Sidebar — Implementation Plan

## Architecture Decisions

### 1. Pure UI derivation over `sessionStore` (no new IPC)

The existing `sessionStore` already holds everything needed:

- `UISession.status` — `"completed" | "working" | "error" | "none" | "new_results" | "blocked"`
  (mapped from the daemon's `idle|generating|blocked|done|error` via
  `sessions.status.changed` events and `sessions.listLightweight` payloads).
- `UISession.isPinned`, `isDraft`, `sessionKind`, `parentSessionId`, `projectDir`,
  `createdAt`, `updatedAt`, `agentId`.

The thread sidebar derives its active row and Settled list from this single source of
truth. This keeps the change surface small (UI-only) and cannot drift from what the
history sidebar shows.

### 2. Active row

The "active" row is:

- The currently selected session (`sessionStore.activeSessionId`) if it exists and is
  visible (regular, non-draft).
- Otherwise, the most recently touched session whose status is live
  (`working` / `blocked` / `error`).
- Otherwise, the most recently touched visible session.

This matches t3code: one card at the top showing whatever the user is currently
working on, without the user having to switch panels.

### 3. "Working Ns" live pill

The store (`packages/ui/src/stores/ui/threadSidebar.ts`) keeps a
`workingSinceById: Record<string, number>` map. Whenever a session transitions
into `working` (computed by diffing the session store's previous and next
`sessions` arrays inside `sessionStore.subscribe`), the store records
`Date.now()` for that id. When the session leaves `working`, the entry is
removed.

The list component (`ThreadSidebarList`) subscribes to that map and starts a
1s `setInterval` only while at least one session is `working`. The interval
calls a `bumpThreadSidebarTick()` helper (also on the store) so React re-renders
the pill every second; the interval is torn down as soon as no session is
working.

### 4. Settled list

A simple `partitionSettled(sessions, excludeActiveId, searchQuery)` that filters
out drafts and subagent sessions, excludes the active row, optionally filters by
case-insensitive substring against `title`, and sorts by `updatedAt` desc. No
pager (out of scope per spec) — derived lists are small.

### 5. Experiment flag via the config-entries contract

The experiment is gated by a daemon-persisted config entry:

- `thread_sidebar_enabled: boolean` already exists in `CONFIG_ENTRY_KEYS` /
  `ConfigEntryValuesSchema` / `ConfigEntryChangeSchema` (added in an earlier
  phase).
- `threadSidebarStore.enabled` loads the flag via `configClient.getSetting` and
  exposes `setThreadSidebarEnabled` (used by the Settings switch). The store
  also live-syncs via `configClient.onEntriesChanged` so toggling in the
  settings window applies to the main window immediately.

### 6. Component structure

```
packages/ui/src/components/threads/
  ThreadSidebarList.tsx — single component: search, project selector, active row, settled list
packages/ui/src/stores/ui/threadSidebar.ts — enabled flag + workingSinceById + tick
```

The earlier `ThreadSidebarShelf.tsx` / `ThreadSidebarRow.tsx` /
`ThreadSidebar.logic.ts` files were removed: the new design has no collapsible
shelves and no per-row dropdown menu, so they were dead weight.

### 7. Layout wiring

- `WindowSideBar` (`packages/ui/src/components/WindowSideBar.tsx`): when
  `threadSidebar.enabled` is true, the session column renders
  `<ThreadSidebarList />` instead of the agent/project history grouping. The
  icon rail (agents, search, theme, collapse) is unchanged. Disabling the flag
  restores the original view immediately (no restart, no extra buttons or
  panels).
- `loadThreadSidebarEnabled()` runs in `MainLayout` (`packages/ui/src/routes/_main.tsx`)
  on startup and in `DisplaySettings` on mount (the settings window is a
  separate renderer).

### 8. Testing strategy

- No unit tests for this experiment (per product decision): the partition logic
  is a small pure derivation and the value is in manual verification of the
  experiment.
- Quality gates: `bun run format`, `bun run lint` (includes the architecture
  guards), `bun run typecheck` (web + node).

## Event Flow / Data Flow

```
configPresenter ──thread_sidebar_enabled──▶ threadSidebarStore.enabled (via configClient)
daemon ──sessions.listLightweight─────────▶ sessionStore.sessions (UISession[])
daemon ──sessions.status.changed──────────▶ sessionStore.applySessionStatus
                  │                                     │
                  └─ threadSidebarStore.subscribe ──────┘
                       diffs sessions, updates workingSinceById
                       (only sets timestamp on working->working entry)
        ThreadSidebar reads sessionStore + agentStore via useStore
        ThreadSidebar reads workingSinceById via useStore
        row click → sessionStore.selectSession(id)   (existing activation path)
```

## Compatibility & Migration

- Purely additive UI plus the existing daemon-persisted config entry
  (`thread_sidebar_enabled`, default `false`). Existing history sidebar is
  untouched.
- Three obsolete files were removed:
  `packages/ui/src/components/threads/ThreadSidebarShelf.tsx`,
  `packages/ui/src/components/threads/ThreadSidebarRow.tsx`,
  `packages/ui/src/components/threads/ThreadSidebar.logic.ts`. They were only
  referenced by the previous iteration of the experiment and not by anything
  else in the tree (verified by grep).

## Risks & Mitigations

- **Live tick churn**: only runs while a session is `working`; cheap no-op
  otherwise. `bumpThreadSidebarTick` mutates a single counter — no store
  listener wakes for unrelated state.
- **Stale "Working Ns" on tab restore**: the working-since map is rebuilt from
  `sessionStore` on first import (`sessionStore.state.sessions`). If the user
  reloads while a session is mid-generation, the pill resets to ~0s — same
  behavior t3code has.
