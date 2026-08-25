# Desktop SQLite Migration Replay Plan

## Change

`apps/desktop/src/main/presenter/sqlitePresenter/index.ts` — `initializeDatabase()` detects the
in-memory no-op backend (`this.db instanceof NullDatabase`) and skips the probe,
`initVersionTable()`, and `migrate()` steps, logging one explanatory line instead. Table helpers
are still constructed in all cases.

## Rationale

Guarding inside `SQLitePresenter` covers every construction site (lifecycle hook, sync import,
tests) rather than patching individual callers, and keeps runtime behavior identical except for
the removal of simulated migration work.

## Tests

- `apps/desktop/test/main/presenter/sqlitePresenter.test.ts`
  - Stub-backed construction emits no migration replay logs.
  - Table helpers remain available for consumers.
