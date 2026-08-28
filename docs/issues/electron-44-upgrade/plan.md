# Plan: Electron v44 upgrade

## Migration

1. `package.json` catalog: `electron` `^43.4.1` → `^44.0.0`; `bun install` refreshes the lockfile
   and binaries.
2. `FilePresenter.copyImage` — `nativeImage.toPNG()` → `Blob` → `clipboard.write([ClipboardItem])`.
3. `preload/index.ts` — clipboard calls → `ipcRenderer.invoke` on three new channels
   (`clipboard:write-text|write-image|read-text`); rejections swallowed (non-actionable).
4. `WindowPresenter` — registers the three handlers (idempotent via `removeHandler`).
5. `preload/index.d.ts`, `packages/ui/api/local-api.ts` + `DeviceClient.ts` + `runtime.ts` —
   `readClipboardText` becomes `Promise<string>`; `copyText`/`copyImage` keep `void`
   fire-and-forget signatures.
6. `scripts/architecture-guard.mjs` — windowPresenter raw-channel baseline 4 → 7.

## Verification

Typecheck (desktop/ui), lint, format:check, `test:main` (pre-existing failure set only), CI
build-check (linux x64 packaging), manual clipboard/login-link verification.
