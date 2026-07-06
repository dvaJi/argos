# Server Exposure Settings

## User Need

Users should be able to safely choose whether the local daemon is private to the desktop app, accessible from a local browser, accessible on the LAN, or prepared for future relay access.

## Goal

Add a desktop-facing server exposure model and settings UX for the daemon, aligned with the exposure modes defined in `connection-runtime-auth-model`.

## Acceptance Criteria

- Desktop settings show current daemon exposure mode and bind address.
- Users can switch between `local-only`, `loopback-browser`, and `network-accessible`.
- `relay` is shown as a disabled placeholder until the relay architecture exists.
- Changing exposure restarts or relaunches the sidecar safely when required.
- The UI shows a copyable browser URL and pairing entrypoint when exposure allows browser clients.
- `network-accessible` mode requires explicit confirmation and authenticated sessions; no local-bypass for non-loopback clients.
- A non-loopback host without explicit opt-in fails closed (does not silently downgrade), per the auth model.

## Constraints

- Keep default `local-only` behavior (desktop sidecar binds `127.0.0.1` with no token today; `apps/desktop/src/main/presenter/sidecarManager/index.ts:49-76`).
- Do not require cloud accounts.
- Do not expose unauthenticated privileged routes.
- Sidecar restart must not lose active sessions or corrupt the database.

## Non-Goals

- Tailscale automation.
- Relay service integration.
- Mobile app pairing UI beyond QR/link display readiness.

## Decisions

- Exposure mode maps directly to the `DaemonExposureConfig` from `connection-runtime-auth-model` (`mode` + `bindHost`).
- The desktop-managed sidecar authenticates via `desktop-bootstrap` (per-launch, Electron-main-owned) in all modes; browser/LAN clients authenticate via session credentials from pairing.
- Mode switches that change the bind host require a sidecar restart; `local-only` ↔ `loopback-browser` (both `127.0.0.1`) may hot-toggle web serving without a full restart.

## Open Questions

- Should exposure settings live in existing Server Settings or a new Connection Settings page?
- Should LAN bind default to `0.0.0.0` or a selected interface address?
- Should the settings UI surface active session count and per-session revoke from here, or only in a dedicated security page?
