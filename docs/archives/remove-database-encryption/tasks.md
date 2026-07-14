# Tasks: Remove Database Encryption

1. [x] SDD artifacts
2. [x] Shared contracts: prune encryption routes/types, delete `databaseSecurity.ts`
3. [x] Main: strip password/SQLCipher from `connectionConfig` + `sqlitePresenter`
4. [x] Main: delete `DatabaseSecurityPresenter`; unwire from `presenter/index.ts`
5. [x] Main: simplify `databaseInitHook` + `DatabaseInitializer` (no password)
6. [x] Main: remove unlock flow from `SplashWindowManager`
7. [x] Main: remove encryption route handlers + runtime field in `routes/index.ts`
8. [x] Main: drop `cleanupLegacyProviderJsonForDatabaseEncryption`
9. [x] Shared types: trim `ISplashWindowManager`
10. [x] Main: strip encryption/password from `syncPresenter`
11. [x] SDK: strip encryption stubs from `client-sdk` (http-client, websocket-bridge)
12. [x] UI: trim `DataSettings.tsx` + `DatabaseSecurityClient.ts`
13. [x] UI: trim splash `Loading.tsx` + `loading.css`
14. [x] Tests: update/delete affected suites
15. [x] Swap `better-sqlite3-multiple-ciphers` → `better-sqlite3@12.11.1` (no patch needed)
16. [x] Clean up leftover SQLCipher code in `electronDatabase.ts` + `IDatabaseProvider`
17. [x] Move `databaseSecurity.diagnoseSchema` + `repairSchema` to daemon (`bun:sqlite`)
18. [x] `pnpm run format` + `pnpm run lint` + `pnpm run typecheck` pass
