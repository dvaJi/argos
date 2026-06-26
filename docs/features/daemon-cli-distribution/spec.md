# Daemon CLI Distribution

## User Need

The landing page advertises an install command (`brew install --cask argos`) that points to a Homebrew package that does not exist. Meanwhile Argos ships a self-contained headless backend (`@argos/daemon` / `argos-daemon`) that is already compiled per platform during the release workflow, but is never published as a downloadable artifact. Users have no way to install or run the daemon independently of the desktop app on Windows, macOS, or Linux.

## Goal

Make `argos-daemon` installable across Windows, macOS, and Linux through:

1. **GitHub Releases** — publish the compiled daemon binary (per OS/arch) as a release asset, alongside the desktop app assets.
2. **A universal install script** — `curl | sh` (POSIX) and `irm | iex` (PowerShell) that resolve the latest release and download the correct binary.
3. **A Homebrew tap** — `brew install dvaJi/tap/argos-daemon` for macOS and Linux (Linuxbrew).
4. **Accurate landing-page copy** — replace the fictional cask command with real, working commands for each platform.

The daemon is a Bun-compiled standalone binary with **no runtime dependency** (no Node/Bun required on the host), so it distributes like a Go binary.

## Acceptance Criteria

- [ ] Every published release (tag `v*.*.*`) includes daemon binaries named per platform/arch:
  - `argos-daemon-windows-x64.exe`
  - `argos-daemon-windows-arm64.exe`
  - `argos-daemon-linux-x64`
  - `argos-daemon-darwin-x64` (when macOS build is re-enabled)
  - `argos-daemon-darwin-arm64` (when macOS build is re-enabled)
- [ ] `distro/install/install.sh` detects OS+arch, fetches the matching asset from GitHub Releases, verifies the download, installs to `~/.argos/bin` (or `$ARGOS_INSTALL_DIR`), and prints next steps.
- [ ] `distro/install/install.ps1` does the equivalent on Windows, installing to `%USERPROFILE%\.argos\bin`.
- [ ] `distro/homebrew/Formula/argos-daemon.rb` is a valid Homebrew formula pointing at the GitHub release asset; `brew install dvaJi/tap/argos-daemon` works after the tap repo is populated.
- [ ] A `distro:bump-tap` script updates the version + sha256 in the formula and pushes it to the `dvaJi/homebrew-tap` repo.
- [ ] Landing page (`Hero.tsx`, `Download.tsx`) shows real, working commands and no longer references the nonexistent cask.
- [ ] `argos-daemon --version` reports the release version (currently it does not — see plan).

## Constraints

- Tag-driven releases only; assets are produced by the existing `.github/workflows/release.yml` pipeline. Do not introduce a parallel release mechanism.
- The daemon binary is built on each platform's runner (`build:daemon`), so it is native-built, not cross-compiled.
- macOS desktop build is currently disabled in CI (`if: false`); macOS daemon assets are therefore not produced today. The install script and formula must gracefully handle a missing macOS asset until macOS builds are re-enabled.
- Single unified release tag (`v<app-version>`). The daemon ships at the same tag as the desktop app. (Independent daemon versioning is a non-goal for now.)
- The release job currently creates a **draft** release. The tap sync must only run after the release is published, or it will point at non-downloadable assets.

## Non-Goals

- An npm package wrapper (`@argos/daemon` with platform optional-deps). Viable later for JS developers, but adds a Node prerequisite that is awkward for a headless server tool. Revisit if demand appears.
- A Homebrew **cask** for the desktop GUI app. Out of scope; the landing-page cask command will be replaced with daemon commands, not made real.
- Windows package managers (Scoop/Winget). Revisit later.
- **Automatic/unattended daemon updates.** The daemon ships a manual `argos-daemon update` command and a startup update-notice (see `daemon-self-update`); fully automatic/scheduled updates and OS-package-manager (deb/rpm) repos remain out of scope here.

## Open Questions

None blocking. Decision log:

- **Where do distribution artifacts live?** In-repo under `distro/` as the source of truth (install scripts + formula template). The live Homebrew tap lives in a separate `dvaJi/homebrew-tap` repo (Homebrew convention: `brew tap dvaJi/tap` clones `github.com/dvaJi/homebrew-tap`), populated automatically by `distro:bump-tap` on release.
- **Serving URL for install scripts?** `https://raw.githubusercontent.com/dvaJi/argos/main/distro/install/<script>` (stable, cacheable, no infra to run). The landing site may proxy this later for a prettier URL.
