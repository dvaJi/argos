# Tasks

The shared-secret token model is removed in one cutover, not migrated. Phase 0 is owned by this architecture record; Phases 1–4 are implemented under their own SDDs and are listed here for traceability only.

## Phase 0 — Finalize the model (this SDD, doc-only)

- [x] Inventory daemon surfaces and classify each as `public`, `bootstrap`, `authenticated`, or `desktop-only`. (Surface Inventory table in `plan.md`)
- [x] Define auth classes, credential types (no legacy), exposure modes, and per-surface/per-mode acceptance. (plan.md)
- [x] Sketch `AuthContext` shape and exposure-mode config shape with fail-closed rules. (plan.md)
- [x] Verify Current State claims against the codebase and cite file references. (plan.md)
- [x] Resolve remaining Open Questions in `spec.md` before any follow-up implementation SDD leaves spec.
- [x] Add security review checklist (below) and have it reviewed.

## Phase 1 — Remove shared-secret model + scaffold auth gate

Owned by a follow-up implementation SDD. Steps ordered so the desktop-managed local case keeps working throughout.

- [x] Introduce the `AuthContext` type and a single auth gate before HTTP route dispatch, WS upgrade, and protected static serving.
- [x] Issue `desktop-bootstrap` in Electron main (CSPRNG); transmit to the daemon out-of-band (never argv, disk, or renderer); desktop-managed client authenticates via it.
- [x] Delete `--token` / `--with-token` / `ARGOS_TOKEN` handling from the daemon (`apps/daemon/src/lifecycle.ts:27-51`).
- [x] Replace the bearer checker and `WS ?token=` auth with the new gate; remove the raw shared-secret path (`apps/daemon/src/transport/auth.ts`, `apps/daemon/src/index.ts:89-110`).
- [x] Delete `WorkspaceEntry.authToken`, the remote-workspace token UI, and the WS adapter token query (`packages/shared/src/workspaceConfig.ts:8`, `apps/desktop/src/renderer/src/components/workspace/RemoteWorkspaceSetup.tsx`, `apps/desktop/src/preload/hybridBridge.ts:206`).
- [x] Generalize the existing rate-limiter (`apps/daemon/src/transport/auth.ts:1-32`) to cover bootstrap/session/pairing verification, not just bearer.
- DoD: desktop local startup works via `desktop-bootstrap`; every non-bootstrap request is rejected; no `--token` / `ARGOS_TOKEN` / `authToken` / `?token=` surface remains.

## Phase 2 — Pairing / session credentials

Owned by the pairing/headless-web SDD. Restores remote/mobile access.

- [x] Implement `one-time-token` pairing and `browser-session` (HTTP-only same-site cookie) issuance.
- [x] Implement `bearer-session` issuance for non-browser clients (CLI, mobile).
- DoD: a browser/mobile client can pair and obtain a session without any shared secret.

## Phase 3 — Exposure settings + network access

Owned by the daemon exposure-settings SDD.

- [x] Add exposure-mode selection UI; require explicit confirmation for `network-accessible`.
- [x] Enforce fail-closed bind-host validation (non-loopback host without opt-in must not silently downgrade).
- DoD: users cannot reach a network-exposed privileged surface without an authenticated session.

## Phase 4 — Relay (future)

Owned by `argos-connect-relay`.

- [ ] Session-only auth over relay reachability.
- DoD: relay never grants daemon trust.

## Cross-cutting

- [x] Reference this model in follow-up SDDs before their implementation begins: `daemon-transport-runtime`, `headless-backend-kernel`, local-api-facade, pairing/session-auth, `argos-connect-relay`.
- [x] Security review checklist (complete before Phase 1 implementation):
  - `/health` leaks no user/path/provider/model data in any mode.
  - Non-loopback + no credential is rejected on every privileged surface.
  - `desktop-bootstrap` never in argv, on disk, or renderer-accessible.
  - No shared-secret token surface remains (no `--token`, `ARGOS_TOKEN`, `authToken`, `?token=`).
  - Rate-limiting covers bootstrap/session/pairing paths.
  - Exposure-mode mismatch fails closed.
  - `x-forwarded-for` honored only behind an explicitly trusted proxy.

