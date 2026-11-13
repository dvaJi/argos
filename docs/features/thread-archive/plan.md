# Plan — Thread Archive

## Data / contracts

- `daemon_sessions.archived_at INTEGER NULL` (+ `ALTER TABLE` migration). `toSessionWithState` maps `archivedAt`.
- `SessionRecord.archivedAt?: number | null`; `SessionWithStateSchema.archivedAt: TimestampMs.nullable().optional()`.
- `sessions.setArchived` contract → `ARGOS_ROUTE_CATALOG` → daemon dispatcher (`repo.setArchived`) → desktop forward.
- `sessions.listLightweight.archived` → `repo.listPage({ archived })` → `repo.list({ archived })` (SQL filter;
  `only` orders by `archived_at DESC`, cursor uses the same key).
- Config: `thread_sidebar_lifecycle` added to `CONFIG_ENTRY_KEYS`, values schema, change union, and both
  `readConfigEntries` copies (desktop + backend-core) with defaults.

## UI

- `SessionClient.setArchived`, `listLightweight({ archived })`, `listAll()` (sessions.list includeSubagents false).
- `session.ts`: `UISession.archivedAt`; `upsertSessions` drops archived sessions from the list; `archiveSession` /
  `unarchiveSession` actions.
- `threadSidebar.ts`: `lifecycleSettings` in store (loaded with the flag, live-synced via `config.entries.changed`),
  `setLifecycleSettings`. `lifecycleContext` passes `autoSettleAfterMs`.
- `threadSidebarLogic.ts`: pure `planLifecycleSweep(sessions, ctx, settings)` → `{ archive: id[], delete: id[] }`.
- `useLifecycleSweep()` hook (mounted by `ThreadSidebarList`): runs the plan against `sessions.list`, archives /
  deletes sequentially, cleans lifecycle entries for deleted ids.
- `routes/archive.tsx` + `views/ArchiveView.tsx`; route tree regenerated.
- `DisplaySettings`: three selects + auto-delete confirmation dialog.

## Tests

- Vitest: `planLifecycleSweep` (settle→archive threshold, delete threshold, off switches, pinned/working never
  archived), `resolveSettled` honours configured days.
- Daemon `bun test`: repository `setArchived` + `listPage({ archived })` filtering/ordering (if a repository test
  harness exists; else covered by an e2e-hybrid route check).
