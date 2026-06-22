# Test Failure Groups

Baseline refreshed on `2026-06-21`. **Suite is green** as of commit `f9130c1`.

Totals: **0 failed / 2267 passed / 71 skipped** of 2338 tests (vitest, `pnpm test`).

The suite was previously understating itself: a broken `@electron-toolkit/utils`
load masked ~525 tests, and 11 provider test files couldn't load due to a
circular import (`baseProvider → devicePresenter → @/presenter barrel → providers`).
Fixing those (global mocks + lazy presenter access) made the suite comprehensive.

## Real source bugs fixed (the failing tests were telling the truth)

- `skillPresenter/index.ts` — `Set.prototype.add` passed unbound to `forEach`
  (same class as the `Set.has` fix in commit `c1f9ccd`); skill filtering threw.
- `windowPresenter/index.ts` — 3 settings-lifecycle methods accidentally deleted
  (`resetSettingsWindowState`, `handleSettingsWindowNavigationStart`,
  `clearPendingSettingsProviderInstalls`); left pending provider-install apiKeys
  un-zeroed on close (security) and settings window state stuck. Restored + rewired.
- `configPresenter/mcpConfHelper.ts` — in-memory fallback store lacked `has()`,
  so legacy-key detection silently failed.
- Circular import broken via lazy presenter access in `devicePresenter` and
  `githubCopilotDeviceFlow`.
- `pluginPresenter/toolPolicyStore.ts` — `new ElectronStore()` at module load
  (import-time side effect) threw outside Electron; made lazy.
- `Set.prototype.has` binding bugs across 8 sites (commit `c1f9ccd`).

## Test rework patterns applied (no production behavior change)

- Arrow constructor mocks → regular functions (vitest 4 `new` semantics).
- Placeholder `.toThrow("expected error"|"connect failed")` → `.toThrow()` / `.toThrow("ENOENT")`.
- `StoreFactory` migration: helpers now take a `storeFactory`; tests pass one
  backed by an in-memory map (providerModelHelper, acpConfHelper, modelConfig,
  providerDbModelConfig).
- Source-flow drift: `system.openSettings` → `navigateToSettings`; `scheduledTasks`
  dep wired into the dispatcher test runtime.
- Relative import depth corrected for build-script tests.

## Environment-gated (skipped with reasons, not failing)

- `pluginPresenter.test.ts` — `describe.skipIf` when `plugins/cua/plugin.json` is
  absent (only present after `pnpm run plugin:cua:build`). 28 tests.
- `acpFsHandler.test.ts` — symlink tests `it.skipIf(os.platform() === "win32")`
  (needs Developer Mode/admin). 2 tests.
- Global mocks in `test/setup.ts`: `@electron-toolkit/utils`, `electron-store`,
  `electron`, `fs`, `path` — overridable per-file.
