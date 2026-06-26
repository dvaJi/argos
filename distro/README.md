# Distribution (`distro/`)

Source-of-truth assets for distributing the **`argos-daemon`** headless CLI
across Windows, macOS, and Linux. The daemon is a Bun-compiled standalone
binary, so it ships as a single self-contained executable per platform — no
Node/Bun runtime required on the host.

## Layout

```
distro/
  install/
    install.sh    # POSIX installer (macOS + Linux): curl … | sh
    install.ps1   # Windows installer:        irm … | iex
  homebrew/
    Formula/argos-daemon.rb   # source-of-truth Homebrew formula
    README.md                 # tap usage + maintainer notes
  systemd/
    argos-daemon.service      # REFERENCE systemd unit (not auto-installed)
```

## Install commands (end-user)

macOS / Linux (universal script):

```bash
curl -fsSL https://raw.githubusercontent.com/dvaJi/argos/main/distro/install/install.sh | sh
```

macOS / Linux (Homebrew):

```bash
brew install dvaJi/tap/argos-daemon
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/dvaJi/argos/main/distro/install/install.ps1 | iex
```

Pin a version with `ARGOS_VERSION=v0.1.0` (sh) / `$env:ARGOS_VERSION="v0.1.0"` (ps1).

## Updating an existing install

```bash
argos-daemon update            # download + verify + atomically swap the binary
sudo systemctl restart argos-daemon   # (if running under systemd)
```

The daemon also logs an "update available" notice on startup (disable with
`--no-update-check` / `ARGOS_NO_UPDATE_CHECK=1`). For running it as a managed
service, see the [server deployment guide][deploy].

[deploy]: ../docs/features/daemon-self-update/deployment.md

## How it ships

The compiled binaries are published by `.github/workflows/release.yml` as GitHub
Release assets named `argos-daemon-<os>-<arch>[.exe]` (plus matching `.sha256`
files). The install scripts and the Homebrew formula resolve and download those
assets.

The Homebrew formula lives here as the source of truth and is pushed to the
live tap repo (`dvaJi/homebrew-tap`) by `scripts/bump-tap.mjs` after a release
is published.

## Local checks

```bash
pnpm run distro:check   # ruby -c on formula + shellcheck on install.sh (best-effort)
```

See `docs/features/daemon-cli-distribution/` for the full design.
