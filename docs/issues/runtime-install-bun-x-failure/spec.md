# Runtime install (bun x → programmatic)

## Summary

`bun i` fails on Windows because the `installRuntime` postinstall script invokes
`bun x tiny-runtime-injector`, and `bun x` writes a temp `package.json` to `%TEMP%` that gets
corrupted by a locale/encoding bug (`ParserError: Unexpected use` on a line of mojibake). The
runtime tool itself is fine; the `bun x` fetch-and-run mechanism is the failure.

## User Story

As a contributor on Windows (and any platform), `bun i` completes the postinstall runtime fetch
without hitting a `bun x` temp-file corruption.

## Acceptance Criteria

- `tiny-runtime-injector` is a declared devDependency (pinned, resolved from `node_modules`), no
  longer fetched ad hoc by `bun x`.
- `installRuntime` runs the installer via its programmatic `RuntimeInjector` API from a repo-owned
  `scripts/installRuntime.mjs`.
- Existing platform/arch matrix is preserved: `uv` 0.9.18 everywhere, `ripgrep` 14.1.1 default and
  15.1.0 on `win32/arm64`, `rtk` latest. Cross-compile variants (`installRuntime:win:x64`,
  `:win:arm64`, `:mac:arm64`, `:mac:x64`, `:linux:x64`, `:linux:arm64`) still target the right
  platform/arch.
- `bun i` no longer touches `%TEMP%/package.json`.

## Non-Goals

- Changing which runtimes are bundled or their install locations (`runtime/<name>/`).
- Making the install hermetic/offline (the tool still downloads archives from GitHub).
- Vendoring the `tiny-runtime-injector` source into the repo.

## Root Cause

`bun x <pkg>` materialises the package into a temp dir under `%TEMP%` and synthesises a
`package.json` there; on Windows with certain locale/encoding settings that file is written with
corrupted bytes, and Bun's parser rejects it. Declaring the dep and invoking the bin/programmatic
API from `node_modules` avoids the temp dir entirely.
