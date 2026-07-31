# Plan

> ## ⚠️ ARCHITECTURAL CORRECTION (investigation, post-Phase-1)
>
> Phase 2 as originally written ("move the rate-limit manager into the daemon") is
> **not possible** today. The daemon only runs *non-agent LLM utilities*
> (`llmUtilityExecution.ts`: "Agent turns are exclusively owned by Pi") plus ACP/Pi
> agent execution. The **main chat LLM calls (`streamText`/`generateText`) execute
> in the desktop's `llmProviderPresenter`** — and that is precisely what
> `RateLimitManager` gates. The daemon makes none of those calls, so it cannot own
> the rate-limit logic.
>
> True daemon-sourcing of these events is therefore **blocked on first moving chat
> LLM execution into the daemon** (a separate, very large migration — the whole
> chat backend, partially started via Pi). Until that happens, the realistic
> options for browser-mode delivery are:
>
> - **(F) Event forwarder** — keep the rate-limit logic in the desktop (where the
>   calls are), and have the desktop publish these typed events into the daemon's
>   event stream (a desktop→daemon publish channel) so browser renderers receive
>   them via `bridge.on`. Achieves browser delivery without moving LLM execution.
> - **(B)** Accept these events stay Electron-only until chat LLM execution itself
>   moves to the daemon.
>
> Phase 1 (typed contracts) remains valid and useful for either path. Phases 2–4
> below are retained as the *target* end-state but are gated on the chat-LLM-to-daemon
> migration; do **not** attempt them standalone.

Sequenced so each phase is independently mergeable and verifiable. Phases 2–4 are
the substantial daemon work; this session implements **Phase 1** (the contract
foundation) which unblocks the rest.

## Phase 1 — Typed event contracts (foundation, this session)

Pure-additive, no behavior change. Unblocks everything else.

1. `packages/shared-contracts/src/events/notifications.events.ts`:
   `notifications.showErrorEvent`, `notifications.databaseRepairSuggestedEvent`.
2. `packages/shared-contracts/src/events/rate-limit.events.ts` (or extend
   `providers.events.ts`): the four `providers.rateLimit*` events.
3. Register all in `ARGOS_EVENT_CATALOG` (`events.ts`).
4. Verify: `@argos/shared-contracts` + downstream typechecks; `route-catalog-drift-guard`.

## Phase 2 — Move rate-limit manager into the daemon

1. Extract `rateLimitManager` logic into a daemon-owned module (e.g.
   `apps/daemon/src/host/rateLimitManager.ts` or `packages/backend-core`) with an
   `IEventPublisher` dependency.
2. Wire it into daemon provider execution (`acp-provider-execution`, `pi-provider-execution`,
   and any direct provider call path) so provider calls are actually gated.
3. Replace the daemon's stub `providers.getRateLimitStatus` handler with the real manager.
4. Emit the `providers.rateLimit*` events via `publisher.publish(...)` instead of
   `eventBus.send(RATE_LIMIT_EVENTS.*)`.
5. Remove the desktop `rateLimitManager.ts` + `RATE_LIMIT_EVENTS` raw emitters once unused.

## Phase 3 — Daemon-source notifications

1. Route backend-originated errors (provider/execution failures that today call
   `NOTIFICATION_EVENTS.SHOW_ERROR`) to `publisher.publish("notifications.showError", …)`
   at the daemon layer.
2. Move `database-repair-suggested` detection (currently `schemaErrorClassifier` +
   `presenterCallErrorHandler` in desktop) to the daemon side that owns the SQLite DB
   (`bun-session-repository`), emitting `notifications.databaseRepairSuggested`.
3. Keep shell-only causes of `show-error` on the desktop `EventBus`.

## Phase 4 — Subscriber migration + cleanup

1. `settings/App.tsx`, `settings/components/ProviderRateLimitConfig.tsx`,
   `packages/ui/src/composables/useAppIpcRuntime.ts`: swap the in-scope
   `createIpcSubscriptionScope.on(...)` calls for `bridge.on(<typedName>)`.
2. Remove the in-scope entries from the desktop + UI `NOTIFICATION_EVENTS` /
   `RATE_LIMIT_EVENTS` raw maps.
3. Update `docs/architecture/baselines/*` (regenerate via `bun run architecture:baseline`).
4. E2E: Electron + browser-mode renderer both receive the events.

## Verification (each phase)

- `bun run typecheck` (all workspaces), `bun run --filter @argos/ui build`, `bun run lint`.
- Phase 4: browser-mode manual check that a rate-limited provider call and a backend
  error surface in the UI without `window.electron`.
