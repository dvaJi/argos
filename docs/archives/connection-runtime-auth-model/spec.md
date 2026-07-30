# Connection Runtime Auth Model

## User Need

Argos is moving toward local desktop, browser, LAN, remote workspace, and future relay/cloud access. The daemon currently has a simple shared-secret token model: `/health` is public, remote route calls use `Authorization: Bearer <token>`, WebSocket uses a `?token=` query parameter, and localhost requests bypass auth. That model does not fit browser/mobile/relay access and is being **replaced, not extended**.

Users need remote access that is safe by default, explicit when exposed to a network, and built on session credentials rather than long-lived shared secrets.

## Goal

Define a server-wide authentication and authorization model for all daemon surfaces, and remove the existing shared-secret token model:

- HTTP routes
- WebSocket event streaming
- future WebSocket route RPC
- daemon-served static web UI
- future pairing, browser, mobile, and relay flows

## Acceptance Criteria

- Every daemon surface has an auth class: `public`, `bootstrap`, `authenticated`, or `desktop-only`.
- Every daemon runtime has an exposure mode: `local-only`, `loopback-browser`, `network-accessible`, or `relay`.
- Bootstrap credentials and session credentials are separate concepts.
- The shared-secret token model (`ARGOS_TOKEN`, `--token`, `--with-token`, remote workspace `authToken`, `WS ?token=`) is **removed**. Remote/mobile access returns via pairing → session in a later SDD.
- Local desktop sidecar startup keeps working, authenticating via an ephemeral `desktop-bootstrap` secret owned by Electron main, with no long-lived secret reaching the renderer.
- Browser/mobile access uses explicit pairing before privileged operations.
- Relay/cloud reachability never grants daemon trust by itself.
- Credential/session storage expectations are documented for daemon, Electron main, Electron renderer, browser, and future mobile clients.

## Decisions

- Browser sessions support **HTTP-only cookies first** for daemon-served web UI; bearer session tokens are reserved for non-browser clients and future mobile.
- Desktop-managed local daemon uses an **ephemeral `desktop-bootstrap` secret generated per sidecar launch**. It is owned by Electron main and only exchanged for a session when needed.
- `/health` remains the only public default endpoint. It stays minimal: status, version, uptime, and no user data or machine paths.
- WebSocket auth uses cookie/session auth for browser and bearer headers or first-message auth for non-browser clients. Query-string secrets are removed, not kept as compatibility.
- All credentials (`desktop-bootstrap`, `one-time-token`, `browser-session`, `bearer-session`) are generated with a CSPRNG. The current daemon token uses `Math.random` (`apps/daemon/src/lifecycle.ts:95`); the replacement must not inherit that.
- Rate-limiting / lockout is a cross-cutting enforcement concern. The current IP-based limiter in `apps/daemon/src/transport/auth.ts` (10 attempts / 60s, 300s lockout) must cover every credential verification path (bootstrap, pairing, session).

## Constraints

- Do not break local desktop startup; the desktop-managed sidecar must keep working through the change.
- Remote/mobile access may be unavailable between removal of the shared-secret model and the landing of pairing → session. That gap is acceptable.
- Do not require a cloud account or relay for local/LAN access.
- Do not require route contract changes unless an implementation later needs authenticated user/session context.

## Non-Goals

- Implementing auth in this SDD.
- Implementing OAuth, cloud accounts, or relay infrastructure.
- Migrating every desktop route to daemon-safe behavior.
- Keeping the shared-secret token model working in any form.

## Open Questions

Each item states the model-level constraint here and defers only the exact mechanism to the follow-up implementation SDD that owns it. The mechanism must be settled before that follow-up SDD leaves spec; it does not block this architecture record.

- **Bootstrap secret transport**: the model requires the `desktop-bootstrap` secret to never appear in the daemon process argument list, never persist to disk, and never cross into the renderer. Exact channel (env var, stdin handshake, or local socket) is decided by the sidecar/session-auth implementation SDD.
- **WebSocket auth envelope**: whether non-browser WS clients use a bearer header on upgrade or a first-message auth frame is decided together with the WS RPC envelope shape owned by `daemon-transport-runtime`.
- **Cookie origin binding**: whether `browser-session` cookies require daemon-served-UI origin binding (same-origin / `Sec-Fetch-Site`) is decided by the pairing/headless-web SDD.
- **`ConnectionState` auth field**: the model does not require adding an auth dimension to `ConnectionState` (`packages/shared-contracts/src/connection.ts`) now; whether it lands with session auth or later is an implementation call.
