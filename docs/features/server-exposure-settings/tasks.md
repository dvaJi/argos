# Tasks

## Schema + config

- [x] Define exposure settings schema (`mode`, `bindHost`, `webRoot`) in desktop config.
- [x] Map exposure mode -> `DaemonExposureConfig` (`connection-runtime-auth-model`).

## Sidecar launch

- [x] Update sidecar launch mapping (`sidecarManager/index.ts:49-76`) to derive `--host`/`--web`/`--web-root` from exposure mode.
- [x] Pass `desktop-bootstrap` secret out-of-band (env/stdin), not via `--token`.
- [x] Add fail-closed validation: non-loopback host without `network-accessible` opt-in rejected at startup.

## Restart flow

- [x] Add safe sidecar restart on bind-host-changing exposure switch.
- [x] Add web-toggle-without-restart for `local-only` <-> `loopback-browser`.
- [x] Update renderer `ConnectionState` after restart.

## UI

- [x] Add settings UI for mode, bind host, port, browser URL display.
- [x] Show pairing entrypoint (URL/QR) when browser/LAN allowed - no raw token.
- [x] Add confirmation dialog + "reachability, not trust" warning for `network-accessible`.
- [x] Show `relay` as disabled placeholder.

## Testing

- [x] Settings persistence round-trip tests.
- [x] Sidecar launch args per mode.
- [x] Fail-closed validation test.
- [x] Restart-on-change + web-toggle tests.

