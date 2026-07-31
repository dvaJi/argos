# Plan

## A. Native helpers → `#api/runtime` (mechanical)

| File | From | To |
|---|---|---|
| `settings/components/prompt/PromptEditorSheet.tsx:135` | `window.api.getPathForFile(file)` | `getRuntimePathForFile(file)` |
| `settings/components/KnowledgeFile.tsx:67` | `window.api.getPathForFile(file)` | `getRuntimePathForFile(file)` |
| `settings/components/KnowledgeFile.tsx:155` | `window.api.copyText(content)` | `copyRuntimeText(content)` |
| `settings/components/AboutUsSettings.tsx:44` | `window.api.openExternal(url)` | `void openRuntimeExternal(url)` |
| `settings/components/DataSettings.tsx:161` | `window.api?.openExternal(url)` | guarded `openRuntimeExternal` (browser-safe) |

Note: `openRuntimeExternal` is async and throws when the capability is absent
(browser mode). `DataSettings` currently guards with `?.`; mirror that with a
try/catch (or reuse the existing optional-check pattern) so browser mode is a no-op.

## B. Event subscriptions → `createIpcSubscriptionScope`

`createIpcSubscriptionScope` (from `#api/runtime`) returns `{ on, cleanup }` and
wraps `ipcRenderer` — identical to what `useAppIpcRuntime` uses for the main app.

- `settings/App.tsx`: replace the two `ipcRenderer.on(...)` + two
  `removeListener(...)` calls with a `scope.on(...)` created in the effect, cleanup
  via `scope.cleanup()` (the scope already manages unsubscribe).
- `settings/components/ProviderRateLimitConfig.tsx`: same — one scope with the three
  `RATE_LIMIT_EVENTS` channels.

This centralizes the `ipcRenderer` access into the allowed abstraction layer
(parity with the main app), satisfying the business-`window.electron=0` baseline.

## C. `generate-pairing-url` → typed route (net-new contract)

1. **Contract** (`packages/shared-contracts/src/routes/connection.routes.ts`):
   add `generatePairingUrl` op (input: none; output: `{ url: string }`).
2. **Catalog**: register in `ARGOS_ROUTE_CATALOG`.
3. **Handler**: the desktop already implements the channel in
   `apps/desktop/src/main/routes/daemonPortHandler.ts` — re-wire it as the typed
   route handler (and keep the legacy channel removed).
4. **Client**: add `ConnectionClient.generatePairingUrl()` (or extend the existing
   connection client) wrapping `bridge.invoke("connection.generatePairingUrl")`.
5. **Consumer**: `settings/components/ServerSettings.tsx:187` → call the client.

## Verification

- `bun run --filter @argos/ui typecheck`
- `bun run --filter @argos/ui build` (production bundle)
- `bun run lint` (architecture-guard renderer `window.electron`/`window.api` baseline = 0 in business)
- `Select-String "window\.(electron|api)\." packages/ui/settings` → 0
