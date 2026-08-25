# Desktop SQLite Migration Replay Spec

## Problem

Every desktop launch replays the full schema migration history (versions 11–30, hundreds of
`Executing SQL:` lines) even when no migrations are pending.

## Root Cause

The desktop shell delegates persistence to the daemon (`<dataDir>/argos.db`); the local SQLite
layer was stubbed out during de-electronification:

- `openSQLiteDatabase()` ignores its `dbPath` argument and returns a fresh in-memory `NullDatabase`
  (`apps/desktop/src/main/presenter/sqlitePresenter/index.ts`).
- `SQLitePresenter.initializeDatabase()` still runs the real-database sequence against that
  throwaway instance on every launch: connection probe, table DDL, `initVersionTable()`
  (`MAX(version)` → always `0`) and `migrate()` (replays every defined migration).

The result is simulated work plus misleading log noise; nothing persists.

## Acceptance Criteria

- Constructing `SQLitePresenter` while persistence is disabled (stub backend) does not run schema
  versioning or migration replay (no `Executing migration version` output).
- All public table helper properties are still constructed so existing consumers are unaffected.
- The real-database path is unchanged: probe, table creation, version tracking, and migrations all
  still run when a non-stub database is returned.

## Non-Goals

- No changes to migration SQL, the daemon database, or any consumer of `SQLitePresenter`.
- No restoration of a local desktop database (the daemon is the source of truth by design).
