# Tasks

## Daemon static serving

- [ ] Add `--web` (boolean) and `--web-root <path>` to daemon CLI options (`apps/daemon/src/lifecycle.ts:5-39`).
- [ ] Add static file serving + SPA fallback to the daemon `fetch()` handler before the 404 (`apps/daemon/src/index.ts:78-127`), gated by `--web`.
- [ ] Add `Cache-Control` headers (hashed assets cached, `index.html` no-cache).
- [ ] Print the web access URL on startup when `--web` is on.

## Web build target

- [ ] Add a `web` rolldown input + `index.html` to the vite config (`apps/desktop/vite.config.ts:157-162`), outputting to `out/web/`.
- [ ] Exclude `electronAssetPlugin` and preload imports from the web build; provide a web-compatible asset URL transform.

## Browser entry + bootstrap

- [ ] Create `apps/desktop/src/renderer/web/index.html` + `web/main.tsx` browser entry.
- [ ] Implement browser bootstrap: construct `WebSocketBridge` (`packages/client-sdk/src/websocket-bridge.ts:19`) from `window.location.origin`, expose as `window.argos` with `{ invoke, on, connection, workspace }` shape matching the preload (`apps/desktop/src/preload/index.ts:268-272`).
- [ ] Implement browser `window.api` shim using Web APIs (clipboard, `window.open`, path stubs).
- [ ] Stub or omit `window.electron` for the web build.

## Capability detection + gating

- [ ] Extract `TIER3_PREFIXES` / `TIER3_EVENT_PREFIXES` from `apps/desktop/src/preload/hybridBridge.ts:8-28` into `packages/shared-contracts`.
- [ ] Add `runtimeKind: "electron" | "browser"` detection (set in preload + browser bootstrap; `getRuntimeKind()` helper).
- [ ] Gate desktop-only UI: hide/disable actions in the `TIER3_PREFIXES` set when `runtimeKind === "browser"`.
- [ ] Define the web route set (exclude settings + desktop-only routes for the first milestone).

## Auth alignment

- [ ] Ensure browser WS upgrade validates session cookie, not query token (coordinate with `pairing-and-session-auth`).
- [ ] Reject unauthenticated privileged data access in web mode.

## Packaging

- [ ] Include `out/web/` assets in daemon release artifacts.
- [ ] Verify desktop Electron packaging + sidecar startup unchanged.

## Testing

- [ ] Daemon static serving unit tests (file, SPA fallback, `--web` off, cache headers).
- [ ] Browser bootstrap unit tests (`window.argos`, `window.api` shim, `runtimeKind`).
- [ ] Capability gate unit tests (desktop-only prefixes → hidden/disabled).
- [ ] Smoke test: daemon `--web --port 0`, fetch `index.html` + hashed asset + SPA fallback.
- [ ] Build assertion: `web` target has no Electron/preload imports.
