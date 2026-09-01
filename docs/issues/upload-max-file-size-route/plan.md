# Plan: upload-max-file-size-route

## Approach

One-line classification fix in `packages/shared-contracts/src/desktop-only.ts`:

- Add `"config.getMaxFileSize"` to `DESKTOP_ONLY_ROUTE_PREFIXES`, directly next to
  `"config.setMaxFileSize"`.

This routes the read through IPC to the desktop main handler
(`configGetMaxFileSizeRoute` case in `apps/desktop/src/main/routes/index.ts`), which reads
the same desktop config store that `setMaxFileSize` writes and `FilePresenter` consumes.

## Interfaces affected

- `DESKTOP_ONLY_ROUTE_PREFIXES` (`@argos/shared-contracts/desktop-only`) — consumed by:
  - Electron `HybridBridge` (IPC vs WS routing)
  - daemon dispatcher (explicit not-available error)
  - browser capability gate

## Test strategy

- Existing contract/guard tests (`catalogGuards`) must keep passing.
- `bun run lint` + `typecheck` + `test:main` (contracts suite).
