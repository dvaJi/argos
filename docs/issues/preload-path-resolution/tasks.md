# Tasks

- [x] Add `apps/desktop/src/main/lib/paths.ts` with `getPreloadDir()` and `getPreloadPath(name)`.
- [x] Update `tabPresenter.ts`, `windowPresenter/index.ts`, `FloatingChatWindow.ts`,
      `FloatingButtonWindow.ts`, `SplashWindowManager.ts`, `YoBrowserOverlayWindow.ts`, and
      `pluginPresenter/index.ts` to use `getPreloadPath(...)`.
- [x] Drop now-unused `__dirname` declarations and `dirname`/`fileURLToPath` imports.
- [x] Add `apps/desktop/test/main/lib/paths.test.ts` covering dev and packaged main-field shapes.
- [x] Mock `#/lib/paths` in `SplashWindowManager.display.test.ts` to isolate display-gating tests
      from preload resolution.
- [x] Run `bun run typecheck:node` (exit 0).
- [x] Run `bun run format` and `bun run lint` (exit 0).
- [ ] Manual dev smoke check: `bun run dev`, confirm preload loads and `window.argos` is available.
