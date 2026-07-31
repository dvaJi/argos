# Tasks

- [x] **A1** `PromptEditorSheet.tsx` / `KnowledgeFile.tsx`: `window.api.getPathForFile` → `getRuntimePathForFile`
- [x] **A2** `KnowledgeFile.tsx`: `window.api.copyText` → `copyRuntimeText`
- [x] **A3** `AboutUsSettings.tsx` / `DataSettings.tsx`: `window.api.openExternal` → `openRuntimeExternal` (browser-safe via `.catch(() => window.open(...))`)
- [x] **B1** `settings/App.tsx`: NOTIFICATION_EVENTS subscriptions → `createIpcSubscriptionScope`
- [x] **B2** `ProviderRateLimitConfig.tsx`: RATE_LIMIT_EVENTS subscriptions → `createIpcSubscriptionScope`
- [x] **C1** `connection.requestPairingToken` — consumed directly from the daemon's existing `/api/v1/pair/token` endpoint (same-origin; no new contract needed) via `ConnectionClient.requestPairingToken()`
- [x] **C2** Removed the now-dead desktop `generate-pairing-url` IPC handler (`daemonPortHandler.ts`)
- [x] **C4** `ServerSettings.tsx` → consumes `requestPairingToken()`
- [x] **V1** `@argos/ui` typecheck + production build green
- [x] **V2** `bun run lint` green; `window.(electron|api)` count in `packages/ui/settings` business code = **0**

## Deviation from plan

- **C** did not need a net-new typed route contract. The pair token already
  originates in the daemon (`handleIssuePairingToken` → `POST /api/v1/pair/token`).
  The desktop `generate-pairing-url` handler was only a proxy because the renderer
  previously lacked same-origin access. Since the settings renderer is now
  daemon-served (same origin; `/api` proxied in dev), it calls the daemon endpoint
  directly — eliminating the desktop IPC proxy entirely rather than just typing it.
  This is a cleaner result than the planned "add a typed route + dispatcher wiring"
  (which would have required injecting the auth repo + origin into the dispatcher
  for a single call site).
