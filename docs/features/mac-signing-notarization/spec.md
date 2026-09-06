# Feature: macOS code signing & notarization

## Status

Scaffold (2026-09-06). **Blocked on maintainer secrets**: an Apple Developer
Program membership and a valid **Developer ID Application** certificate
(imported as `ARGOS_CSC_LINK` / `ARGOS_CSC_KEY_PASSWORD` repo secrets, plus
`ARGOS_APPLE_NOTARY_USERNAME` / `ARGOS_APPLE_NOTARY_TEAM_ID` /
`ARGOS_APPLE_NOTARY_PASSWORD` — or an App Store Connect API key) are required
before any pipeline work can be verified end-to-end.

## Problem

`build-mac` was re-enabled unsigned in #84 (`docs/features/mac-arm64-unsigned-builds`).
Consequences today:

- Gatekeeper blocks the dmg/zip by default (release notes must say
  "right-click → Open").
- `electron-updater` will not install unsigned mac updates, so the
  `latest-mac.yml` feed published with each release is dead weight for mac
  users — mac has no working update channel.
- The app is ad-hoc signed, so the bundled CUA helper cannot get proper
  authorization from TCC across launches the way a signed app can.

## Goal

1. Import a Developer ID Application certificate into the release pipeline
   (secrets only, no cert material in the repo) and sign `Argos.app` plus the
   bundled helpers (CUA helper, daemon binary in `extraResources` if required
   by notarization) with hardened runtime.
2. Notarize + staple the dmg/zip via `scripts/notarize.js` (already wired as
   `afterSign` in `electron-builder.yml`; it early-returns without
   `build_for_release` — restore that wiring for release builds).
3. Verify the full update channel: publish a signed release, confirm
   `sparkle`-style upgrade (electron-updater) installs on an Apple Silicon
   test machine from the previous signed version.
4. Re-add mac **x64** builds if the certificate covers it (matrix currently
   arm64-only; cross-arch CUA build limitation from the unsigned stopgap needs
   a native-host workaround or an arm64-only decision recorded).

## Acceptance criteria

- [ ] `spctl -a -vv dist/mac-arm64/Argos.app` reports accepted (Developer ID).
- [ ] dmg/zip are notarized and stapled (`stapler validate` passes).
- [ ] `latest-mac.yml` sha512 matches the signed artifacts and an upgrade from
      the prior signed release installs cleanly.
- [ ] Release notes drop the "unsigned" caveat.
- [ ] Windows/Linux pipelines unchanged.

## Non-goals

- Mac App Store distribution (`mas` target).
- Developer ID Installer certificates / pkg targets.
