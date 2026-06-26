# Daemon Self-Update

## User Need

Once `argos-daemon` is installed standalone (script, manual binary, or Homebrew)
and run as a long-lived server (typically under systemd), there is no way to keep
it current short of re-running the installer or `brew upgrade`. Operators have no
signal that an update exists and no single command to apply one. The daemon must
be updatable in place and runnable as a managed service.

## Goal

1. **`argos-daemon update` subcommand** — checks GitHub Releases, downloads the
   matching platform binary, verifies its sha256, and atomically replaces the
   running binary in place. Manual and explicit (no automatic restart).
2. **Startup "update available" notice** — on boot, the daemon compares its
   version to the latest release and logs a one-line notice. Opt-out for
   air-gapped/offline servers.
3. **systemd deployment guidance** — a reference unit file + docs describing how
   to run the daemon as a service and the update→restart flow
   (`argos-daemon update` then `sudo systemctl restart argos-daemon`).

## Acceptance Criteria

- [ ] `argos-daemon update` resolves latest release, and when already current
      prints `Already up to date (vX.Y.Z).` and exits 0.
- [ ] When an update exists, it downloads `argos-daemon-<os>-<arch>[.exe]`,
      verifies against the published `<asset>.sha256`, and replaces the binary at
      `process.execPath` (overridable via `--install-dir`).
- [ ] On Linux/macOS the running process is not disturbed (rename over inode); on
      Windows, if the binary is locked, it writes `<name>.new` and prints
      stop-and-replace instructions instead of failing silently.
- [ ] On startup the daemon logs `Update available: vX.Y.Z (current vX.Y.Z). Run
      \`argos-daemon update\`.` (or `Up to date.`) when reachable, and stays
      silent when offline/rate-limited.
- [ ] `--no-update-check` / `ARGOS_NO_UPDATE_CHECK=1` disables the startup check.
- [ ] A reference systemd unit ships under `distro/systemd/` and a deployment
      guide documents install-as-service + the manual update→restart flow.

## Constraints

- Manual updates only. No automatic/unattended updates, no systemd auto-update
  timer. (See `daemon-cli-distribution` for the non-goal of auto-update.)
- The daemon is a Bun-compiled binary; the running process cannot restart its own
  systemd unit without privileges. Restart is therefore an explicit, documented
  operator step.
- Must work behind the GitHub API unauthenticated (subject to rate limits); the
  startup check must never block or fail startup on network errors.
- Version comparison is by tag string equality (`v0.1.0`); no semver range logic
  needed for v1.

## Non-Goals

- Automatic / scheduled updates (systemd timer, polling daemon).
- OS-package-manager integration (deb/rpm repos) for updates.
- A/B / canary rollouts, rollback, or multiple-version coexistence.
- Restarting the service from within the process.

## Open Questions

None blocking. Decision: privilege model and install layout are left to the
operator (documented), not enforced by tooling — per maintainer direction, we
ship docs + a reference unit rather than an installer that manages users/paths.
