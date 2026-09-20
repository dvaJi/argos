# Compiled daemon binaries crash at startup off the build machine

## Problem

Standalone `argos-daemon` binaries published on GitHub Releases (v0.5.0 and
v0.6.0 drafts) fail during module evaluation on any host other than the CI
runner that built them. Even `--help` and `--version` crash before CLI parsing:

```
error: Cannot find module 'D:\a\argos\argos\node_modules\.bun\pdf-parse-new@2.1.0+759ce506b1ed1a42\node_modules\pdf-parse-new\lib\markdown-render-page.js'
from 'B:\~BUN\root\argos-daemon.exe'
```

The desktop installers bundle the same compiled binary
(`electron-builder.yml` extraResources → `daemon/`), so CI-built desktop
installs are affected too. Locally built binaries work on the build machine,
which is why the defect went unnoticed: the fallback path only exists where the
project was compiled.

## Root cause

`pdf-parse-new@2.1.0` `index.js` eagerly evaluates, at module scope:

```js
module.exports.markdownRenderModule = require.resolve('./lib/markdown-render-page.js');
```

Nothing in the bundle statically imports `lib/markdown-render-page.js`, so
`bun build --compile` does not embed it and the runtime resolver falls back to
the build machine's absolute path. Off that machine the resolution throws and
the whole binary dies during startup. CI never caught it because the runner
still had the file at the recorded path (the `Verify daemon version` and
`e2e:remote-machine` steps both pass there).

## Impact

- Every published standalone daemon binary (v0.5.0+) is unusable for the
  remote-machine/headless flow — a first-class release asset group.
- CI-built desktop installers carry a daemon that cannot start.
- Not a v0.6.0 regression; same defect shipped in v0.5.0.

## Decision

- Hold the v0.6.0 draft (still private), fix on `master`, re-tag `v0.6.0`, and
  rebuild. Safe because the release was never published.
- Fix via `patchedDependencies` instead of a side-effect import: importing
  `pdf-parse-new/lib/markdown-render-page.js` from `PdfFileAdapter.ts` was
  tried first and makes the bundler emit an unresolved relative require that
  fails even on the build machine.
- The patch keeps `require.resolve` success behavior on normal runtimes and
  falls back to `null` when resolution is impossible. Argos never consumes
  `markdownRenderModule` (no `pagerenderModule` usage), so the degradation is
  unreachable in-product; the worker/process pagerender flows already require
  the real file on disk.

## Verification

- Local off-machine simulation: hide
  `node_modules/.bun/pdf-parse-new@2.1.0+759ce506b1ed1a42`, run the built
  `argos-daemon.exe --version` → prints the version instead of crashing
  (reproduced the crash the same way before the fix).
- After the fix, CI-built binaries must be re-verified by downloading the
  release artifact and running `--version` on a host that never had the repo
  (the recorded `D:\a\...` path cannot exist there).
