# Desktop SQLite Migration Replay Tasks

- [x] Guard `SQLitePresenter.initializeDatabase()` against the no-op backend; skip versioning +
      migration replay.
- [x] Add regression tests (`test/main/presenter/sqlitePresenter.test.ts`).
- [x] Verify `bun run test:main`, typecheck, lint, format.
