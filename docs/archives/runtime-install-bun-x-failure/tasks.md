# Tasks

- [x] Add `tiny-runtime-injector: ^1.2.0` to root `devDependencies`.
- [x] Add `scripts/installRuntime.mjs` using `RuntimeInjector` (`--platform`/`--arch` flags + version
      matrix: ripgrep 15.1.0 on win32/arm64, 14.1.1 elsewhere).
- [x] Rewrite the seven `installRuntime*` npm scripts to call `bun scripts/installRuntime.mjs`.
- [x] Run `bun i` — postinstall completes without `%TEMP%` `ParserError`; `runtime/*/` executables
      remain present; runtimes report "already installed, skipping download".
- [x] Run `bun run format` (exit 0) and `bun run lint` (exit 0).
