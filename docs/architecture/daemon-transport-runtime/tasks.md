# Tasks

## Protocol

- [ ] Finalize the versioned (`v: 1`) WS RPC envelope: `route`, `route:response`, `subscribe`, `unsubscribe`, `event`.
- [ ] Update `WebSocketBridge` (`packages/client-sdk/src/websocket-bridge.ts`) to emit/parse the versioned envelope.
- [ ] Reject envelopes with unknown `v` with a stable error code.

## Daemon WS RPC

- [ ] Extend `/api/v1/events` WS handler (`apps/daemon/src/index.ts:103`) to dispatch `route` frames via `ARGOS_ROUTE_CATALOG`.
- [ ] Validate input/output with route contracts, matching HTTP dispatch.
- [ ] Attach `AuthContext` at WS upgrade (cookie for browser, bearer header / first-message for non-browser); reject unauthenticated upgrades.
- [ ] Return stable error codes for desktop-only routes (`TIER3_PREFIXES`).
- [ ] Generalize the rate-limiter (`apps/daemon/src/transport/auth.ts:1-32`) to WS auth verification.

## Desktop hybrid bridge

- [ ] Consolidate `WebSocketBridgeAdapter` (`hybridBridge.ts:170`) onto the shared client-sdk `WebSocketBridge`.
- [ ] Replace silent remote-to-IPC fallback with explicit connection/unsupported errors for remote-owned routes.
- [ ] Keep IPC routing for desktop-only routes.

## Testing

- [ ] Envelope parsing / correlation / unknown-version rejection unit tests.
- [ ] WS auth-at-upgrade unit tests (valid / missing / expired session).
- [ ] Daemon WS route invocation + event subscription integration test (one socket).
- [ ] `HybridBridge` IPC routing regression test.
- [ ] Desktop-only route error code regression test.
