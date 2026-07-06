# Plan

## Approach

Use Argos's existing seam instead of creating a new abstraction:

- `ArgosBridge` remains the frontend contract.
- `createBridge(ipcRenderer)` (`packages/client-sdk/src/ipc-bridge.ts:78`) remains the Electron IPC implementation.
- `WebSocketBridge` (`packages/client-sdk/src/websocket-bridge.ts:19`) becomes the browser/daemon implementation for both invoke and events.
- `HttpClient` remains a compatibility and health-check helper.
- `HybridBridge` (`apps/desktop/src/preload/hybridBridge.ts:41`) remains the Electron hybrid router (IPC for desktop-only, WS for daemon-safe).

## Current State

- `POST /api/v1/route` dispatches routes via `ARGOS_ROUTE_CATALOG` (`apps/daemon/src/index.ts:99`).
- `WS /api/v1/events` is event-only: the client subscribes and receives `{ type: "event", name, payload }`. There is no route RPC over WS today (`apps/daemon/src/index.ts:103`).
- `WebSocketBridge` (client-sdk) already speaks a `{ type: "route", requestId, ... }` / `{ type: "route:response", ... }` envelope and does its own reconnect, but the daemon WS server does not handle those frames — only event subscribe/unsubscribe.
- `WebSocketBridgeAdapter` (`hybridBridge.ts:170`) is a duplicate WS implementation used inside Electron; it duplicates the envelope logic.

## WebSocket RPC Protocol

Versioned JSON envelope (`v: 1`). Multiplexed on the same `/api/v1/events` connection (route RPC + event streaming on one socket).

- request: `{ v: 1, type: "route", requestId, route, input }`
- success: `{ v: 1, type: "route:response", requestId, ok: true, output }`
- error: `{ v: 1, type: "route:response", requestId, ok: false, error: { code, message } }`
- subscribe: `{ v: 1, type: "subscribe", events }`
- unsubscribe: `{ v: 1, type: "unsubscribe", events }`
- event: `{ v: 1, type: "event", name, payload }`

Request correlation by `requestId` (client-generated `crypto.randomUUID()`).

## Daemon Changes

- Extend the `/api/v1/events` WS handler (`apps/daemon/src/index.ts:103`) to dispatch `route` frames through `ARGOS_ROUTE_CATALOG`, matching the HTTP dispatch behavior (Zod input/output validation).
- Attach an `AuthContext` (from `connection-runtime-auth-model`) to each WS connection at upgrade time, derived from the session cookie (browser) or bearer header / first-message auth frame (non-browser). Reject the upgrade if no valid credential for an `authenticated` surface.
- Return stable error codes for unsupported desktop-only routes (`TIER3_PREFIXES` from `hybridBridge.ts:8-26`, to be extracted to shared-contracts per `headless-web-access`).
- Generalize the rate-limiter (`apps/daemon/src/transport/auth.ts:1-32`) to cover WS auth verification.

## Desktop Changes

- Keep hybrid bridge routing (`hybridBridge.ts:103-118`):
  - desktop-only routes → IPC.
  - daemon-safe routes → active workspace transport when connected.
- Remove silent remote-to-IPC fallback for routes that should be remote-owned, replacing it with explicit connection/unsupported errors where needed.
- Consolidate `WebSocketBridgeAdapter` (`hybridBridge.ts:170`) onto the shared `WebSocketBridge` from client-sdk to eliminate the duplicate implementation.

## Auth Alignment

- WS upgrade validates credential before the connection is accepted (cookie for browser, bearer header/first-message for non-browser).
- No `?token=` query parameter on WS connections (clean-break from `connection-runtime-auth-model`).
- HTTP `/api/v1/route` validates `Authorization: Bearer <session>` (non-browser) or session cookie (browser).

## Testing

- Unit-test versioned envelope parsing, request correlation, and unknown-version rejection.
- Unit-test WS auth at upgrade (valid session, missing session, expired session).
- Integration-test daemon WS route invocation and event subscription on one socket.
- Regression-test Electron `HybridBridge` IPC routing behavior.
- Regression-test desktop-only route error codes from the daemon.
