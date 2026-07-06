# Plan

## Approach

Treat exposure as daemon runtime configuration (`DaemonExposureConfig` from `connection-runtime-auth-model`), owned by desktop settings when the daemon is desktop-managed.

## Modes

Aligned with `connection-runtime-auth-model` exposure modes:

- `local-only`: sidecar binds `127.0.0.1`; web serving off by default; `/health` public; all other surfaces require `desktop-bootstrap`. Desktop sidecar default today.
- `loopback-browser`: sidecar binds `127.0.0.1`; web serving on (`--web`); browser clients require `browser-session` via pairing.
- `network-accessible`: sidecar binds selected LAN host or `0.0.0.0`; explicit opt-in required; session auth required for all privileged surfaces; no local-bypass for non-loopback clients.
- `relay`: disabled placeholder until `argos-connect-relay` exists; `bearer-session` only.

## Runtime Behavior

- Store desired exposure mode + bind host in desktop config.
- Lifecycle hook (`apps/desktop/src/main/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook.ts:22-36`) starts the sidecar with matching `--host`, `--port`, `--data-dir`, `--web`/`--web-root`, and the `desktop-bootstrap` secret (transmitted out-of-band, never argv).
- Validate exposure config at startup: non-loopback host without explicit `network-accessible` opt-in fails closed.
- Changing mode that alters the bind host restarts the sidecar; `local-only` ↔ `loopback-browser` (same bind) may toggle `--web` without a full restart.
- Update renderer `ConnectionState` after a restart.

## UI

- Show current local daemon health, version, and URL.
- Show a copyable browser URL when `--web` is active.
- Show a pairing entrypoint (URL/QR from `pairing-and-session-auth`) when browser/LAN clients are allowed — no raw token is displayed.
- Show an explicit confirmation dialog for `network-accessible` with a "reachability, not trust" warning.
- Show `relay` as disabled with a "coming soon" label.

## Sidecar Launch Mapping

Current sidecar launch (`sidecarManager/index.ts:49-76`) passes `--host`, `--port`, `--data-dir` and optionally `--token`. Target mapping:

- `--host`: derived from exposure mode (`127.0.0.1` for local/loopback-browser; selected LAN/`0.0.0.0` for network-accessible).
- `--port`: `0` (auto-assigned) for desktop-managed.
- `--data-dir`: user data path (unchanged).
- `--web` / `--web-root`: when mode is `loopback-browser` or `network-accessible`.
- `desktop-bootstrap` secret: passed out-of-band (env or stdin), not via `--token`.

## Testing

- Settings persistence tests (mode + bind host round-trip).
- Sidecar launch argument tests per mode (correct `--host`/`--web` flags).
- Fail-closed test: non-loopback host without opt-in is rejected.
- Restart-on-exposure-change test (bind host change).
- Web-toggle-without-restart test (`local-only` ↔ `loopback-browser`).
