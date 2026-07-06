# Pairing And Session Auth

## User Need

Remote and browser access must not rely on manually copying long-lived shared secrets. Users need a safe pairing flow that creates revocable sessions, consistent with the clean-break auth model in `connection-runtime-auth-model` (the shared-secret token model is removed, not migrated).

## Goal

Implement the pairing → session credential layer that `connection-runtime-auth-model` Phase 2 specifies: one-time pairing tokens create revocable `browser-session` / `bearer-session` credentials that authorize all privileged daemon access.

## Acceptance Criteria

- The daemon issues short-lived, single-use `one-time-token` pairing credentials (CSPRNG-generated).
- A browser client exchanges a pairing token for a `browser-session` stored as an HTTP-only same-site cookie.
- A non-browser client (CLI, future mobile) exchanges a pairing token for a `bearer-session` stored in platform secure storage.
- Sessions authorize HTTP route dispatch, WebSocket upgrade, future WS RPC, and protected static assets per the Surface Inventory in `connection-runtime-auth-model`.
- Sessions can be listed and revoked via an authenticated endpoint.
- Pairing entrypoints are displayed in CLI output (`argos-daemon --web --pair`) and desktop settings.
- No raw shared-secret token (`ARGOS_TOKEN`, `--token`, `authToken`, `WS ?token=`) is used anywhere; the shared-secret surface is already removed by `connection-runtime-auth-model` Phase 1.
- Rate-limiting covers pairing token verification and session creation.

## Constraints

- Depends on `connection-runtime-auth-model` Phase 1 (shared-secret removal + `AuthContext` gate) being complete.
- Depends on `daemon-transport-runtime` for WS auth at upgrade (cookie + bearer header/first-message).
- Browser cookies must be HTTP-only, `SameSite=Lax` (or `Strict`), `Secure` when the daemon is reached over TLS/proxy.
- Pairing tokens must be short-lived (minutes, not hours) and single-use.
- Must not store session secrets in renderer state; the browser holds only the HTTP-only cookie.

## Non-Goals

- Cloud account login.
- Relay authentication (owned by `argos-connect-relay`).
- Mobile app UI.
- Multi-user / multi-tenancy (single-user per daemon).

## Decisions

- Browser sessions use **HTTP-only cookies** (per `connection-runtime-auth-model`); `bearer-session` tokens are reserved for non-browser clients. Both resolve to the same session record server-side.
- Session records live in the **daemon database** (data dir), not in a config file. Pairing token metadata (not the token itself) is stored alongside for audit.
- The pairing endpoint is the only `bootstrap`-class surface: it accepts a `one-time-token` and returns/sets a session credential. It is rate-limited.
- Pairing tokens are generated with a CSPRNG; they are hashed at rest (only the hash is stored, like a password).

## Open Questions

- Should `browser-session` cookies have a fixed lifetime, sliding expiration, or persist-until-revoked? (Proposed: sliding expiration with a max lifetime.)
- Should the desktop-managed sidecar auto-issue a pairing entrypoint on startup in `loopback-browser` mode, or require the user to click "enable browser access" first?
- Should revoking a session also kill the active WebSocket connection immediately, or let it drain?
