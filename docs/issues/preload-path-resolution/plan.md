# Plan

## Approach

Introduce a single helper that resolves preload script paths from the running app's main entry
instead of from a chunk-local `__dirname`.

The helper reads `package.json#main` at `app.getAppPath()`, computes the main entry's directory, and
returns `<mainEntryDir>/../preload/<name>.mjs`. Because both the dev (`apps/desktop/package.json`) and
packaged (asar-root `package.json`) main fields end in `out/main/index.js`, the preload directory
always sits at `../preload/` relative to the main entry's directory — independent of where Vite
code-splits the caller.

## Affected Files

- New: `apps/desktop/src/main/lib/paths.ts` — `getPreloadDir()` + `getPreloadPath(name)`.
- New: `apps/desktop/test/main/lib/paths.test.ts` — covers dev-shape and packaged-shape main fields.
- Updated callers (replace `join(__dirname, "../preload/<name>.mjs")` with `getPreloadPath(...)` and
  drop the now-unused `__dirname` declaration + `dirname`/`fileURLToPath` imports when no other
  usage remains):
  - `apps/desktop/src/main/presenter/tabPresenter.ts`
  - `apps/desktop/src/main/presenter/windowPresenter/index.ts`
  - `apps/desktop/src/main/presenter/windowPresenter/FloatingChatWindow.ts`
  - `apps/desktop/src/main/presenter/floatingButtonPresenter/FloatingButtonWindow.ts`
  - `apps/desktop/src/main/presenter/lifecyclePresenter/SplashWindowManager.ts`
  - `apps/desktop/src/main/presenter/browser/YoBrowserOverlayWindow.ts`
  - `apps/desktop/src/main/presenter/pluginPresenter/index.ts`

## Data Flow

`BrowserWindow` ctor receives `webPreferences.preload` as an absolute path. The helper is called
once per window construction; the directory lookup is memoized across calls.

## Compatibility

- Dev: `app.getAppPath()` = `apps/desktop/`, `package.json#main` = `./out/main/index.js` → resolves
  to `apps/desktop/out/preload/<name>.mjs`.
- Packaged: `app.getAppPath()` = asar root, `package.json#main` = `./apps/desktop/out/main/index.js`
  → resolves to `<asar>/apps/desktop/out/preload/<name>.mjs`.
- `electron-builder.yml` packages `apps/desktop/out/**` into the asar, so the preload files are
  present at that path in shipped builds.

## Test Strategy

- Unit test `paths.test.ts` mocks `electron.app.getAppPath` and `fs.readFileSync` to feed both main
  field shapes; asserts `getPreloadPath("index.mjs")` ends with `out/preload/index.mjs` and stays
  inside the provided app root.
- `bun run typecheck` validates import cleanup.
- `bun run lint` validates architecture/agent guards and oxlint.
- Manual smoke check in dev confirms `window.argos` is present and the preload error is gone.
