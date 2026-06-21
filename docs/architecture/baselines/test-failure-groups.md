# Test Failure Groups

Baseline refreshed on `2026-06-21`.

Totals: **169 failed / 2047 passed / 71 skipped** of 2287 tests (vitest, `pnpm test`).

> Note: an `@electron-toolkit/utils` module-load failure previously masked ~525
> tests. Fixing it (global mock in `test/setup.ts`, 2026-06-21) made the suite
> comprehensive and is what raised the total from ~1762 to 2287. Most of the
> previously hidden tests pass; the failures below are genuine pre-existing drift.

## Fixed in the 2026-06 cleanup pass

- Global `@electron-toolkit/utils` mock in `test/setup.ts` — unblocked 20+ tests
  across `sqlitePresenter`/`windowPresenter`/`YoBrowserPresenter` and revealed the
  rest of the suite.
- `acpProvider.test.ts` — connection mocks migrated to `connection.agent.request`
  (masked regression from the ACP SDK 0.28 migration). 23/23 pass.
- Placeholder throw assertions (`.toThrow("expected error")` / `"connect failed"`)
  replaced across `catalogGuards`, `routes/contracts`, `channelPluginManifest`,
  `serverManager`, `channelAdapter`, `agentFileSystemHandler`, `createBridge`,
  `dispatch` (now `"ENOENT"`), `acpFsHandler`.
- `sessionPaths` — expected path built with `path.resolve` (Windows drive-letter).
- `acpSessionManager.test.ts` — updated to `connection.agent.request` API.

## Environment-gated (skipped, not failing)

- `pluginPresenter.test.ts` — `describe.skipIf` when `plugins/cua/plugin.json` is
  absent (only present after `pnpm run plugin:cua:build`). 28 tests.
- `acpFsHandler.test.ts` — symlink tests `it.skipIf(os.platform() === "win32")`
  (needs Developer Mode/admin). 2 tests.

## Remaining — shared root causes (highest leverage, investigate first)

- **`Set.prototype.has` called on incompatible receiver** — `agentRuntimePresenter.test.ts` (12),
  `skillPresenter/skillPresenter.test.ts` (17), `toolPresenter/toolPresenter.test.ts` (5).
  Looks like one mock-binding pattern losing `this` on a shared `Set`; ~34 failures.
- **`Cannot read properties of undefined (reading '0')`** — `agentRuntimePresenter.test.ts` (25).
  Indexing into an undefined array; likely a shared mock returning the wrong shape.

## Remaining — mock-constructor / wiring drift

- `KnowledgePresenter.test.ts` (16) — "is not a constructor" mock setup.
- `routes/dispatcher.test.ts` (14) — `setSessionCreator` / route registration changed.
- `agentSessionPresenter/integration.test.ts` (13) — `configPresenter.getAgentType()` hard dependency + call-count drift.
- `mcpPresenter.test.ts` (9), `builtinKnowledgeServer.test.ts` (3), `mcpClient.test.ts` (1) — stale MCP runtime mocks.
- `configPresenter/acpConfHelper.test.ts` (3), `mcpConfHelper.test.ts` (1), `providerModelHelper.test.ts` (5) — assertion/value drift.
- `deeplinkPresenter.test.ts` (5) — mock call-signature drift.
- `lifecyclePresenter/DatabaseInitializer.test.ts` (1), `remoteControlPresenter.test.ts` (1) — constructor/connection mock.
- `windowPresenter.test.ts` (2) — settings-navigation queue + `resetSettingsWindowState` not a function.
- `sqlitePresenter.connectionConfig.test.ts` (2) — SQLCipher/WAL path needs the native binary.

## Remaining — build-script / fixture resolution

- `scripts/afterPack.test.ts` (2), `scripts/signCuaHelper.test.ts` (2) — `Cannot find module '/scripts/...'` (absolute-path import resolves differently under vitest).

## Remaining — single assertion drift (low effort each)

- `modelConfig.test.ts` (1), `providerDbModelConfig.test.ts` (1), `SyncPresenter.test.ts` (1),
  `YoBrowserPresenter.test.ts` (1, timeout on dom-ready).

## Historical renderer notes (carry-over from 2026-04-03)

- `jsdom` navigation not implemented in several renderer tests — environment
  limitation, not a business-behavior error.
- `pinia` mocks in renderer store tests can pollute `setActivePinia/createPinia`.
