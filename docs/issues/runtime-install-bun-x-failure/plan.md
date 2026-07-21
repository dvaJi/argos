# Plan

## Approach

1. Declare `tiny-runtime-injector` (`^1.2.0`) as a root devDependency. It is ESM
   (`"type": "module"`, `main: dist/index.js`) and exports `RuntimeInjector`.
2. Add `scripts/installRuntime.mjs` that:
   - Imports `RuntimeInjector` from `tiny-runtime-injector`.
   - Reads optional `--platform` / `--arch` CLI flags, defaulting to `process.platform` /
     `process.arch` so the host default still works.
   - Encodes the version matrix: `uv` `0.9.18`, `ripgrep` `14.1.1` (overridden to `15.1.0` on
     `win32/arm64`), `rtk` latest (no `version`).
   - Runs each injector sequentially and fails fast on error.
3. Replace the seven `installRuntime*` npm scripts with calls to the new script. The default
   `installRuntime` auto-detects host platform/arch; the six `:<os>:<arch>` variants pass
   `--platform`/`--arch` explicitly.

## Affected Files

- `package.json`: add devDependency; rewrite `installRuntime`, `installRuntime:win:x64`,
  `installRuntime:win:arm64`, `installRuntime:mac:arm64`, `installRuntime:mac:x64`,
  `installRuntime:linux:x64`, `installRuntime:linux:arm64`.
- `scripts/installRuntime.mjs`: new.

## Compatibility

- `postinstall: bun run installRuntime` is unchanged; it just runs the new script.
- Output layout (`runtime/uv`, `runtime/ripgrep`, `runtime/rtk`) is unchanged, so `runtimeHelper.ts`
  and `electron-builder.yml` (`extraResources: ./runtime/`) keep working.
- Cross-compile CI flows that call `bun run installRuntime:<os>:<arch>` keep the same targeting.

## Test Strategy

- `bun i` from Windows must complete the postinstall without a `ParserError` from `%TEMP%`.
- Spot-check `runtime/uv/uv.exe`, `runtime/ripgrep/rg.exe`, `runtime/rtk/rtk.exe` exist after install.
- `bun run installRuntime:win:arm64` must resolve ripgrep `15.1.0` (logged) without affecting other
  variants.
- `bun run lint` (architecture guard + oxlint) and `bun run format` stay green.
