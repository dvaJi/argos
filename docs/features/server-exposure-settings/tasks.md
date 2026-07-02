# Tasks

## Schema + config

- [ ] Define exposure settings schema (`mode`, `bindHost`, `webRoot`) in desktop config.
- [ ] Map exposure mode → `DaemonExposureConfig` (`connection-runtime-auth-model`).

## Sidecar launch

- [ ] Update sidecar launch mapping (`sidecarManager/index.ts:49-76`) to derive `--host`/`--web`/`--web-root` from exposure mode.
- [ ] Pass `desktop-bootstrap` secret out-of-band (env/stdin), not via `--token`.
- [ ] Add fail-closed validation: non-loopback host without `network-accessible` opt-in rejected at startup.

## Restart flow

- [ ] Add safe sidecar restart on bind-host-changing exposure switch.
- [ ] Add web-toggle-without-restart for `local-only` ↔ `loopback-browser`.
- [ ] Update renderer `ConnectionState` after restart.

## UI

- [ ] Add settings UI for mode, bind host, port, browser URL display.
- [ ] Show pairing entrypoint (URL/QR) when browser/LAN allowed — no raw token.
- [ ] Add confirmation dialog + "reachability, not trust" warning for `network-accessible`.
- [ ] Show `relay` as disabled placeholder.

## Testing

- [ ] Settings persistence round-trip tests.
- [ ] Sidecar launch args per mode.
- [ ] Fail-closed validation test.
- [ ] Restart-on-change + web-toggle tests.
