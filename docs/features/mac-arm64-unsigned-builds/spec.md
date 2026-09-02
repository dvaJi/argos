# Mac Builds — Re-Enable Unsigned (Apple Silicon Only)

## Problem

Both `build.yml` and `release.yml` disable their `build-mac` jobs
(`if: false`) pending code signing/notarization setup. While disabled:

- No mac artifacts are produced at all, so mac regressions go unnoticed.
- The disabled jobs build `mac/x64` on `macos-15` runners, which are arm64 —
  the CUA plugin runtime build fails on cross-arch targets because tool-catalog
  generation requires a native host (`canRunTarget` in
  `scripts/build-cua-plugin-runtime.mjs`).

## Goal

Re-enable mac CI builds for **arm64 (Apple Silicon) only, unsigned**, in both
workflows. The app and the bundled CUA helper receive ad-hoc signatures;
notarization is skipped.

Decision (user-confirmed): enable in **both** workflows. Unsigned dmg/zip will
be attached to GitHub releases even though Gatekeeper blocks them by default
and mac auto-update will not install them.

## Acceptance Criteria

- `build.yml` `build-mac`: enabled, matrix `arch: [arm64]`, env contains no
  `CSC_LINK`/`CSC_KEY_PASSWORD`/`ARGOS_APPLE_NOTARY_*`/`build_for_release`, and
  sets `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` so electron-builder skips
  identity lookup (arm64 is still ad-hoc signed so it can run).
- `release.yml` `build-mac`: same env changes, arm64-only matrix, `if: false`
  removed.
- `release.yml` `release` job adds `build-mac` to `needs:` so release asset
  staging deterministically includes (or fails on) mac artifacts instead of
  racing the artifact download.
- Notarization hook stays inert: `scripts/notarize.js` early-returns without
  `build_for_release` (verified by inspection).
- CUA helper: `signMacHelperForRelease` returns false without
  `build_for_release` → ad-hoc fallback; `package-plugin.mjs`
  `createDarwinSigningContract(undefined)` → `signatureType: 'ad-hoc'`, no Team
  ID required. The bundled plugin therefore packages cleanly unsigned.
- `plugin:verify` continues to guard the bundled `.dcplugin` in
  `dist/mac-arm64/Argos.app/Contents/Resources/app.asar.unpacked/plugins`.

## Constraints / Known Trade-offs

- Unsigned (ad-hoc) artifacts: Gatekeeper requires explicit user override
  (right-click → Open, or clearing quarantine); `latest-mac.yml` updates will
  be refused by electron-updater on machines running the previous signed build.
- `mac/x64` is intentionally not built: no x64 mac runners are configured, and
  CUA tool-catalog generation is native-target-only.
- Local `build:mac*` scripts are untouched (still signing-capable for
  release-prep environments).
- Release asset staging already handles mac conditionally
  (`artifacts/argos-mac-*`, `merge_mac_yml latest-mac.yml`) — no changes needed
  there.

## Non-Goals

- Setting up Developer ID signing/notarization.
- Re-introducing `mac/x64` builds.
