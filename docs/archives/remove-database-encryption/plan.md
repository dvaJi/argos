# Plan: Remove Database Encryption

## Approach

Bottom-up removal: contracts first, then main-process plumbing, then UI, then
tests. Keep the `databaseSecurity.diagnoseSchema` / `repairSchema` routes and
the `DatabaseRepairReport` / `DatabaseSchemaDiagnosis` types (used by Database
Repair).

## Affected surfaces

### Shared contracts (`packages/shared-contracts/src`)

- `routes/database-security.routes.ts`: delete `databaseSecurityGetStatusRoute`,
  `databaseSecurityEnableRoute`, `databaseSecurityChangePasswordRoute`,
  `databaseSecurityDisableRoute`, `DatabaseSecurityStatusSchema`,
  `DatabaseSecurityPasswordStorageSchema`, `DatabaseSecurityStatus`,
  `DatabaseSecurityPasswordStorage`. Keep diagnose/repair.
- `routes.ts`: drop the four encryption route imports + catalog entries.
- `databaseSecurity.ts`: delete the file (unlock channels + types).
- `index.ts`: drop `export * from "./databaseSecurity"`.

### Main process (`apps/desktop/src/main`)

- `presenter/databaseSecurityPresenter/`: delete the directory.
- `presenter/index.ts`: remove import, field, construction, runtime wiring.
- `presenter/lifecyclePresenter/hooks/init/databaseInitHook.ts`: drop unlock
  flow; construct `DatabaseInitializer` without a password.
- `presenter/lifecyclePresenter/DatabaseInitializer.ts`: drop `password`.
- `presenter/lifecyclePresenter/SplashWindowManager.ts`: drop unlock state,
  `setupDatabaseUnlockListeners`, `emitDatabaseUnlockState`,
  `showDatabaseUnlockProgress`, `requestDatabaseUnlock`, imports.
- `presenter/sqlitePresenter/index.ts`: drop `password` param/field,
  `reopenWithPassword`, `getDatabasePassword`.
- `presenter/sqlitePresenter/connectionConfig.ts`: keep only WAL setup; drop
  SQLCipher helpers.
- `presenter/configPresenter/index.ts`: drop
  `cleanupLegacyProviderJsonForDatabaseEncryption`.
- `routes/index.ts`: drop the four encryption case handlers, the
  `databaseSecurityPresenter` runtime fields, simplify
  `getDatabaseSecuritySQLitePresenter` (only diagnose/repair need it).

### Shared presenter types (`packages/shared`)

- `types/presenters/legacy.presenters.d.ts`: drop
  `showDatabaseUnlockProgress` / `requestDatabaseUnlock` from
  `ISplashWindowManager`.

### UI (`packages/ui`)

- `settings/components/DataSettings.tsx`: remove the Database Encryption card +
  all encryption state/memos/handlers/effects. Keep Database Repair.
- `api/DatabaseSecurityClient.ts`: drop `getStatus/enable/changePassword/disable`
  + the `DatabaseSecurityStatus` import. Keep diagnose/repair.
- `splash/Loading.tsx`: remove the unlock form/modes; keep the loading view.
- `splash/loading.css`: remove `.splash-unlock*` rules.

## Compatibility

- Existing encrypted `agent.db` files will no longer be openable (by design;
  the feature is dropped). No automatic migration.
- `better-sqlite3-multiple-ciphers` remains as the driver (drop-in); the actual
  Bun SQLite swap is a follow-up.

## Test strategy

- Delete `test/main/presenter/databaseSecurityPresenter.test.ts`.
- Adjust `test/main/presenter/sqlitePresenter.connectionConfig.test.ts`,
  `DatabaseInitializer.test.ts`, `SplashWindowManager.display.test.ts`.
- Trim encryption cases from `test/renderer/components/DataSettings.test.tsx`.
- Trim unlock cases from `test/renderer/splash/Loading.test.tsx`.
- Verify `pnpm run typecheck`, `pnpm run lint`, `pnpm test`.
