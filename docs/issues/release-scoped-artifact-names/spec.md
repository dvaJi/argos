# Issue: Mac DMG build fails and Linux assets are silently dropped (scoped artifact names)

## Summary

The v0.4.0 release run (after the preflight fix) failed in `build-mac (arm64)`:
both mac targets (`zip`, `dmg`) crashed because electron-builder writes
artifacts into `dist/@argos/` and the external `zip` / `dmgbuild` tools do not
create that directory. The Linux build "succeeded" but wrote its artifacts to
the same nested directory, where the release job's flat copy globs silently
skip them — the release would have shipped without Linux assets.

## Evidence

Mac (release run, build-mac arm64):

```
FileNotFoundError: [Errno 2] No such file or directory:
  '/Users/runner/work/argos/argos/dist/@argos/.temp…desktop-0.2.0-mac-arm64.dmg'
zip error: Could not create output file
  (/Users/runner/work/argos/argos/dist/@argos/desktop-0.2.0-mac-arm64.zip)
```

Linux (same run, build-linux x64 — job green, assets misplaced):

```
• building target=AppImage arch=x64 file=dist/@argos/desktop-0.2.0-linux-x86_64.AppImage
• building target=tar.gz  arch=x64 file=dist/@argos/desktop-0.2.0-linux-x64.tar.gz
```

Release job asset prep copies flat globs with `|| true`:
`cp artifacts/argos-linux-x64/*.AppImage release_assets/ 2>/dev/null || true`.

## Root cause

- `electron-builder.yml` uses `${name}` in the mac and linux `artifactName`
  templates. The app package name is the scoped `@argos/desktop`, and
  electron-builder 26 expands it to scope-directory + unscoped filename
  (`dist/@argos/desktop-…`). Windows avoids the bug because its template is
  the literal `argos-${version}-windows-${arch}.${ext}`.
- Mac's `zip`/`dmgbuild` targets shell out to external tools that don't mkdir;
  Windows NSIS and Linux AppImage/tar.gz are produced in-process (linux
  "succeeded" into the wrong directory).
- The mac job was disabled (`if: false`) until #84 re-enabled it this cycle,
  so this path had never run against electron-builder 26 with a scoped name.
- Historical assets (`argos-0.2.0-linux-x64.tar.gz` on the v0.2.0 release)
  predate the `${name}` templates.

Secondary finding: `apps/desktop/package.json` was still at `0.2.0`, so the
v0.3.0 release shipped files named `argos-0.2.0-windows-*.exe`, and
`app.getVersion()` / `latest*.yml` (auto-update) report the stale version.

## Fix direction

- Make mac and linux `artifactName` literal, matching windows:
  `argos-${version}-mac-${arch}.${ext}` and
  `argos-${version}-linux-${arch}.${ext}` — flat `dist/` output, consistent
  names across platforms.
- Bump `apps/desktop/package.json` version to the release version (0.4.0) so
  artifact names and auto-update metadata match the tag.

## Out of scope (noted)

`apps/desktop/build/generate-version-files.mjs` hardcodes `Argos-<version>-*`
asset URLs that match no real artifact names; it is not wired into the release
workflow (manual helper). Follow-up cleanup, not a release blocker.
