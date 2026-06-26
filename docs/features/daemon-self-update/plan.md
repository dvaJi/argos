# Plan — Daemon Self-Update

## Approach

Three pieces, all manual/explicit:

1. **`argos-daemon update`** — the actual update logic.
2. **Startup notice** — fire-and-forget version check on boot.
3. **systemd reference + docs** — how to run as a service and the update→restart flow.

## Files

```
apps/daemon/src/
  version.ts          # resolveDaemonVersion() + __DAEMON_VERSION__ declaration (extracted from index.ts)
  update.ts           # checkForUpdate(), runSelfUpdate(), platform/asset helpers
  index.ts            # wire `update` subcommand + startup notice + help text
  lifecycle.ts        # add noUpdateCheck to DaemonOptions/parseArgs/mergeOptions
distro/systemd/
  argos-daemon.service  # REFERENCE unit (not auto-installed)
docs/features/daemon-self-update/
  deployment.md       # install-as-service + manual update→restart guide
```

## 1. `update` subcommand (`update.ts`)

- `checkForUpdate(currentVersion?, token?)` → `GET /repos/dvaJi/argos/releases/latest`
  (6s timeout, returns `null` on any error / rate limit so callers stay quiet).
  Result: `{ current, latest, hasUpdate, htmlUrl }`. Comparison is tag-string equality.
- `runSelfUpdate({ installDir?, token? })`:
  1. Resolve current via `resolveDaemonVersion()`; resolve latest via `checkForUpdate`.
  2. If `!hasUpdate` → `Already up to date (vX).`, exit 0.
  3. Detect asset: `process.platform` → `windows|linux|darwin`, `process.arch` → `x64|arm64`;
     asset = `argos-daemon-<os>-<arch>[.exe]`.
  4. Download asset buffer; fetch `<asset>.sha256`; verify with `node:crypto` sha256. Abort on mismatch.
  5. Target path = `opts.installDir ? join(installDir, binaryName) : process.execPath`.
  6. `replaceBinary(tmp, target)`:
     - **POSIX**: `rename(tmp, target)` — safe even while the daemon runs (old inode kept).
     - **Windows**: try `rename(tmp, target)`; on lock failure, `rename(target, target.old)`
       (Windows allows renaming a running exe) then `rename(tmp, target)`; instruct the operator
       to delete `.old` after restart.
  7. Print result + restart hint (`sudo systemctl restart argos-daemon`).

## 2. Startup notice (`index.ts`)

After the server logs readiness in `startDaemon`, unless `noUpdateCheck`:
```ts
void checkForUpdate().then((c) => {
  if (!c) return;                       // offline / rate-limited → silent
  c.hasUpdate
    ? logger.info(`[daemon] Update available: v${c.latest} (current v${c.current}). Run \`argos-daemon update\`.`)
    : logger.info(`[daemon] Up to date (v${c.current}).`);
});
```
- Opt-out: `--no-update-check` flag / `ARGOS_NO_UPDATE_CHECK=1` env (added to `lifecycle.ts`).
- Never awaited, never throws into startup; network failure is swallowed by `checkForUpdate`.

## 3. systemd (`distro/systemd/argos-daemon.service`)

A **reference** unit (not installed by any script): `User=`, `ExecStart=`, `Restart=always`,
hardening (`NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths` for the data dir), and
an `ExecStartPre` note. The deployment doc shows:

```bash
sudo install -m 0755 argos-daemon /usr/local/bin/argos-daemon
sudo install -m 0644 distro/systemd/argos-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now argos-daemon
# later, to update:
sudo argos-daemon update && sudo systemctl restart argos-daemon
```

Privilege/install layout is left to the operator (recommended: a dedicated `argos` user +
`/opt/argos-daemon`), not enforced by tooling.

## Compatibility

- No change to daemon runtime behavior beyond one best-effort network call at startup.
- `version.ts` extraction keeps `__DAEMON_VERSION__` define working (bun replaces the
  identifier bundle-wide, regardless of source file).
- `distro/install/*` scripts unchanged; `update` is the in-place counterpart.

## Test Strategy

- `test/daemon/update.test.ts`: mock `fetch` to return a fake release; assert
  `checkForUpdate` mapping (hasUpdate true/false), asset-name detection, and that
  `runSelfUpdate` writes+renames when an update exists and short-circuits when current.
- `ruby -c`/shellcheck not applicable; `pnpm run build:daemon` confirms the binary still
  compiles and `--version`/`update --help` behave.
- Manual smoke on Linux: run `argos-daemon update` against a release with a newer tag,
  confirm swap + that a running daemon keeps serving until `systemctl restart`.
