# electron-vite → vite-plugin-electron — Specification

## Goal

Replace the `electron-vite` CLI framework (v5.0.0) with the `vite-plugin-electron` Vite
plugin (v1.0.4+) so the desktop app can build on Vite 8 (Rolldown) without depending on a
framework that lags upstream Vite releases. At the same time, bump Electron 40 → 42 and
refresh the related Electron ecosystem dependencies to their latest compatible versions.

## Motivation

- `electron-vite` is a CLI wrapper that maintains its own `defineConfig` shape and is the
  slowest path to new Vite features. Vite 8 (Rolldown) is already in the catalog but unused
  by `electron-vite`'s opinionated config.
- `vite-plugin-electron` is the official companion from the same author, integrates as a
  standard Vite plugin, supports Vite 7 and 8, and ships a multi-environment API that fits
  Vite 8's Environment API.
- Electron 42 brings Chromium 148, Node 24.15, V8 14.8, native notification API on macOS,
  on-demand binary download, and other improvements.
- The catalog still pins `electron-vite@5.0.0` and `electron@^40.10.0`; both are due for an
  update.

## Scope

### In Scope

- Swap `electron-vite` (CLI) for `vite-plugin-electron` (plugin) using the **multi-env API**
  (`vite-plugin-electron/multi-env`).
- Migrate `apps/desktop/electron.vite.config.ts` to `apps/desktop/vite.config.ts` preserving:
  - Multi-entry main (`index.ts`, `backgroundExecUtilityHostEntry.ts`).
  - Multi-entry preload (`index`, `splash`, `floating`, `browser-overlay`, `plugin-settings`).
  - Multi-page renderer (`index`, `browser-overlay`, `floating`, `splash`, `settings`).
  - Native dependency externalization (`sharp`, `@duckdb/node-api`,
    `better-sqlite3-multiple-ciphers`, `node-pty`, plus all production deps) and bundling
    of `mermaid`.
  - Build output layout: `out/main/`, `out/preload/`, `out/renderer/` with the existing
    filenames (camelCase preload keys, `.mjs` suffix for preload, `.js` for main).
- Update CLI scripts: `dev`, `dev:inspect`, `dev:linux`, `build`, `start`.
- Preserve build-time env semantics: `VITE_*` variables continue to be inlined into the main
  bundle (so OAuth secrets, provider DB URL, etc. keep working).
- Preserve dev-mode renderer URL semantics: main/preload continue to read the dev server URL
  from `process.env`.
- Full source refactor (no compat shims):
  - `__dirname` → `fileURLToPath(import.meta.url)` in `src/main/**`.
  - `process.env.ELECTRON_RENDERER_URL` → `process.env.VITE_DEV_SERVER_URL`.
  - `import.meta.env.VITE_*` in main → `process.env.VITE_*` (with `define` inlining).
- Bump `electron` 40 → 42 in the catalog.
- Bump `electron-builder`, `electron-store`, `electron-updater`,
  `@electron-toolkit/tsconfig` to their latest compatible versions.
- Update auxiliary references: `tsconfig.node.json`, `tsconfig.app.json`,
  `tsconfig.app.tsgo.json`, `electron-builder.yml`, `.oxfmtrc.json`.
- Update tests that reference the config filename or `ELECTRON_RENDERER_URL`.
- Clean up stale `@browser/` alias and `src/renderer/browser/**` includes that reference
  non-existent files.

### Out of Scope

- Any change to runtime behavior, UI, or feature surface.
- Migrating away from `@electron-toolkit/utils` / `@electron-toolkit/preload` (they are
  runtime helpers and unaffected by the build tool).
- Migrating to `electron-forge` or any other builder — `electron-builder` stays.
- Bumping non-Electron deps unrelated to the build tool swap.
- Updating `AGENTS.md` to keep repository guidance aligned with the current React app.

## Constraints

- **Output layout is a hard contract.** `apps/desktop/package.json#main`,
  root `package.json#main`, 8 main-process preload-loading sites, 7 main-process
  renderer-loading sites, the Playwright fixture (`test/e2e/fixtures/electronApp.ts`), and
  `backgroundExecSessionManager` all hardcode paths under `out/main/`, `out/preload/`,
  `out/renderer/`. These paths must remain identical after the migration.
- **Preload output filenames are a hard contract.** The 5 preload entry keys
  (`index`, `splash`, `floating`, `browserOverlay`, `pluginSettings`) and the `.mjs`
  extension are referenced by name in 8 main-process sites. Renaming any of them breaks
  the app.
- **Vite 8 uses `rolldownOptions`, not `rollupOptions`.** Every `build.rollupOptions` in
  the current config must become `build.rolldownOptions` or it will be silently ignored.
- **Env semantics must be preserved.** Today `import.meta.env.VITE_GITHUB_CLIENT_ID` etc.
  are statically replaced in the main bundle at build time. After migration the same values
  must be inlined into `process.env.VITE_*` at build time via `define`.
