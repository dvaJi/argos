# Settings Renderer → Typed Clients / IPC Abstractions

## Problem

`packages/ui/settings/**` is the last renderer business code that calls
`window.electron.ipcRenderer.*` and `window.api.*` **directly**. Every other
renderer surface (the main app) already goes through shared abstractions:

- native ops → `#api/runtime` wrappers (`copyRuntimeText`, `openRuntimeExternal`, `getRuntimePathForFile`)
- event subscriptions → `createIpcSubscriptionScope` (re-exported from `#api/runtime`)
- RPC → typed `*Client` classes over the `ArgosBridge`

This is the tracked debt in `docs/architecture/extract-ui/tasks.md` ("Migrate
settings off raw Electron IPC → typed clients") and the last blocker for the
`window.electron=0` / `window.api=0`-in-business architecture-baseline goal.

## Scope (audited surface — 14 call sites)

**A. `window.api.*` — native-only helpers (5 sites, 4 files)**
- `PromptEditorSheet.tsx:135`, `KnowledgeFile.tsx:67` — `getPathForFile`
- `KnowledgeFile.tsx:155` — `copyText`
- `AboutUsSettings.tsx:44`, `DataSettings.tsx:161` — `openExternal`

**B. `window.electron.ipcRenderer.on/removeListener` — events (9 sites, 2 files)**
- `App.tsx:554/555/608/609` — `NOTIFICATION_EVENTS.SHOW_ERROR`, `DATABASE_REPAIR_SUGGESTED`
- `ProviderRateLimitConfig.tsx:92-102` — `RATE_LIMIT_EVENTS.CONFIG_UPDATED/REQUEST_EXECUTED/REQUEST_QUEUED`

**C. `window.electron.ipcRenderer.invoke` — RPC (1 site)**
- `ServerSettings.tsx:187` — `invoke("generate-pairing-url")`

## Non-goals

- Routing `NOTIFICATION_EVENTS` / `RATE_LIMIT_EVENTS` through the **daemon** event
  stream (true browser-mode delivery). These are Electron-IPC events today and the
  main app consumes them via the same `createIpcSubscriptionScope`. Daemon-routing
  is part of the larger desktop→daemon decoupling, tracked separately.
- Eliminating `window.electron`/`window.api` from the abstraction layer itself
  (`api/runtime.ts`, `api/local-api.ts`, preload) — those are the *allowed* layers.

## Solution

Bring settings to the same patterns the main app already uses:

- **A** → swap to `#api/runtime` wrappers.
- **B** → swap to `createIpcSubscriptionScope` (same hook the main app's
  `useAppIpcRuntime` uses), so settings no longer touches `ipcRenderer` directly.
- **C** → add a typed route contract `connection.generatePairingUrl`, wire the
  existing desktop handler (`routes/daemonPortHandler.ts`), consume via the
  connection client. This is the only net-new contract.

## Acceptance

- `Select-String "window\.(electron|api)\." packages/ui/settings` returns **0** in
  business code (the runtime/local-api abstraction layer excluded).
- `@argos/ui` typecheck + production build pass.
- `bun run lint` (architecture-guard baseline for renderer `window.electron`/
  `window.api` in business code) holds at 0.
