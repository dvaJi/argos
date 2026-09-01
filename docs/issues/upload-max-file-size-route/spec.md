# Issue: Upload settings "max file size" fetch fails with zod error on settings open

## Summary

Opening the settings page (Common section) logs:

```
UploadFileSettingsSection.tsx:61 Failed to load max file size: Error: [
  { "expected": "object", "code": "invalid_type", "path": [],
    "message": "Invalid input: expected object, received undefined" }
]
```

It fires on page load (no upload required): `UploadFileSettingsSection` fetches the saved
value on mount via `configClient.getMaxFileSize()`.

## Root cause

`config.setMaxFileSize` is classified desktop-only (`DESKTOP_ONLY_ROUTE_PREFIXES` in
`packages/shared-contracts/src/desktop-only.ts`) but its sibling `config.getMaxFileSize`
is **missing from that list**.

Consequence in the desktop app:

- `setMaxFileSize` → `HybridBridge.invoke` → IPC → desktop main handler
  (`apps/desktop/src/main/routes/index.ts`) → reads/writes the desktop `maxFileSize`
  setting (the same store `FilePresenter.maxFileSize` reads). Works.
- `getMaxFileSize` → not desktop-only → `HybridBridge.invoke` → WebSocket → daemon →
  `dispatchConfigRoute` (`packages/backend-core/src/dispatch/config/configRouteHandler.ts`)
  has **no case** for it → `default: return undefined` → daemon answers `ok: true` with no
  output → client `configGetMaxFileSizeRoute.output.parse(undefined)` → the reported zod
  error.

## Fix

Add `"config.getMaxFileSize"` to `DESKTOP_ONLY_ROUTE_PREFIXES` next to
`"config.setMaxFileSize"`.

Why this and not implementing it in the daemon: the value is written by the desktop-only
`setMaxFileSize` into the **desktop** config store and read by desktop's `FilePresenter`.
A daemon implementation would read the daemon's separate config store and always return
null — a silent split-brain. Desktop-only classification matches the sibling route and the
existing "Settings-surface capabilities that drive Electron-resident subsystems (… desktop
config)" cluster in the list.

## Acceptance criteria

- Opening Settings → Common no longer logs the zod error.
- The saved max file size is restored into the picker.
- `config.setMaxFileSize` keeps working (unchanged).
- Headless/daemon mode keeps returning the explicit "Route not available in headless mode"
  error for both routes (capability gate hides them in web mode).

## Non-goals

- Reworking the `default: return undefined` fallthrough in `dispatchConfigRoute`
  (diagnosability improvement; tracked separately).
