# Extract UI — Architecture Spec

## Goal

Extract the React frontend out of the Electron app into a standalone, reusable web package (`@argos/ui`), so that:

- `apps/desktop` becomes a thin Electron **shell** (main process + preload only).
- `apps/daemon` serves the UI over HTTP and is the backend for the shell and for browser clients (CodeNomad-style architecture).
- The UI builds independently and can run in a browser against the daemon.

## Context & prior state

Previously the entire React UI lived under `apps/desktop/src/renderer/` and was bundled into `out/renderer/` by the desktop Vite config. The desktop's `BrowserWindow`s `loadFile`'d those bundled assets. A daemon sidecar already existed and the preload already exposed a **hybrid bridge** (`window.argos`: WebSocket→daemon for routes, IPC→desktop main for native-only routes), but the desktop was not using the daemon to *serve* the UI.

## Target architecture

```
packages/ui (@argos/ui)      standalone React frontend → builds to dist/, served by the daemon
apps/daemon (@argos/daemon)  Bun server: serves UI + /api/v1/route + /api/v1/events
apps/desktop (@argos/desktop) Electron shell: main + preload only; windows load UI from the daemon
```

- Desktop windows load `http://127.0.0.1:<daemonPort>/...` (or `VITE_DEV_SERVER_URL` in dev) via `lib/daemonUi.ts#resolveUiUrl`.
- The daemon sidecar is started with `--web --web-root <packages/ui/dist | resources/web>` so it serves the UI.
- The preload keeps the hybrid bridge; settings' legacy `useLegacyPresenter()` still works inside the shell.

## Path aliases

Migrated to `#`-prefix (Node subpath style) for internal refs, and real package names for cross-package refs (no more `@`-collision with npm scopes):

| Old | New |
|-----|-----|
| `@/` | `#/` (ui `src/` / desktop `src/main/`) |
| `@api` `@shadcn` `@settings` | `#api` `#shadcn` `#settings` |
| `@shared` `@shared/contracts` | `@argos/shared` `@argos/shared-contracts` (real workspace packages) |

## Decisions

- **Hybrid bridge** retained for native-only routes (file dialogs etc.) — not all routes pushed to the daemon.
- **Splash** loads from the daemon with an inline-HTML fallback for pre-daemon startup.
- **Settings legacy migration** deferred — it works in-shell; only blocks pure-browser settings.

## Out of scope

- Settings `useLegacyPresenter()` → typed-client migration (tracked as a follow-up).
- In-shell HMR dev orchestration (concurrent `@argos/ui dev` + `VITE_DEV_SERVER_URL`).