- **ESM-only project.** `"type": "module"` everywhere. `__dirname` is not available
  natively in the ESM main bundle; either define it via shim or convert to
  `fileURLToPath(import.meta.url)`. This spec picks the conversion path.
- **Electron 42 breaking changes that touch this codebase**: none. Verified by source
  audit: no `quotas` option on `clearStorageData`, no `ELECTRON_SKIP_BINARY_DOWNLOAD`,
  no `nativeImage.createFromNamedImage`, no offscreen rendering.

## User Stories

### US-1: Build parity

**As a** developer,
**I want** to run `pnpm --filter @argos/desktop build` and get an identical output tree
under `apps/desktop/out/`,
**So that** packaging scripts, e2e fixtures, and CI continue to work unchanged.

**Acceptance Criteria:**

- `out/main/index.js` and `out/main/backgroundExecUtilityHost.js` are emitted as separate,
  non-chunked ESM entries.
- `out/preload/{index,splash,floating,browserOverlay,pluginSettings}.mjs` all exist.
- `out/renderer/{index,browser-overlay,floating,splash,settings}/index.html` all exist.
- `out/renderer/monacoeditorwork/` exists with the same workers as today.
- `apps/desktop/package.json#main` (`./out/main/index.js`) still resolves to a runnable
  main process.
- Native deps (`sharp`, `@duckdb/node-api`, `better-sqlite3-multiple-ciphers`, `node-pty`)
  remain external — no bundling regressions.
- `mermaid` continues to be bundled into main when imported transitively.

### US-2: Dev experience parity

**As a** developer,
**I want** to run `pnpm --filter @argos/desktop dev` and get the same hot-reload behavior,
**So that** my workflow is unchanged.

**Acceptance Criteria:**

- Renderer HMR works for React components.
- Editing a main-process source file rebuilds main and restarts Electron automatically.
- Editing a preload source file rebuilds preload and reloads the affected windows.
- `dev:inspect` opens the Node Inspector on port 9229.
- `dev:linux` runs without sandbox errors on Linux.
- `process.env.VITE_DEV_SERVER_URL` is set in dev so the main process loads the dev server.

### US-3: Runtime env parity

**As a** maintainer,
**I want** the main process to read the same `VITE_*` env values it does today,
**So that** OAuth flows, provider DB fetching, IPC logging, and lifecycle hook delay
continue to work without code changes beyond the import path.

**Acceptance Criteria:**

- `process.env.VITE_GITHUB_CLIENT_ID` (and the other GitHub OAuth vars) resolves to the
  value from `.env` at build time.
- `process.env.VITE_PROVIDER_DB_URL` resolves to the value from `.env`.
- `process.env.VITE_LOG_IPC_CALL` and `process.env.VITE_APP_LIFECYCLE_HOOK_DELAY` resolve
  to the value from `.env`.
- Renderer `import.meta.env.VITE_*` continues to work natively.

### US-4: Electron 42 upgrade

**As a** maintainer,
**I want** the app on the latest Electron major,
**So that** we pick up Chromium 148, Node 24.15, security fixes, and the new notification
API.

**Acceptance Criteria:**

- `electron` catalog version is `^42.0.0`.
- App launches, loads windows, and all preload/renderer paths resolve.
- macOS notifications still fire (tested manually; Electron 42 requires code-signing for
  notifications — verify in dev with ad-hoc signing).
- Native modules rebuild against Electron 42's headers via
  `electron-builder install-app-deps` without errors.

### US-5: Dependency refresh

**As a** maintainer,
**I want** `electron-builder`, `electron-store`, `electron-updater`,
  `@electron-toolkit/tsconfig` on their latest compatible versions,
**So that** we benefit from bug fixes and remain on supported releases.

**Acceptance Criteria:**

- `electron-builder` catalog version is `^26.15.3`.
- `electron-store` catalog version is `^11.0.2`; existing usages (no `schema:` option)
  continue to work.
- `electron-updater` catalog version is `^6.8.9`.
- `@electron-toolkit/tsconfig` is `^2.0.0`.

## Non-Goals

- No new features, no UI changes, no IPC contract changes.
- No change to packaging output (`dist/`, AppImage, DMG, NSIS).
- No change to the `apps/daemon` build.
- No change to plugin bundling pipeline.
- No migration of the stale AGENTS.md (filed separately).

## Open Questions

All resolved before implementation start:

- **Q**: Multi-env vs simple API? **A**: Multi-env (per user). Forward-looking, Vite 8 fit.
- **Q**: Risk tolerance for the three compat-shim areas? **A**: Full refactor (per user).
- **Q**: Stale `@browser/` cleanup in scope? **A**: Yes (per user).
- **Q**: Catalog pin `vite-plugin-electron`? **A**: Yes (per user).
- **Q**: Electron 42 and related dep bumps in scope? **A**: Yes (per user, this spec).
