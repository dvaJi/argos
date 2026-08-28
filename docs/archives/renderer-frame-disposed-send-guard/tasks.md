# Tasks: Guard main→renderer sends against disposed render frames

- [x] Add `safeSendWebContents` helper in `windowPresenter/index.ts`.
- [x] Route the theme broadcast, `sendToAllWindows`, `sendToWindow`,
      `sendToDefaultWindow`, `sendToWebContents`, lifecycle handlers, and tab send
      fallbacks through the helper.
- [x] `bun run typecheck`, `bun run lint`, desktop main tests.
