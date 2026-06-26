# Plan — Daemon CLI Distribution

## Approach

Three layers, all driven off the existing tag-based release:

1. **Publish daemon binaries** in the release workflow.
2. **Install scripts** that download the right asset from GitHub Releases.
3. **Homebrew formula** (source-of-truth in repo) synced to a tap repo on release.

## File Layout

```
distro/
  README.md                          # overview of the distribution layer
  install/
    install.sh                       # POSIX installer (macOS + Linux)
    install.ps1                      # Windows PowerShell installer
    _lib.sh                          # shared helpers (resolve latest tag, sha256 check)
  homebrew/
    README.md                        # tap usage + maintainer notes
    Formula/
      argos-daemon.rb                # source-of-truth formula (version + sha256 bumped on release)
scripts/
  bump-tap.mjs                       # updates formula + pushes to dvaJi/homebrew-tap
```

## 1. Release pipeline changes (`.github/workflows/release.yml`)

Each platform build job already runs `pnpm run build:daemon`, producing `apps/daemon/dist/argos-daemon[.exe]`. Today this is **not** captured.

Changes per build job (`build-windows`, `build-linux`, and `build-mac` when re-enabled):

- After the build, **rename** the daemon binary to the platform-arch asset name and stage it under a `daemon/` folder:
  ```bash
  mkdir -p dist/daemon
  cp apps/daemon/dist/argos-daemon.exe dist/daemon/argos-daemon-windows-x64.exe   # per arch
  ```
- Add `dist/daemon/*` to that job's `upload-artifact` paths.

In the `release` job (after "Prepare release assets"):

- Copy each `artifacts/argos-*/daemon/argos-daemon-*` into `release_assets/`.
- Compute `sha256` per binary into `release_assets/*.sha256` so install scripts and the formula can verify.

Asset naming convention: `argos-daemon-<os>-<arch>[.exe]` (os ∈ `windows|linux|darwin`, arch ∈ `x64|arm64`).

> Note: the release is still created as a **draft**. The tap sync (below) must run only after the maintainer publishes the release. `distro:bump-tap` is a separate, manually-invoked step (dispatched locally after publish) to avoid the formula pointing at draft-only assets.

## 2. Install scripts

### `distro/install/install.sh` (POSIX)

- Detect `uname -s` → `darwin|linux`, `uname -m` → `x64|arm64` (map `aarch64`→`arm64`, `x86_64`→`x64`).
- Resolve latest release tag via `https://api.github.com/repos/dvaJi/argos/releases/latest` (allow `ARGOS_VERSION` override, e.g. `v0.1.0`).
- Download `argos-daemon-<os>-<arch>[.exe]` from the tag's assets.
- Verify against the matching `.sha256` asset when present.
- Install to `${ARGOS_INSTALL_DIR:-$HOME/.argos/bin}`, `chmod +x`, and print a PATH hint.
- No external deps beyond `curl`, `shasum`/`sha256sum`, `tar`/`unzip` (none needed — binary ships uncompressed).

### `distro/install/install.ps1` (Windows)

- Resolve arch via `[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture`.
- Resolve latest tag via the GitHub API (`Invoke-RestMethod`).
- Download the `.exe`, verify sha256 (`Get-FileHash`), place in `$env:USERPROFILE\.argos\bin\argos-daemon.exe`, and print a PATH hint.

Both scripts are `set -e` / `$ErrorActionPreference = 'Stop'` strict and fail loudly on missing assets (e.g. macOS until re-enabled).

## 3. Homebrew tap

### Source of truth: `distro/homebrew/Formula/argos-daemon.rb`

Standard formula:

```ruby
class ArgosDaemon < Formula
  desc "Argos headless backend server"
  homepage "https://github.com/dvaJi/argos"
  version "0.1.0"
  # sha256 + url filled per asset by scripts/bump-tap.mjs
  ...
  def install
    bin.install "argos-daemon-..."
  end
end
```

Because Homebrew requires per-arch bottles only for universal coverage, we use a **headless formula with on_mac/on_linux blocks** selecting the right asset URL + sha256 per arch. This avoids needing a full bottle pipeline for an early-stage project.

### Live tap: `dvaJi/homebrew-tap`

- Created once (empty repo with a `Formula/` directory). The `distro/homebrew/Formula/argos-daemon.rb` here is the source of truth.
- `scripts/bump-tap.mjs <version>`:
  1. Reads release asset sha256s (from the published GitHub release).
  2. Rewrites the formula's `version`, per-arch `url`/`sha256` blocks.
  3. Clones `dvaJi/homebrew-tap` (via `HOMEBREW_TAP_TOKEN`), copies the formula in, commits, pushes.
- Invoked by the maintainer **after** the draft release is published.

### `scripts/bump-tap.mjs`

Node ESM script. Args: `<version>` (e.g. `0.1.0`). Uses `fetch` (Node 24) for the GitHub API, `node:child_process` for git. Validates every referenced asset exists on the published release before rewriting the formula.

## 4. `argos-daemon --version`

The CLI currently lacks a `--version` flag (only `--help`). Add a `--version`/`-V` branch in `apps/daemon/src/index.ts` that reads the daemon `package.json` version and prints it. This lets the install script, formula `caveats`, and users verify the installed build.

## 5. Landing-page copy

`apps/landing/src/components/Hero.tsx` and `Download.tsx`:

- Replace `brew install --cask argos` with platform-specific, working commands:
  - macOS/Linux: `brew install dvaJi/tap/argos-daemon`
  - Windows: `irm https://raw.githubusercontent.com/dvaJi/argos/main/distro/install/install.ps1 | iex`
- The desktop-app download cards keep pointing at GitHub Releases (already accurate).

## Compatibility

- No change to desktop app packaging or the daemon's runtime behavior.
- Release assets set grows by N binaries + N sha256 files; the draft-release step already globs `release_assets/*`.
- The daemon `package.json` version stays in sync with the app version (both `0.1.0`) so the unified tag is valid.

## Test Strategy

- **Install scripts**: shellcheck on `install.sh`; a `test/distro/install.test.ts` (vitest, mocked `fetch`/`spawnSync`) asserting asset-name resolution and arch mapping for darwin/linux/arm64/x64 and the Windows arch mapping.
- **Formula**: `brew audit --strict distro/homebrew/Formula/argos-daemon.rb` runs in a `distro:check` script (best-effort; skipped where brew is unavailable). Validate Ruby syntax with `ruby -c`.
- **bump-tap**: unit test the formula-rewrite function against a fixture formula + fake release payload.
- **Smoke**: after a real release, run `curl … install.sh | sh` in a fresh container and assert `argos-daemon --version` prints the version.
