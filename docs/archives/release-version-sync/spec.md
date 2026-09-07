# Issue: Release version metadata drift (desktop version + stale tooling URLs)

## Summary

The v0.4.0 release exposed two version-metadata gaps:

1. `apps/desktop/package.json` carries its own `version` (was `0.2.0` while the
   release was `0.4.0`). electron-builder uses it for artifact names
   (`argos-<version>-windows-x64.exe`), `latest*.yml` update manifests, and the
   app's `app.getVersion()`. It is only correct if someone remembers to bump it
   in lockstep with the root `package.json` — v0.3.0 shipped files named
   `argos-0.2.0-windows-*.exe` because nobody did.
2. `apps/desktop/build/generate-version-files.mjs` generates download-page
   helper JSONs whose `githubUrl`s point at asset names that never existed
   (`Argos-<version>-windows-<arch>.exe`, `desktop-…`); the real published
   names since #89 are `argos-<version>-<os>-<arch>.<ext>` (AppImage uses
   `x86_64`).

## Goal

- A single command that syncs the root release version into
  `apps/desktop/package.json` and verifies the `CHANGELOG.md` section exists.
- A CI preflight check so a release run fails fast with a clear message when
  the desktop version or the changelog section is missing — before building.
- Correct, current asset URLs in `generate-version-files.mjs`.

## Constraints

- Root `package.json` stays the single source of truth; the desktop version is
  derived, never edited by hand at release time.
- The script runs under bun (`bun-file-io` rule).
- CI check must be non-mutating (`--check`) and fail with actionable text.
