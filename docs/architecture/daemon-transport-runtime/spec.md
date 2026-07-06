# Daemon Transport Runtime

## User Need

Argos should have one core backend transport that works from Electron, browser, and future mobile clients. The daemon should not be a partial sidecar with a separate behavior model from the desktop app.

## Goal

Make `ArgosBridge` the shared client transport contract and make daemon HTTP/WebSocket support equivalent enough for browser and remote clients.

## Acceptance Criteria

- `ArgosBridge.invoke()` works over daemon WebSocket RPC in browser mode.
- `ArgosBridge.on()` receives daemon events over the same WebSocket connection.
- Existing HTTP `POST /api/v1/route` remains available for health checks and debugging.
- Electron desktop continues using IPC for desktop-local routes and can route daemon-safe operations through the daemon when configured.
- Desktop-only route failures are explicit and typed instead of silent fallbacks.
- An `AuthContext` (from `connection-runtime-auth-model`) is attached to every WS RPC request and validated before dispatch.
- WebSocket auth uses cookie/session (browser) or bearer header / first-message (non-browser) — no query-string secrets.

## Constraints

- Preserve existing shared route contracts.
- Preserve existing client SDK exports.
- Keep daemon tests runnable independently from Electron.
- Do not introduce a query-string token on the WS connection.

## Non-Goals

- Full route parity with desktop main process.
- Cloud relay or pairing implementation (owned by `pairing-and-session-auth`).
- Replacing Electron IPC for desktop-only features.

## Decisions

- The WS RPC protocol uses a **versioned envelope** (`v: 1`) rather than reusing the raw `WebSocketBridge` message shape, so the protocol can evolve without ambiguous inline detection.
- Browser mode prefers WebSocket RPC as the single transport; HTTP `/api/v1/route` stays for health probes and as a debugging surface, not as a browser fallback path.
- The existing `WebSocketBridge` (`packages/client-sdk/src/websocket-bridge.ts:19`) is the browser transport class; `HybridBridge` (`apps/desktop/src/preload/hybridBridge.ts:41`) remains the Electron transport.

## Open Questions

- Should the WS connection multiplex route RPC and event streaming on one socket, or use a dedicated RPC socket alongside the existing `/api/v1/events` stream?
- Should HTTP `/api/v1/route` be deprecated once WS RPC is stable, or kept permanently as a debug surface?
