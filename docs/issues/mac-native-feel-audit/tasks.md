# macOS Native Feel Audit Tasks

- [x] Document the spec, implementation plan, trade-offs, and task breakdown.
- [x] Refactor `ShortcutPresenter` to install application menu accelerators for app-scoped commands.
- [x] Keep only Show/Hide Window registered through `globalShortcut`.
- [x] Update shortcut presenter tests for menu accelerators and global shortcut boundary.
- [x] Remove pointer cursors from primary app chrome/list rows while preserving content links and explicit drag/resize affordances.
- [x] Remove pointer cursors from the independent Settings renderer.
- [x] Replace global and targeted smooth scroll behavior with native/default scroll behavior.
- [x] Tune macOS-only main/settings BrowserWindow material options.
- [x] Run targeted tests.
- [x] Run `bun run format`, `bun run i18n`, and `bun run lint`.
- [x] Run `bun run typecheck`.
