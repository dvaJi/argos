# Extract UI — Plan & Tasks

## Completed

### Phase 1 — Decouple & web-safety
- [x] `@argos/shared` web-safe: `logger.ts` no longer imports electron-log/`@electron-toolkit` at module top (lazy `require` only in Electron main `process.type === "browser"`); dropped hard deps (`electron-log`, `@electron-toolkit/utils`).
- [x] Added `@argos/shared` dep to `apps/desktop`; `@argos/shared-contracts` dep to `remote-control-runtime`.

### Phase 2 — Create `packages/ui` (`@argos/ui`)
- [x] Moved `apps/desktop/src/renderer/{src,api,settings,floating,splash,browser-overlay,browser,web}` + `src/shadcn` + `src/components` → `packages/ui/` (git mv, history preserved).
- [x] New `packages/ui` config: `package.json`, `tsconfig.{app,node}.json`, `vite.config.ts` (multi-entry web build, no Electron plugins), `vite-plugins/path-alias.ts`, `tsr.config.json`.
- [x] Fixed depth-broken relative imports (`style.css`, `splash/Loading.tsx`); relocated `webBridge` impl to `packages/ui/webBridge.ts` (outside the guard-scanned `api/` dir).
- [x] Added missing settings build entry (was absent from any vite input).

### Phase 3 — Desktop becomes a shell
- [x] `apps/desktop/vite.config.ts` builds **only** main + preload (renderer build stripped; `vite.web.config.ts` deleted).
- [x] All window loaders → daemon URLs via shared `apps/desktop/src/main/lib/daemonUi.ts` (`resolveUiUrl`/`waitForDaemonPort`): main window, tabs, settings, floating chat, floating button, browser-overlay, splash (with inline fallback).
- [x] Daemon sidecar (`sidecarManager`) now starts with `--web --web-root` (dev: `packages/ui/dist`; packaged: `resources/web`).

### Phase 4 — Daemon serves UI
- [x] `resolveWebRoot` searches `packages/ui/dist` + `resources/web` (+ `../web` from executable dir).
- [x] Help text updated (`pnpm --filter @argos/ui build`).

### Phase 5 — Build / packaging / guards
- [x] `electron-builder.yml`: `packages/ui/dist` → `resources/web`.
- [x] `turbo.json`/scripts: root `build`/`dev`/`typecheck` filters updated where needed; `tsr.config.json` → `packages/ui`.
- [x] `architecture-guard.mjs`, `agent-cleanup-guard.mjs`, `generate-architecture-baseline.mjs`: repointed `apps/desktop/src/renderer` → `packages/ui`.
- [x] Desktop `tsconfig.app.json` repointed to `packages/ui`; vitest renderer aliases repointed.
- [x] AGENTS.md rewritten to the new layout.

### Phase 6 — Path-alias migration (`#` prefix)
- [x] Codemod across 1740 files: `@/`→`#/`, `@api`→`#api`, `@shadcn`→`#shadcn`, `@settings`→`#settings`, `@shared`→`@argos/shared`, `@shared/contracts`→`@argos/shared-contracts`.
- [x] Updated tsconfig path keys, vite path-alias plugins, vitest aliases, guard patterns.
- [x] Deduped duplicate tsconfig path keys; fixed pre-existing `baseUrl` tsgo error in `shared-contracts` (now typechecks standalone).

## Verified

- `@argos/ui` `tsc` ✓ + `vite build` ✓ (~18s)
- `@argos/desktop` `tsc` (main) ✓ + `vite build` (shell-only: `out/main`, `out/preload`) ✓
- `@argos/daemon` `tsc` ✓; `@argos/shared-contracts` `tsc` ✓ (standalone, newly fixed)
- architecture-guard ✓, agent-cleanup-guard ✓, oxlint ✓, oxfmt ✓

## Remaining (this migration)

### Runtime / packaging verification (needs Electron + electron-builder; cannot run in this environment)
- [ ] **End-to-end launch**: `pnpm dev` (after `pnpm --filter @argos/ui build`) → desktop window renders UI served by the daemon.
- [ ] **Native routes under served model**: confirm file dialogs / `native_required` routes still work via the hybrid bridge when the UI is served over `http://127.0.0.1` (cross-origin preload injection).
- [ ] **Splash startup ordering**: daemon ready before splash loads (inline fallback exercised).
- [ ] **Packaged build**: `electron-builder` packaging — confirm `packages/ui/dist` → `resources/web` and daemon dist → `daemon`; packaged app loads UI from sidecar.
- [x] **Dev HMR orchestration**: root `pnpm dev` runs the cross-platform `scripts/dev.mjs` launcher. It directly starts each workspace's Vite CLI (without Windows batch wrappers), verifies `@argos/ui` at IPv4 `127.0.0.1:5180`, then starts `@argos/desktop`. This prevents Electron from loading the UI before Vite is available and lets Ctrl+C terminate both process trees. `ARGOS_UI_DEV_SERVER_URL=http://127.0.0.1:5180` explicitly selects the UI server. Vite's internally assigned `VITE_DEV_SERVER_URL` remains reserved for its shell placeholder renderer.
- [x] **Dev proxy isolation**: proxy only `/api/v1`, the daemon transport namespace. Do not proxy `/api/*` broadly because Vite serves the UI's `#api` source alias at paths such as `/api/ConfigClient.ts`.
- [x] **Bridge startup readiness**: daemon routes wait for the preload WebSocket to open; chat composers remain disabled while connecting, so an initial prompt cannot be persisted without starting its agent run. The local connection indicator also reflects the actual WebSocket state.
- [x] **Initial-turn dispatch**: `sessions.create` now creates only the session; the daemon starts its initial prompt through the same provider-execution path as `chat.sendMessage`, preventing user-only first sessions.

### Cleanup
- [ ] `apps/desktop/package.json` still carries UI-only deps (react, `@tanstack/*`, monaco, tiptap, …) now unused by the shell → run `knip` and prune.
- [ ] Stray `apps/desktop/out/index.html` artifact from the shell-only build (harmless; optionally remove top-level `build.outDir`).
- [ ] Run the test suite (`test/renderer` aliases repointed but not yet executed).

### Deferred (follow-up, not blocking)
- [ ] Settings `useLegacyPresenter()` → typed clients (works in-shell; blocks only pure-browser settings).
