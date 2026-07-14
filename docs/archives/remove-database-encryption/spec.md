# Remove Database Encryption

## Goal

Remove the entire SQLCipher database-encryption feature (UI, routes, presenter,
startup unlock flow, password threading, safeStorage wrapping) so the SQLite
layer is a plain unencrypted database. This unblocks a future migration to the
Bun SQLite client, which has no SQLCipher support.

## Background

The encryption feature spans the whole stack:

- **Shared contracts**: `databaseSecurity.getStatus/enable/changePassword/disable`
  routes, `DatabaseSecurityStatus` schema, and the `databaseSecurity.ts` unlock
  IPC channels.
- **Main process**: `DatabaseSecurityPresenter` (SQLCipher migration, safeStorage
  password wrap/unwrap), the startup unlock flow in `databaseInitHook`, the
  splash unlock UI in `SplashWindowManager`, password plumbing in
  `SQLitePresenter` / `connectionConfig` / `DatabaseInitializer`, and encryption
  route handlers in `routes/index.ts`.
- **UI**: the "Database Encryption" section in `DataSettings`, encryption methods
  in `DatabaseSecurityClient`, and the splash unlock form in `Loading.tsx`.

## In scope

- Remove the "Database Encryption" card from Data & Privacy (keep Database
  Repair, Provider Import, Model Config Update, Danger Zone, Sandbox Data).
- Remove the four encryption routes + their `DatabaseSecurityStatus` /
  `DatabaseSecurityPasswordStorage` schemas and types.
- Delete `DatabaseSecurityPresenter` and the `databaseSecurity.ts` unlock
  channel module.
- Remove the startup unlock flow (splash unlock form, `SplashWindowManager`
  unlock state/listeners, `databaseInitHook` password resolution).
- Remove the `password` parameter from `SQLitePresenter`,
  `DatabaseInitializer`, `openSQLiteDatabase`, `repairSQLiteDatabaseFile`, and
  the SQLCipher `connectionConfig` helpers.
- Remove encryption-specific tests; keep/adjust Database Repair tests.

## Out of scope

- Swapping the `better-sqlite3-multiple-ciphers` driver for `bun:sqlite` (a
  separate task this removal enables).
- The Database Repair / schema diagnosis feature (kept as-is).
- Cloud sync secrets (those use safeStorage independently and are unrelated).

## Acceptance criteria

1. No references to SQLCipher, `databaseEncryption`, `DatabaseSecurityStatus`,
   `reopenWithPassword`, or the unlock channels remain in source.
2. `pnpm run typecheck`, `pnpm run lint`, and `pnpm test` pass.
3. The app starts without prompting for a database password.
4. Database Repair still works from the Data & Privacy page.

## Non-goals

- Migrating existing encrypted user databases to plaintext (no migration path;
  the feature is being dropped wholesale).
