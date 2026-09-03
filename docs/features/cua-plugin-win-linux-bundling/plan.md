# Plan: CUA Plugin — Bundle Into Windows & Linux Builds

## Approach

Replicate the proven macOS bundling pipeline for win32/linux. The existing
scripts already support it end to end:

1. `scripts/build-cua-plugin-runtime.mjs` accepts `--platform`/`--arch` and maps
   `win32/x64 → windows-x64`, `win32/arm64 → windows-arm64`,
   `linux/x64 → linux-x64` in `targetAssetKeys` (checksum-pinned upstream
   assets). It stages `runtime/<platform>/<arch>/` with `cua-driver` executable,
   `tool-catalog.json` (native-target `dump-docs`), and `integrity.json`.
2. `scripts/plugin.mjs bundle -- --name cua --platform <p> --arch <a>` re-runs
   the native build, then packages `plugins/cua` into
   `build/bundled-plugins/argos-plugin-cua-<version>-<platform>-<arch>.dcplugin`
   (`stageCuaManagedHelper` is a no-op off darwin).
3. `electron-builder.yml` `extraResources` already copies
   `build/bundled-plugins/**/*.dcplugin` for every platform.
4. `scripts/plugin.mjs verify -- --name cua --platform <p> --arch <a>
   --plugin-root <packed plugins dir>` confirms the artifact landed in the
   packed app (win: `dist/win[-arm64]-unpacked/resources/app.asar.unpacked/plugins`,
   linux: `dist/linux-unpacked/resources/app.asar.unpacked/plugins`).

## Changes

1. **`package.json`**
   - Add `plugin:cua:build:win:x64`, `plugin:cua:build:win:arm64`,
     `plugin:cua:build:linux:x64` (explicit `--platform` + `--arch`).
   - `build:win` / `build:win:x64` / `build:win:arm64` /
     `build:linux` / `build:linux:x64`: insert the CUA build step and
     `plugin:bundle -- --name cua --platform win32|linux [--arch …]` after
     `plugin:bundle:clean`, before electron-builder. The generic `build:linux`
     is pinned to x64 end to end (host-arch default would attempt the
     upstream-unsupported `linux/arm64` target on arm64 hosts).
   - `build:linux:arm64` unchanged (upstream-unsupported target).
2. **`.github/workflows/build.yml`**
   - `build-windows`: add `plugin:cua:build:win:<arch>` + `plugin:bundle` steps
     in the "Build Windows" run block; add "Verify bundled plugins" step against
     `dist/<unpacked>/resources/app.asar.unpacked/plugins`.
   - `build-linux`: same for `linux/x64` against `dist/linux-unpacked/...`.
3. **`.github/workflows/release.yml`** — identical changes to its
   `build-windows` / `build-linux` jobs.

## Risks

- Tool catalog generation is native-target-only; a host/target mismatch fails
  fast with a clear error (acceptable; all CI runners are native).
- CI runners need network access to github.com release downloads (already the
  case for `installRuntime`).
- `plugin:verify` expects the versioned `.dcplugin` filename; the root package
  version flows through `--release-version-from-root`, same as mac.
