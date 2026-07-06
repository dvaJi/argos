# Tasks

## Storage layer

- [x] Define session record schema (`id`, `kind`, `secretHash`, `createdAt`, `lastSeenAt`, `expiresAt`, `label`, `revoked`) in the daemon database.
- [x] Define pairing token schema (`tokenHash`, `createdAt`, `expiresAt`, `consumedAt`, `issuedBy`).
- [x] Add CSPRNG token generation + at-rest hashing helpers.
- [x] Add server signing secret storage (OS secure storage / restricted-file fallback).

## Pairing

- [x] Add `one-time-token` issuance (daemon + desktop settings entrypoint).
- [x] Add `POST /api/v1/pair` endpoint: validate token (rate-limited), create session, set cookie (browser) or return bearer (non-browser), invalidate token.
- [x] Add `--pair` flag to daemon CLI to print a pairing URL on startup.
- [x] Add desktop settings pairing URL/QR generation (coordinate with `server-exposure-settings`).

## Session management

- [x] Add `GET /api/v1/sessions` (list) and `DELETE /api/v1/sessions/:id` (revoke) authenticated endpoints.
- [x] Implement sliding expiration + max lifetime.
- [x] Implement WS disconnect on revocation (or drain per resolved open question).

## AuthContext wiring

- [x] Extend the auth gate to resolve `browser-session` (cookie) and `bearer-session` (bearer header) into `AuthContext`.
- [x] Wire WS upgrade session validation (coordinate with `daemon-transport-runtime`).
- [x] Generalize rate-limiter to cover pairing + session verification.

## Browser bootstrap

- [x] Add browser pairing bootstrap: detect no session -> redirect to pairing -> exchange -> cookie set -> reconnect via `WebSocketBridge` (coordinate with `headless-web-access`).

## Testing

- [x] One-time token: expiry, single-use, replay rejection.
- [x] Pairing exchange: browser cookie, non-browser bearer, invalid token, rate-limit.
- [x] Session lifecycle: list, revoke, expiry, sliding expiration.
- [x] WS upgrade: valid cookie/bearer accepted, missing/expired rejected.
- [x] CSPRNG + at-rest hashing verification.

