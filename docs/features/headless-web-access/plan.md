# Plan

## Current State

All web-access infrastructure is greenfield. Verified:

- The daemon `fetch()` handler (`apps/daemon/src/index.ts:78-127`) serves only `/health`, `/api/v1/route`, `/api/v1/events`, and a 404. No `Bun.file()`, no static directory, no SPA fallback.
- No `--web` / `--web-root` flags exist (`apps/daemon/src/lifecycle.ts:5-39`).
- No browser/web HTML entry exists. `src/renderer/browser/` holds only window-chrome SVGs; `browser-overlay/` is an in-Electron overlay requiring `window.yoBrowserOverlay` (`apps/desktop/src/renderer/browser-overlay/BrowserActivityOverlay.tsx:73`).
- The main renderer entry (`apps/desktop/src/renderer/src/main.tsx`) does not construct `window.argos`; the preload does (`apps/desktop/src/preload/index.ts:265-273`), and never runs in a plain browser.
- Vite config (`apps/desktop/vite.config.ts:157-162`) has 4 Electron-only entries → `out/renderer/`. No `web` input. The renderer depends on `electronAssetPlugin` (`?asset` imports, lines 78-103) and preload globals.
- `WebSocketBridge` (`packages/client-sdk/src/websocket-bridge.ts:19`) is browser-suitable (standard `WebSocket`, `crypto.randomUUID`, reconnect) but is never wired for a browser context — there is no `createBrowserBridge()` factory.
- `HybridBridge` (`apps/desktop/src/preload/hybridBridge.ts:41`) hard-requires an `ipcBridge` (`line 49`) and cannot run in a browser.
- Desktop-only capability surface is defined by `TIER3_PREFIXES` / `TIER3_EVENT_PREFIXES` at `hybridBridge.ts:8-28`.
- `window.api` shape is at `apps/desktop/src/preload/index.ts:23-93` / `index.d.ts:8-19`. `window.electron` is used directly in `src/renderer/settings/` and `src/renderer/splash/`.
- No `isBrowser` / `runtimeKind` detection exists; `isElectron()` is main-process only (`apps/desktop/src/main/presenter/llmProviderPresenter/acp/acpProcessManager.ts:104`).

## Approach

Reuse the renderer React source tree with a new browser entry, build target, and daemon static serving. The browser gets the same UI minus desktop-only capabilities, served by the daemon over the same WebSocket transport.

## Daemon Static Serving

Add to `apps/daemon/src/lifecycle.ts`:

- `--web`: boolean flag, enables static asset serving.
- `--web-root <path>`: override asset directory. Default: resolve `../web` relative to the daemon executable (production) or a dev path.

Add to the daemon `fetch()` handler (`apps/daemon/src/index.ts`), after API route handling and before the 404:

- If `--web` is off, static paths return 404 (unchanged behavior).
- If `--web` is on:
  - Serve static files from `webRoot` via `Bun.file()`.
  - SPA fallback: any non-API, non-file path serves `index.html` (so client-side routing works).
  - `Cache-Control` headers for hashed assets; no-cache for `index.html`.
- Protected data assets are gated by the auth model; the static shell (`index.html`, JS/CSS bundles) is served without a session, matching the auth model's `public` static-shell class.

## Web Build Target

Add to `apps/desktop/vite.config.ts`:

- A 5th rolldown input: `web: resolve('src/renderer/web/index.html')`.
- Output to a separate directory (e.g. `out/web/`) to avoid colliding with `out/renderer/`.
- Exclude `electronAssetPlugin` and any `?asset` imports from the web build; provide a web-compatible asset URL transform (relative paths served by the daemon).
- The web build must not import `apps/desktop/src/preload/*` or anything that touches `ipcRenderer`.

## Browser Entry

New files:

- `apps/desktop/src/renderer/web/index.html`: minimal HTML shell, loads `web/main.tsx`.
- `apps/desktop/src/renderer/web/main.tsx`: the browser bootstrap.
  1. Determine daemon base URL from `window.location.origin` (the daemon serving the page is the daemon to connect to).
  2. Construct `WebSocketBridge` from `packages/client-sdk` against `ws://<origin>/api/v1/events`.
  3. Expose as `window.argos` with the same shape as the preload: `{ invoke, on, connection, workspace }`. The `connection` and `workspace` surfaces must be replicated (preload `index.ts:268-272`) since `WebSocketBridge` only provides `invoke`/`on`.
  4. Install browser `window.api` shim.
  5. Mount the same root React component (`App` / `RouterProvider`) as the Electron renderer, gated by capability.

## Browser `window.api` Shim

Provide `window.api` using Web APIs, mirroring the shape at `preload/index.d.ts:8-19`:

- `copyText` / `readClipboardText`: `navigator.clipboard`.
- `copyImage`: best-effort via `navigator.clipboard.write` with PNG fallback; no-op if unavailable.
- `getPathForFile` / `toRelativePath` / `formatPathForInput`: return `""` or the file name (no real filesystem path in browser).
- `getWindowId` / `getWebContentsId`: return `null` / `0`.
- `getArch`: return `"browser"`.
- `openExternal`: `window.open(url, "_blank", "noopener")`.

`window.electron` is stubbed with `undefined` (or a minimal object that returns safe defaults). Components that require `window.electron` (settings, splash) are excluded from the web route set for the first milestone.

## Capability Detection

Introduce `runtimeKind: "electron" | "browser"`:

- Set in the browser bootstrap (`window.__argosRuntimeKind = "browser"`) and in the Electron preload (`"electron"`).
- A `getRuntimeKind()` helper reads it; components gate desktop-only UI via `runtimeKind === "electron"`.
- The desktop-only prefix set (`TIER3_PREFIXES`, `TIER3_EVENT_PREFIXES`) is extracted to `packages/shared-contracts` and reused by:
  - Electron `HybridBridge` (route to IPC).
  - Browser capability gate (hide/disable/unavailable).

Do **not** overload `ConnectionState.mode` (local/remote) with browser/desktop semantics.

## UI Gating

- The web route set excludes settings routes and any route whose handler requires `window.electron`.
- Desktop-only action buttons (open folder, select directory, reveal file, native save) render as hidden or disabled with a tooltip ("Not available in browser").
- The chat/session/provider/model core surface works identically to Electron.

## Auth Alignment

Browser auth follows `connection-runtime-auth-model`:

- The browser connects via `WebSocketBridge` after obtaining a `browser-session` (HTTP-only cookie) through pairing (`pairing-and-session-auth`).
- No raw token in the WebSocket URL. The daemon validates the session cookie on WS upgrade.
- Until pairing lands, `--web` serves the shell but privileged data requires a session; unauthenticated data access is rejected.

## Packaging

- Include `out/web/` assets in daemon release artifacts (alongside the daemon executable).
- Desktop Electron `extraResources` daemon binary behavior is unchanged.
- Dev: `--web-root` points at the vite dev output or a built `out/web/`.

## Testing

- Daemon: unit-test static file serving, SPA fallback, `--web` off behavior, cache headers.
- Browser bootstrap: unit-test `window.argos` construction, `window.api` shim behavior, `runtimeKind` detection.
- Capability gate: unit-test that desktop-only prefixes produce hidden/disabled states.
- Smoke: start daemon with `--web --port 0`, fetch `index.html` and a hashed asset, assert SPA fallback for `/some/route`.
- Build: assert the `web` target produces assets without Electron/preload imports.
