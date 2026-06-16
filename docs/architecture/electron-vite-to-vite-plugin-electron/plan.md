# electron-vite → vite-plugin-electron — Implementation Plan

## Architecture Decisions

### AD-1: Multi-env API

Use `electronSimple({ main, preload })` from `vite-plugin-electron/multi-env`. It maps
cleanly onto Vite 8's Environment API, supports `notBundle: true` natively (the
`externalizeDeps` equivalent), and allows per-environment `define`. The renderer lives at
the root of the Vite config (standard multi-page setup) and the plugin spawns Electron on
`closeBundle()`.

Fallback: if `electronSimple` from `/multi-env` proves unstable in Phase 7 verification,
switch the import to `electron` from `/simple`. The config shape is nearly identical.

### AD-2: Full source refactor (no shims)

Per user decision, we do the cleaner refactor:

1. `__dirname` in `src/main/**` → `fileURLToPath(import.meta.url)` + `dirname()`. Add the
   standard ESM `__dirname` reconstruction at the top of each affected file. ~15 sites.
2. `process.env.ELECTRON_RENDERER_URL` → `process.env.VITE_DEV_SERVER_URL` (8 source sites
   + 3 test sites). The plugin sets `VITE_DEV_SERVER_URL` automatically.
3. `import.meta.env.VITE_*` in `src/main/**` → `process.env.VITE_*` (7 source files). The
   values are inlined at build time via a `define` map generated from `loadEnv()` in
   `vite.config.ts`. Renderer `import.meta.env.VITE_*` is untouched — Vite handles it.

### AD-3: Build-time env inlining

In `vite.config.ts`, the main environment uses:

```ts
const env = loadEnv(mode, process.cwd(), '')
const processEnvDefines = Object.fromEntries(
  Object.entries(env)
    .filter(([k]) => k.startsWith('VITE_'))
    .map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])
)
// …
main: {
  options: { define: processEnvDefines, /* … */ }
}
```

This preserves electron-vite's behavior of statically inlining `VITE_*` values from `.env`
into the main bundle. Sensitive secrets never appear in source or in git.

### AD-4: Preload output filenames

With `"type": "module"`, vite-plugin-electron emits preload as CJS with `.mjs` suffix.
The entry **key** becomes the output filename. The current electron-vite config uses
camelCase keys (`browserOverlay`, `pluginSettings`). To preserve these names exactly,
prefer the object form for the preload input if the array form flattens keys:

```ts
preload: {
  input: {
    index:          'src/preload/index.ts',
    splash:         'src/preload/splash-preload.ts',
    floating:       'src/preload/floating-preload.ts',
    browserOverlay: 'src/preload/browser-overlay-preload.ts',
    pluginSettings: 'src/preload/plugin-settings-preload.ts',
  },
  // …
}
```

The exact form (array vs object) will be validated empirically in Phase 7.

### AD-5: Native deps externalization

`notBundle: true` in `main` matches `externalizeDeps` semantics (deps + devDeps in dev,
deps in prod). For belt-and-suspenders, also pass `external: ['sharp', '@duckdb/node-api']`
in `main.options.build.rolldownOptions` — matches the current config.

`mermaid` (the only `externalizeDeps` exclude) is in `devDependencies` and only imported
from the renderer, so it is naturally bundled if transitively reached from main. With
multi-env `notBundle: true`, no extra filter is required; if a regression appears, switch
to `notBundle: { filter: (id) => id !== 'mermaid' }`.

### AD-6: CLI script mapping

| Old | New | Notes |
|---|---|---|
| `electron-vite dev --watch` | `vite` | `--watch` is implicit (plugin auto-restarts Electron on main/preload rebuild). |
| `electron-vite dev --watch --inspect=9229` | `cross-env ELECTRON_INSPECT=9229 vite` | Plugin reads `ELECTRON_INSPECT`. |
| `electron-vite dev --watch --noSandbox` | `vite` | `--no-sandbox` is already the plugin's default startup argv. |
| `electron-vite build` | `vite build` | Plugin runs main/preload builds during renderer build. |
| `electron-vite preview` | `electron .` | `package.json#main` already points to `out/main/index.js`. |

### AD-7: Catalog refresh

| Package | Current | Target |
|---|---|---|
| `electron-vite` | `5.0.0` | removed |
| `vite-plugin-electron` | (new) | `^1.0.4` |
| `vite-plugin-electron-renderer` | (new) | `^1.0.0` (optional; for renderer Node-API) |
| `electron` | `^40.10.0` | `^42.0.0` |
| `electron-builder` | `26.9.0` | `^26.15.3` |
| `electron-store` | `^8.2.0` | `^11.0.2` |
| `electron-updater` | `^6.8.3` | `^6.8.9` |
| `@electron-toolkit/tsconfig` | `^1.0.1` | `^2.0.0` (inline in apps/desktop; v2 just sets `moduleResolution: bundler`, which we already override) |

Already at latest (no change): `electron-log@^5.4.4`, `electron-window-state@^5.0.3`,
`@electron-toolkit/utils@^4.0.0`, `@electron-toolkit/preload@^3.0.2`,
`@electron/notarize@^3.1.1`.

### AD-8: Electron 42 source-compatibility audit

Verified clear for this codebase:

