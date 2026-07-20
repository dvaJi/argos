# Preload Path Resolution

## Summary

In development, every Electron `BrowserWindow` fails to load its preload script with
`Cannot find module '.../out/main/preload/index.mjs'`. The preload bundle is actually emitted at
`out/preload/index.mjs`, but the main-process code computes the path relative to `__dirname`, and
Vite code-splits the presenter modules into `out/main/chunks/`, so the relative path resolves one
level too deep. As a downstream symptom, the renderer sees `window.argos is not available` because
the preload never installs the bridge.

## User Story

As a developer running `bun run dev`, every window (chat, floating chat, floating button, splash,
browser overlay, plugin settings) loads its preload script and `window.argos` is available to the
renderer.

## Acceptance Criteria

- Preload paths resolve to `out/preload/<name>.mjs` regardless of which chunk a presenter module is
  bundled into.
- Resolution works in dev (`app.getAppPath()` points at `apps/desktop`) and in packaged builds
  (`app.getAppPath()` points at the asar root whose `package.json#main` is
  `./apps/desktop/out/main/index.js`).
- No presenter relies on a chunk-local `__dirname` to find preload scripts.
- A unit test covers both the dev-shape and packaged-shape `package.json#main` values.

## Non-Goals

- Changing the Vite chunking strategy or output layout.
- Moving preload output to a different directory.
- Touching the daemon or UI packages.

## Constraints

- Keep the fix inside `apps/desktop/src/main/`.
- Follow the existing `app.getAppPath()` anchoring pattern used by `runtimeHelper` and
  `trayPresenter`.
- Do not reintroduce `__dirname`-relative preload paths in presenter code.

## Root Cause

`windowPresenter/index.ts` (and six sibling files) compute the preload URL with
`join(__dirname, "../preload/<name>.mjs")`. `__dirname` is derived from `import.meta.url`, which at
runtime points at the **bundled chunk file**, not the main entry. The presenter chunk lives at
`out/main/chunks/presenter-<hash>.js`, so `__dirname` is `out/main/chunks/` and the join produces
`out/main/preload/<name>.mjs` — a path that does not exist.
