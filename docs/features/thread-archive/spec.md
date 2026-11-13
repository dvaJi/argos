# Thread Archive + Lifecycle Timers (Thread Sidebar experiment)

## User need

Settled threads accumulate forever in the Settled shelf. Users want old threads to leave the sidebar entirely
(archive), browse them in a dedicated view, and control the lifecycle timers: when threads auto-settle, when settled
threads auto-archive, and optionally when archived threads are permanently deleted.

## Goal

Add a daemon-persisted archived state for sessions, an Archive page, manual archive/restore actions, and three
configurable timers (settle → archive → delete) for the thread-sidebar experiment. Builds on
`docs/features/thread-sidebar-v3/`.

## Acceptance criteria

### Archive state (daemon)

- **AC1** Sessions gain `archivedAt: number | null` (new `archived_at` column, migrated with `ALTER TABLE`; existing
  rows `NULL`). It is exposed on session records/list items.
- **AC2** New route `sessions.setArchived { sessionId, archived }` sets/clears `archived_at` and emits a session
  `updated` event. Desktop forwards it to the daemon.
- **AC3** `sessions.listLightweight` accepts `archived?: "exclude" | "only"` (default `exclude`); archived pages are
  ordered by `archivedAt` desc. `sessions.list` is unchanged (internal callers still see everything).

### Sidebar behaviour (both sidebar modes)

- **AC4** Archived sessions never appear in the session store's list (filtered on upsert), so they disappear from
  both the original and the experimental sidebar, including in other windows.
- **AC5** Experimental row context menu gains **Archive**. Archiving the open thread advances like settle/snooze.
- **AC6** An "Archived threads" link (fixed footer of the experimental sidebar, and "View archived threads" in
  Settings → Appearance outside the experiment gate, main window only) opens the Archive page.
- **AC6b** Opening an archived session by any UI path that goes through `selectSession` (spotlight, history search)
  restores it first (un-archive + un-settle), so the open thread is visible and never swept.

### Archive page (`/archive`)

- **AC7** Full-window page (same chrome as Usage: "Back to chat") listing archived threads newest-archived first,
  loaded in full (so search and "Delete all" cover everything), with title search, agent avatar, archived age.
- **AC8** Per-row **Restore** (un-archive + un-settle → back to Active; opens nothing) and **Delete** (shared delete
  confirmation). Clicking a row restores and opens it. **Delete all** with confirmation.

### Lifecycle timers (Settings → Appearance → Thread Sidebar)

- **AC9** New config entry `thread_sidebar_lifecycle = { autoSettleDays, autoArchiveDays, autoDeleteDays }`, each
  `number | null` (null = off). Defaults: settle 7, archive 30, delete off. Choices: Off, 1, 3, 7, 14, 30, 90 days.
- **AC10** Auto-settle uses `autoSettleDays` (replaces the hard-coded 7 days).
- **AC11** Auto-archive: a thread that has been effectively settled for longer than `autoArchiveDays` (measured from
  its settled time) is archived.
- **AC12** Auto-delete: an archived thread whose `archivedAt` is older than `autoDeleteDays` is permanently deleted.
  Enabling auto-delete (or changing it from off) requires confirming a dialog warning that conversation history will
  be permanently lost.
- **AC13** The sweep runs in the renderer while the experimental sidebar is mounted (settled state is renderer-local):
  on mount, after settings change, and every 30 minutes. It reads the complete session list (`sessions.list`,
  including archived; statuses mapped through the UI mapping) so threads on unloaded pages are covered. It waits for the
  persisted timers to load, never touches the open session, and runs from `WindowSideBar` so it continues while the
  sidebar is collapsed. Failures are logged, never surfaced as blocking errors.

## Constraints

- Typed route/client pattern (contract → catalog → daemon dispatcher + desktop forward → `SessionClient`).
- Settled state stays renderer-local; archived state is daemon-persisted (survives clearing localStorage).
- Timers only run with the experiment enabled; the settings controls are shown only when it is enabled.

## Non-goals

- Server-side (daemon) scheduling of the sweep; archive for subagent/draft sessions; bulk selection in the Archive
  page beyond "Delete all"; full-text search of archived messages.

## Open questions

None.