- `src/main/presenter/browser/yoBrowserSession.ts:49` calls `clearStorageData({ storages })`
  — no `quotas` option. Safe.
- No usages of `ELECTRON_SKIP_BINARY_DOWNLOAD` (removed var).
- No usages of `nativeImage.createFromNamedImage` (deprecated signature).
- No usages of offscreen rendering / `deviceScaleFactor`.

Electron 42's on-demand binary download (no postinstall) is compatible with the existing
`allowBuilds: electron: true` in `pnpm-workspace.yaml`. CI may need to invoke
`npx install-electron` if it relies on the postinstall behavior; track in Phase 7.

### AD-9: Cleanup of stale `@browser/` alias

While we are touching `tsconfig.app.json` and `tsconfig.app.tsgo.json`, drop the stale
`src/renderer/browser/**` include entries and the `@browser/*` path. No source code uses
this alias; the `src/renderer/browser/` folder only contains stale SVG assets. This is
scoped cleanup, not a refactor.

## Data Model & IPC Surface

No changes. The IPC contract, preload bridge surface, and event flow are untouched. The
migration is a build-tool swap; runtime behavior is preserved by construction.

## Test Strategy

| Layer | Coverage |
|---|---|
| **Unit (vitest)** | Existing `test/main/**` and `test/renderer/**` must pass unchanged. `vitest.config.ts` and `vitest.config.renderer.ts` do not reference electron-vite and need no changes (the `@browser` alias cleanup in renderer config is optional, do it). |
| **Contract test** | `test/main/presenter/pluginPresenter.test.ts:665-672` reads `electron.vite.config.ts` by filename — update to `vite.config.ts` and adjust the assertion to the new preload input shape. The `../preload/pluginSettings.mjs` contract assertion stays. |
| **Splash window test** | `test/main/presenter/lifecyclePresenter/SplashWindowManager.display.test.ts` sets/deletes `ELECTRON_RENDERER_URL` in 3 sites — rename to `VITE_DEV_SERVER_URL`. |
| **Type check** | `pnpm run typecheck` (tsgo node + web) must pass. Drop `"electron-vite/node"` from `tsconfig.node.json#types`. |
| **Lint** | `pnpm run lint` (oxlint + architecture-guard) must pass. |
| **Format** | `pnpm run format` (oxfmt) must pass; rename `electron.vite.config.ts` → `vite.config.ts` in `.oxfmtrc.json`. |
| **Build** | `pnpm --filter @argos/desktop build` produces the expected `out/` tree (see US-1). |
| **Manual smoke** | `pnpm --filter @argos/desktop dev` — open main window, settings, splash, floating button, floating chat, browser overlay. Edit main/preload/renderer files; confirm rebuild + reload + HMR. |
| **E2E** | `pnpm run e2e:smoke` — Playwright launches the packaged app; output paths unchanged. |
| **Native rebuild** | `pnpm --filter @argos/desktop postinstall` (= `electron-builder install-app-deps`) must rebuild `sharp`, `@duckdb/node-api`, `better-sqlite3-multiple-ciphers`, `node-pty` against Electron 42's headers. |

## Rollback

All changes are confined to:

- `apps/desktop/electron.vite.config.ts` (deleted) ↔ `apps/desktop/vite.config.ts` (new)
- `apps/desktop/package.json`
- `apps/desktop/tsconfig.node.json`, `tsconfig.app.json`, `tsconfig.app.tsgo.json`
- `apps/desktop/electron-builder.yml`
- `apps/desktop/src/main/env.d.ts`
- `pnpm-workspace.yaml`
- `.oxfmtrc.json`
- `README.md`
- 15+ `src/main/**` files (the `__dirname` conversion)
- 8 `src/main/**` + `src/preload/index.ts` files (the `ELECTRON_RENDERER_URL` rename)
- 7 `src/main/**` files (the `import.meta.env.VITE_*` rename)
- 2 test files (`pluginPresenter.test.ts`, `SplashWindowManager.display.test.ts`)

A single revert commit (`git revert`) restores `electron-vite`. The three source refactors
(3a/3b/3c) are individually revertible if a partial rollback is needed.

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Multi-env API immaturity | Low | Med | Fallback to simple API (AD-1). |
| Preload `.mjs` output naming mismatch | Med | High | Use object-form input (AD-4); validate in Phase 7. |
| `notBundle: true` over-externalizes in dev | Low | Med | Switch to `notBundle: { filter }` if a devDep fails at runtime. |
| Electron 42 native module rebuild failures | Low | High | `electron-builder install-app-deps`; pin native module versions if needed. |
| `.env` not loaded from expected location | Low | Med | `loadEnv` falls back to repo root if needed; verify with `process.env.VITE_*` log. |
| Preload hot-reload IPC channel change | Low | Low | Verified during manual smoke. |
| Electron 42 macOS notification code-signing | Med | Low | Verify with ad-hoc dev signing; document if needed. |

## Sequencing

Phase 0 (this doc + spec.md + tasks.md) → Phase 1 (catalog + deps) → Phase 2 (vite.config.ts)
→ Phase 3a/3b/3c/3d (source refactors, parallelizable) → Phase 4 (scripts) → Phase 5 (aux
files + tsconfig cleanup) → Phase 6 (tests) → Phase 7 (verification) → Phase 8 (docs).
