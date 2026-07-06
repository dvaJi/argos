# Plan

## Approach

Implement pairing as the bootstrap layer and sessions as the authorization layer over the `AuthContext` gate from `connection-runtime-auth-model`. No legacy/shared-secret path exists.

## Credential Lifecycle

- `one-time-token`:
  - Issued by the daemon or the desktop settings UI (CSPRNG).
  - Stored at rest as a hash (not plaintext).
  - Short-lived (minutes); single-use; invalidated on exchange or expiry.
  - Safe to place in a pairing URL/QR.
- `browser-session`:
  - Created by exchanging a `one-time-token` at the pairing endpoint.
  - Stored as an HTTP-only, `SameSite=Lax`, `Secure`-when-TLS cookie.
  - Authorizes HTTP routes, WS upgrade, and protected static assets.
  - Revocable; sliding expiration with a max lifetime.
- `bearer-session`:
  - Created by exchanging a `one-time-token` (non-browser clients).
  - Returned as a bearer token in the pairing response body.
  - Stored by the client in platform secure storage.
  - Same authorization scope as `browser-session`.

## Flows

- **CLI/headless**: `argos-daemon --web --pair` prints a URL containing a one-time token. A browser opens it, exchanges the token, receives a `browser-session` cookie, and reconnects through `ArgosBridge`.
- **Desktop-managed daemon**: settings page (`server-exposure-settings`) generates a pairing URL/QR on demand. The desktop sidecar itself authenticates via `desktop-bootstrap` (owned by Electron main), not pairing.
- **Non-browser client**: exchanges the one-time token via HTTP, receives a `bearer-session` token in the response body, stores it in secure storage, and uses `Authorization: Bearer <session>` for HTTP and bearer-header/first-message for WS.

## APIs

All under `/api/v1/`:

- `POST /api/v1/pair` — `bootstrap` class. Body: `{ token }`. Validates the one-time token (rate-limited). On success: sets `browser-session` cookie (browser) or returns `{ sessionToken }` (non-browser, by `Accept` header or client type). Invalidates the one-time token.
- `GET /api/v1/sessions` — `authenticated` class. Lists active sessions (id, created, lastSeen, kind, label).
- `DELETE /api/v1/sessions/:id` — `authenticated` class. Revokes a session (kills its cookie/token validity; optionally disconnects its WS).
- `GET /health` — `public`. Unchanged, minimal.

## AuthContext Wiring

The daemon auth gate (from `connection-runtime-auth-model` Phase 1) resolves an `AuthContext` from the incoming credential:

- Cookie (`browser-session`) → `credentialKind: "browser-session"`, `sessionId` from the session record.
- `Authorization: Bearer <session>` → `credentialKind: "bearer-session"`, `sessionId` from the session record.
- `desktop-bootstrap` (local sidecar) → `credentialKind: "desktop-bootstrap"`.
- Pairing endpoint only accepts `one-time-token`; it does not require an existing session.

WS upgrade (from `daemon-transport-runtime`): validate the session cookie or bearer header/first-message before accepting the connection. No `?token=` query parameter.

## Storage

- Session records: daemon database (data dir). Schema: `id`, `kind` (browser/bearer), `secretHash`, `createdAt`, `lastSeenAt`, `expiresAt`, `label`, `revoked`.
- Pairing tokens: daemon database. Schema: `tokenHash`, `createdAt`, `expiresAt`, `consumedAt`, `issuedBy`.
- Server signing secret: OS secure storage when available, restricted-file fallback (per `connection-runtime-auth-model` storage policy).

## Security

- All tokens/sessions generated with a CSPRNG.
- One-time tokens and session secrets are hashed at rest.
- Rate-limiting (`apps/daemon/src/transport/auth.ts:1-32`) covers pairing exchange and session verification.
- Pairing URLs do not embed session secrets — only the short-lived one-time token.
- Revocation is immediate for HTTP; WS connections are disconnected on revocation (or drained per the open question).

## Testing

- One-time token: issuance, expiry, single-use, replay rejection.
- Pairing exchange: browser (cookie set), non-browser (bearer returned), invalid token rejection, rate-limiting.
- Session lifecycle: list, revoke, expired-session rejection, sliding expiration.
- WS upgrade: valid cookie accepted, valid bearer accepted, missing/expired rejected.
- CSPRNG + at-rest hashing verification.
