# CUA Plugin — Bundle Into Windows & Linux Builds

## Problem

The CUA plugin (`com.argos.plugins.cua`) declares win32/linux support
(`engines.targets`: `win32/x64`, `win32/arm64`, `linux/x64`) and the runtime build
script stages checksum-pinned Rust driver assets for those targets, but only the
macOS pipeline wires it in:

- Root `package.json`: `build:mac*` run `plugin:cua:build` + `plugin:bundle`;
  `build:win*` / `build:linux*` run only `plugin:bundle:clean` + electron-builder.
- CI (`build.yml`, `release.yml`): windows/linux jobs never build or bundle CUA;
  only the (currently disabled) mac job does.
- Result: no `.dcplugin` lands in `build/bundled-plugins/` for win/linux, so
  `extraResources` ships nothing and packaged win/linux installs have no bundled
  CUA plugin.

## Goal

Build and bundle the CUA plugin for Windows (x64, arm64) and Linux (x64) in both
local build scripts and CI (build + release workflows), mirroring the existing
macOS pipeline.

## Acceptance Criteria

- New npm scripts mirror the mac variants: `plugin:cua:build:win:x64`,
  `plugin:cua:build:win:arm64`, `plugin:cua:build:linux:x64`.
- `build:win`, `build:win:x64`, `build:win:arm64`, `build:linux`,
  `build:linux:x64` run the CUA runtime build and `plugin:bundle -- --name cua`
  before electron-builder.
- `build.yml` and `release.yml` windows/linux jobs run the CUA runtime build +
  bundle before electron-builder, and verify the bundled `.dcplugin` in the
  packed output afterwards (same as the mac job).
- Packaged win/linux apps discover the plugin via the existing
  `resources/app.asar.unpacked/plugins` scan (no runtime code changes needed).
- `bun run format`, `bun run lint` pass; packaging validation
  (`packaging:validate`) is unaffected (bundled-plugins remains a generated
  resource source).

## Constraints

- `linux/arm64` stays unbundled: upstream pins `unsupportedTargets:
  ["linux/arm64"]` in `plugins/cua/vendor/cua-driver/upstream.json` and has no
  linux-arm64 asset. `build:linux:arm64` remains CUA-free by design.
- Tool catalog generation requires a native host
  (`canRunTarget` in `scripts/build-cua-plugin-runtime.mjs`). CI satisfies this:
  windows jobs run on Windows runners (x64 on `windows-2025-vs2026`, arm64 on
  `windows-11-arm`), linux job on `ubuntu-22.04` x64. Cross-compiling the plugin
  from a non-matching host fails by design.
- The driver download is checksum-pinned (pinned checksums file → pinned asset
  digest → upstream checksums entry); no new network surfaces are introduced.
- No macOS signing impact; `stageCuaManagedHelper` remains darwin-only.

## Non-Goals

- Publishing standalone `.dcplugin` artifacts to GitHub Releases for win/linux
  (the plugin manifest `source.url` fallback) — later work if needed.
- Enabling the disabled mac jobs.
