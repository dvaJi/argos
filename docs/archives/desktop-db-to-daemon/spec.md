# Desktop DB → Daemon (bun:sqlite) Migration

## Goal

Eliminate `better-sqlite3` entirely from the project. All SQLite access moves to the
daemon, which already uses `bun:sqlite` (`~/.argos-daemon/data/argos.db`). The desktop
becomes a pure Electron shell — no local database.

## Why

`bun:sqlite` is Bun-only. The desktop's Electron main process (Node.js) cannot use it.
The only way to satisfy "use bun:sqlite everywhere" is to move all DB access to the
daemon and have the desktop talk to it over the existing HTTP/WebSocket API.

## Current state (after encryption removal)

| Surface | Status |
|---------|--------|
| Encryption / SQLCipher | ✅ Removed |
| `better-sqlite3-multiple-ciphers` | ✅ Swapped to `better-sqlite3@12.11.1` |
| `ElectronDatabaseProvider` | ✅ Deleted (was dead code) |
| `providerImportService.ts` | ✅ Refactored — no `better-sqlite3` import; daemon injects `bun:sqlite` reader |
| `databaseSecurity.diagnoseSchema/repairSchema` | ✅ Moved to daemon |
| Desktop `SQLitePresenter` (30+ tables) | ❌ Still uses `better-sqlite3` |
| `~12 presenters` wired to SQLitePresenter | ❌ Still call table methods directly |
| Legacy `presenter:call` IPC | ❌ Still exposes SQLitePresenter to renderer |

## Remaining `better-sqlite3` footprint

All in `apps/desktop/`:
- `sqlitePresenter/index.ts` — `new Database(dbPath)`, the main entry point
- `sqlitePresenter/connectionConfig.ts` — type only
- `sqlitePresenter/importData.ts` — `new Database()` for backup restore
- `sqlitePresenter/schemaCatalog.ts`, `schemaRepair.ts`, `schemaTypes.ts` — type only
- `sqlitePresenter/tables/*.ts` (25 files) — type only (`Database.Database`)
- `syncPresenter/index.ts` — `new Database()` for backup reading
- `syncPresenter/configImportService.ts` — type only
- `agentSessionPresenter/legacyImportService.ts` — `new Database()` for legacy chat.db
- ~15 test files — mocks and integration tests

## Migration phases

### Phase 1 ✅ (complete)
Encryption removal, package swap, dead code cleanup, databaseSecurity routes to daemon.

### Phase 2 ✅ (complete)
`providerImportService` decoupled — daemon injects `bun:sqlite` reader via `SqliteReaderFactory`.

### Phase 3: Shared DB types
Create a `DatabaseLike` interface in `@argos/shared` that both `better-sqlite3` and
`bun:sqlite` satisfy (`prepare`, `exec`, `pragma`, `transaction`). Replace all 25+ table
modules' `import Database from "better-sqlite3"` with `import type { DatabaseLike }`.
This is a pure type-level change — no runtime impact.

### Phase 4: Migrate config storage to daemon
The `ConfigPresenter` currently stores config in the desktop DB via `configTables`.
The daemon already has `config.*` routes backed by `app_settings`. Wire the desktop
config presenter to call daemon routes instead of local DB tables.

### Phase 5: Migrate session/message presenters to daemon
`AgentSessionPresenter`, `AgentRepository`, `MessageManager` are the biggest consumers.
The daemon already handles `sessions.*`, `chat.*` routes. The desktop presenters need to
either:
(a) Delegate to daemon routes via `invokeDaemonRoute`, or
(b) Be eliminated entirely (UI uses typed clients → daemon).

### Phase 6: Migrate sync/memory/export to daemon
- `SyncPresenter` — backup/restore should operate on the daemon's DB
- `MemoryPresenter` — daemon already has `memory.*` routes
- `ConversationExporterService` — export should read from daemon

### Phase 7: Remove SQLitePresenter + `better-sqlite3`
- Delete `apps/desktop/src/main/presenter/sqlitePresenter/` entirely
- Remove `databaseInitHook` DB creation (or make it a no-op)
- Remove `"sqlitePresenter"` from `DISPATCHABLE_PRESENTERS`
- Remove `better-sqlite3` + `@types/better-sqlite3` from `package.json`
- Remove `better-sqlite3` from `allowBuilds` in `pnpm-workspace.yaml`
- Delete the `patches/` directory entry

## Acceptance criteria

1. `rg "better-sqlite3"` returns zero results (excluding `node_modules`, lockfile, archives)
2. The desktop Electron process opens no SQLite database file
3. All data flows through the daemon's `bun:sqlite`-backed routes
4. `pnpm run typecheck`, `pnpm run lint`, `pnpm test` pass

## Non-goals

- Migrating the legacy `presenter:call` IPC system itself (it can remain as a thin proxy
  to daemon routes, or be phased out separately).
- Changing the daemon's database schema or migration system.
