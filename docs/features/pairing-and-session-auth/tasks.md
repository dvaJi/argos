# Tasks

## Storage layer

- [ ] Define session record schema (`id`, `kind`, `secretHash`, `createdAt`, `lastSeenAt`, `expiresAt`, `label`, `revoked`) in the daemon database.
- [ ] Define pairing token schema (`tokenHash`, `createdAt`, `expiresAt`, `consumedAt`, `issuedBy`).
- [ ] Add CSPRNG token generation + at-rest hashing helpers.
- [ ] Add server signing secret storage (OS secure storage / restricted-file fallback).

## Pairing

- [ ] Add `one-time-token` issuance (daemon + desktop settings entrypoint).
- [ ] Add `POST /api/v1/pair` endpoint: validate token (rate-limited), create session, set cookie (browser) or return bearer (non-browser), invalidate token.
- [ ] Add `--pair` flag to daemon CLI to print a pairing URL on startup.
- [ ] Add desktop settings pairing URL/QR generation (coordinate with `server-exposure-settings`).

## Session management

- [ ] Add `GET /api/v1/sessions` (list) and `DELETE /api/v1/sessions/:id` (revoke) authenticated endpoints.
- [ ] Implement sliding expiration + max lifetime.
- [ ] Implement WS disconnect on revocation (or drain per resolved open question).

## AuthContext wiring

- [ ] Extend the auth gate to resolve `browser-session` (cookie) and `bearer-session` (bearer header) into `AuthContext`.
- [ ] Wire WS upgrade session validation (coordinate with `daemon-transport-runtime`).
- [ ] Generalize rate-limiter to cover pairing + session verification.

## Browser bootstrap

- [ ] Add browser pairing bootstrap: detect no session → redirect to pairing → exchange → cookie set → reconnect via `WebSocketBridge` (coordinate with `headless-web-access`).

## Testing

- [ ] One-time token: expiry, single-use, replay rejection.
- [ ] Pairing exchange: browser cookie, non-browser bearer, invalid token, rate-limit.
- [ ] Session lifecycle: list, revoke, expiry, sliding expiration.
- [ ] WS upgrade: valid cookie/bearer accepted, missing/expired rejected.
- [ ] CSPRNG + at-rest hashing verification.
