# Tasks

## Protocol

- [x] Finalize the versioned (`v: 1`) WS RPC envelope: `route`, `route:response`, `subscribe`, `unsubscribe`, `event`.
- [x] Update `WebSocketBridge` (`packages/client-sdk/src/websocket-bridge.ts`) to emit/parse the versioned envelope.
- [x] Reject envelopes with unknown `v` with a stable error code.

## Daemon WS RPC

- [x] Extend `/api/v1/events` WS handler (`apps/daemon/src/index.ts:103`) to dispatch `route` frames via `ARGOS_ROUTE_CATALOG`.
- [x] Validate input/output with route contracts, matching HTTP dispatch.
- [x] Attach `AuthContext` at WS upgrade (cookie for browser, bearer header / first-message for non-browser); reject unauthenticated upgrades.
- [x] Return stable error codes for desktop-only routes (`TIER3_PREFIXES`).
- [x] Generalize the rate-limiter (`apps/daemon/src/transport/auth.ts:1-32`) to WS auth verification.

## Desktop hybrid bridge

- [x] Consolidate `WebSocketBridgeAdapter` (`hybridBridge.ts:170`) onto the shared client-sdk `WebSocketBridge`.
- [x] Replace silent remote-to-IPC fallback with explicit connection/unsupported errors for remote-owned routes.
- [x] Keep IPC routing for desktop-only routes.

## Testing

- [x] Envelope parsing / correlation / unknown-version rejection unit tests.
- [x] WS auth-at-upgrade unit tests (valid / missing / expired session).
- [x] Daemon WS route invocation + event subscription integration test (one socket).
- [x] `HybridBridge` IPC routing regression test.
- [x] Desktop-only route error code regression test.

