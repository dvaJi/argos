# Daemon-Sourced Backend Events (rate-limit, notifications)

## Problem

A handful of **backend-originating** renderer events still travel over the
Electron-only `EventBus` (raw, non-typed channels via `ipcRenderer`), so they:

- never reach the daemon, and therefore never reach a **browser-mode** renderer;
- bypass the typed `ArgosEvent` contract catalog (`ARGOS_EVENT_CHANNEL` +
  `defineEventContract` + Zod-validated envelopes);
- force subscribers (settings + main app) to use `createIpcSubscriptionScope`
  (a thin `ipcRenderer` wrapper) instead of `bridge.on`.

The modern events (chat, providers, mcp, models, sessions, sync, …) are already
typed `ArgosEvent`s published by the daemon's `BunEventPublisher`
(`IEventPublisher.publish(name, payload)` → `/api/v1/events` WebSocket →
`bridge.on`). This migration brings the remaining backend events to that path and
moves their **sources** into the daemon.

## In scope (backend events — must originate in the daemon)

| Current raw channel | Typed name | Payload |
|---|---|---|
| `notification:show-error` | `notifications.showError` | `{ id, title, message, type }` |
| `notification:database-repair-suggested` | `notifications.databaseRepairSuggested` | `DatabaseRepairSuggestedPayload` |
| `rate-limit:config-updated` | `providers.rateLimitConfigUpdated` | `{ providerId, config: { qpsLimit, enabled } }` |
| `rate-limit:request-queued` | `providers.rateLimitRequestQueued` | `{ providerId, queueLength, requestId }` |
| `rate-limit:request-executed` | `providers.rateLimitRequestExecuted` | `{ providerId, timestamp, currentQps }` |
| `rate-limit:limit-exceeded` | `providers.rateLimitLimitExceeded` | (define from manager) |

## Out of scope (shell-only events — stay Electron IPC, no daemon equivalent)

`shortcut:*`, `deeplink:*`, `app-runtime:*` (window focus), `notification:sys-notify-clicked`,
`notification:data-reset-complete-dev`. These are desktop-shell events that have no
meaning outside Electron; they remain on the `EventBus`/`createIpcSubscriptionScope`.

## Current state (verified)

- `EventBus` (`apps/desktop/src/main/eventbus.ts`) dispatches via
  `windowPresenter.sendToWindow` (Electron `webContents.send`). **No daemon forwarding.**
- `rateLimitManager.ts` (desktop `llmProviderPresenter/managers`) owns rate-limit logic;
  the daemon only has a **stub** `providers.getRateLimitStatus` route returning
  `{ enabled: false, qpsLimit: 0 }`.
- Provider execution already runs partly in the daemon
  (`apps/daemon/src/host/{acp,pi}-provider-execution.ts`), which already calls
  `publisher.publish(...)` for other events.
- `notification:show-error` is emitted from desktop `deeplinkPresenter`, `mcpPresenter`,
  `appMain`, `presenterCallErrorHandler`. `notification:database-repair-suggested` from
  `presenterCallErrorHandler` + `schemaErrorClassifier`.
- Subscribers: `settings/App.tsx`, `settings/components/ProviderRateLimitConfig.tsx`,
  and the main app's `useAppIpcRuntime` (`packages/ui/src/composables`).

## Acceptance

- The in-scope events are defined as typed `ArgosEvent`s in
  `packages/shared-contracts/src/events/**` and registered in `ARGOS_EVENT_CATALOG`.
- The daemon owns the rate-limit manager and emits the `providers.rateLimit*` events;
  the desktop stub is removed.
- The daemon emits `notifications.showError` / `notifications.databaseRepairSuggested`
  for backend-originated errors/repair signals; desktop emitters for backend causes are
  removed (shell-only causes stay).
- All subscribers use `bridge.on(<typedName>)`; `RATE_LIMIT_EVENTS` / the notification
  entries are removed from the raw `events.ts` maps and from `createIpcSubscriptionScope`
  usage.
- A browser-mode renderer receives these events (delivered via the daemon WebSocket).
