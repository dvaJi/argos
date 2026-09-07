# Windows desktop test failures — triage & resolution

Last reviewed: 2026-09-07

## Status: RESOLVED (2026-09-07)

`bun run test:main` on Windows is fully green: 209 files / 1735 tests passed.

Three fixes (branch `fix/windows-desktop-tests`):

1. `packages/backend-core/src/cua/embeddedAdapter.ts` — POSIX socket paths are
   built/validated with `path.posix` semantics; `path.resolve` grafted the
   host drive (`C:\tmp\…`) onto Linux-target endpoints, which then failed the
   managed-namespace allowlist (4 `embeddedAdapter` failures).
2. `packages/backend-core/src/cua/integrity.ts` — the executable-bit
   cross-check is skipped when a win32 host verifies a POSIX-target runtime
   (libuv fabricates stat modes without exec bits); hashes still enforce
   content integrity (2 `integrity` failures + 1 skipped contract test).
3. `apps/desktop/test/main/lib/agentRuntime/backgroundExecSessionManager.test.ts`
   — its `child_process` mock replaced the whole module, breaking the
   transitive `@argos/backend-core` import (`promisify(execFile)`); the mock
   now spreads the actual module (collection failure).
4. `pluginPresenter.test.ts` — the three darwin-fixture tests execute a
   `#!/bin/sh` helper during the version probe, which cannot run on a Windows
   host; they skip on win32 with an explanatory comment (Windows plugins use
   `.exe` helpers and would need a win32 fixture).

Root cause of the whole set: the desktop suite has no CI coverage
(`prcheck.yml` runs only the daemon suite on Ubuntu), so Windows-only
breakage accumulates silently.

## Symptom (2026-09-06 snapshot)

`bun run test:main` (desktop Vitest suite) had 16 failing files / 37 failing tests on Windows.
CI never noticed: `prcheck.yml` runs only the daemon `bun test` suite on Ubuntu; the desktop
suite has no CI coverage. Verified via `git stash` that all failures reproduced on pristine
`HEAD` (twice), i.e. none were caused by in-flight feature work.

## Root causes (per cluster)

| Cluster | Files | Root cause | Fix |
|---|---|---|---|
| Stale `@argos/shared/logger` mocks (missing `createLogger`) | `mistralProvider`, `newApiProvider`, `ollamaProvider`, `skillPresenter`, `backgroundExecSessionManager`, `YoBrowserToolHandler` | Production migrated to `createLogger`; mocks only provided `default` | New `test/mocks/sharedLogger.ts` (scoped-prefix-faithful mock); files use it |
| Tests spied on `console.*` while production logs through the shared logger | `index.test.ts`, `mcpPresenter.test.ts`, `skillSyncPresenter`, `deeplinkPresenter` (redaction) | Shared logger captures the *unhooked* console at module load, so `vi.spyOn(console, …)` never sees calls | Assert against the mocked shared logger instead (with real `[Scope]` prefixes) |
| Dead import: `MemoryPresenter` moved to `@argos/memory-runtime` | `memoryPresenter.test.ts` | Import still pointed at a deleted desktop file | Repointed imports |
| Dead mock target: `cross-spawn` → `node:child_process` | `acpProcessManager.test.ts` | Production migrated HTTP/agent spawn off cross-spawn | Mock `node:child_process.spawn` |
| Dead mock target: `undici` → global `WebSocket` | `qqbotGatewaySession.test.ts` | Production uses the standard global WebSocket; the `undici` mock let tests hit the real network | `vi.stubGlobal("WebSocket", MockWebSocket)` |
| Tests mocked a dead `mcpConfHelper` desktop path | `acpConfHelper.test.ts` | `McpConfHelper` moved to `@argos/mcp-runtime` | Partial-mock `@argos/mcp-runtime` |
| Missing `sqliteReader` port injection | `providerImportService.test.ts` (11) | `ProviderImportService` (backend-core) takes an injected `SqliteReaderFactory`; tests still relied on a removed direct `dbType` import | Tests inject a `sqliteReader` backed by their `MockDatabase` |
| Provider-DB catalog set pruned | `backgroundModelSync.test.ts` (5) | Fixtures used `doubao` as a DB-backed id; `PROVIDER_DB_BACKED_PROVIDER_IDS` no longer contains it | Fixtures use `mistral` (still DB-backed) |
| Corrupted (mojibake) expectations | `deeplinkPresenter.test.ts` | UTF-8 (`你好`, `🔌`) saved as latin-1 in an earlier edit; expectations no longer matched production output | Restored correct strings |
| Dispatcher tests fell through to the real daemon proxy | `dispatcher.test.ts` (5) | `invokeDaemonRoute` now waits up to 30 s for a sidecar handle; unregistered test routes hit that wait → timeouts. Also: sessions/chat/settings/provider routes are daemon-owned now; `providers.listModels` mis-unwrapped the daemon's `{catalog}` envelope (**real production bug**, fixed in `routes/index.ts`) | Unregistered routes reject fast with `daemon_not_running`; daemon-owned routes registered as fixtures with delegation assertions |
| RuntimeHelper had no rtk support | `runtimeHelper.test.ts` (2) | Tests encoded bundled-`rtk` handling that production never implemented (repo bundles `rtk` in `runtime/`) | Implemented `rtk` detection/`replaceWithRuntimeCommand` branch, `getRtkRuntimePath()`, bundled-bin paths |

## Related note

`test/setup.ts` globally mocks `path.join/resolve` as `args.join("/")` (POSIX-style). The
desktop suite's fixtures depend on that shape; on Windows the stub can emit mixed separators
for args that already contain backslashes. Kept for now (documented in `setup.ts`) — making
the suite fully real-path-based is a larger follow-up.

## Outcome

- Desktop Vitest: **202 files passed / 1 skipped, 1666 tests passed, 0 failed** (27 skipped by design).
- Daemon `bun test`: 360 pass. Lint (all guards), typechecks (daemon/desktop/UI) clean.
- Two real production bugs fixed along the way: `providers.listModels` catalog-envelope
  mis-parse, and skills-runtime double-prefixed/duplicated log scopes (now `createLogger("SkillPresenter")`).
