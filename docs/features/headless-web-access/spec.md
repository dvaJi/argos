# Headless Web Access

## User Need

Users should be able to run Argos on a machine without opening the Electron desktop app and access the Argos UI from a browser. Today the daemon only serves `/health`, `/api/v1/route`, and `/api/v1/events` — there is no static asset serving, no `--web` flag, no browser entry point, and no way to construct `window.argos` without the Electron preload (`apps/desktop/src/preload/index.ts:265`).

## Goal

Add daemon-served web access: the daemon serves a purpose-built web build of the renderer, and a browser bootstrap constructs `window.argos` from the daemon WebSocket transport without any Electron dependency.

## Acceptance Criteria

- `argos-daemon --web` serves the Argos web UI from a built web asset directory.
- `argos-daemon --web-root <path>` overrides the asset directory (dev + packaging).
- Static web serving is disabled unless `--web` is passed; the daemon still serves `/health` and API routes without it.
- A new `web` build target produces browser-ready assets separate from the Electron renderer build.
- A browser bootstrap constructs `window.argos` from `WebSocketBridge` (`packages/client-sdk/src/websocket-bridge.ts:19`) against the daemon URL, with no Electron preload.
- A browser shim provides `window.api` (clipboard, external open, path stubs) using Web APIs; `window.electron` is stubbed or absent.
- The main chat/workspace shell loads and works in browser mode.
- Desktop-only actions (the `TIER3_PREFIXES` set) are hidden, disabled, or return explicit unavailable states.
- Browser auth uses the session/cookie model from `connection-runtime-auth-model`, never a raw token in the URL.
- Electron desktop packaging and sidecar startup continue working unchanged.

## Constraints

- Do not fork the UI into a separate app for the first milestone; reuse renderer source with a different entry/build.
- Do not break Electron desktop packaging or the existing 4 renderer entries (`apps/desktop/vite.config.ts:157-162`).
- Keep `src/renderer/api/legacy/` quarantine rules (max 3 source files).
- Settings UI stays desktop-only for the first milestone (it depends heavily on `window.electron` direct IPC).

## Non-Goals

- Full settings parity in browser mode.
- Mobile app implementation.
- Relay/cloud access.
- Native OS integrations in browser mode (native dialogs, file save pickers, tray).
- Browser overlay / floating window / splash renderers in web mode.

## Decisions

- Build a **separate `web` entry** (`src/renderer/web/index.html` + `web/main.tsx`) rather than reusing the Electron `index.html`. The Electron entry assumes `window.argos`/`window.api`/`window.electron` exist at parse time; a clean web entry bootstraps them before mounting.
- Web build outputs to `out/web/` alongside `out/renderer/`; daemon serves from `out/web/` (or `--web-root`).
- Browser transport uses `WebSocketBridge` from `packages/client-sdk` directly — **not** `HybridBridge` (which hard-requires an `ipcBridge` fallback, `apps/desktop/src/preload/hybridBridge.ts:49`).
- Extract `TIER3_PREFIXES` / `TIER3_EVENT_PREFIXES` from `hybridBridge.ts:8-28` into `packages/shared-contracts` as the single source of truth for desktop-only capability surface, consumed by both the Electron HybridBridge and the browser capability gate.
- Introduce a `runtimeKind` discriminator (`"electron" | "browser"`) rather than overloading `ConnectionState.mode` (which means local-daemon vs remote-workspace, `packages/shared-contracts/src/connection.ts:4`).

## Open Questions

- Should the web build share the same React router tree as the Electron renderer, or use a reduced route set that excludes settings/desktop routes?
- Should the browser bootstrap attempt an unauthenticated shell first and redirect to pairing on first privileged action, or require a session before rendering anything?
