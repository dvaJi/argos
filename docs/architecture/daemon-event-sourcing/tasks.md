# Tasks

## Phase 1 — Typed event contracts (foundation)
- [x] Add `packages/shared-contracts/src/events/notifications.events.ts`
      (`notifications.showErrorEvent`, `notifications.databaseRepairSuggestedEvent`)
- [x] Add `packages/shared-contracts/src/events/rate-limit.events.ts`
      (`providers.rateLimitConfigUpdatedEvent`, `providers.rateLimitRequestQueuedEvent`,
       `providers.rateLimitRequestExecutedEvent`, `providers.rateLimitLimitExceededEvent`)
- [x] Register all six in `ARGOS_EVENT_CATALOG` (`events.ts`)
- [x] Verify: shared-contracts + downstream typecheck (ui + daemon exit 0); route-catalog-drift-guard OK

## Phase 2 — Rate-limit manager → daemon
- [ ] Extract rate-limit logic to a daemon-owned module with `IEventPublisher` dep
- [ ] Gate daemon provider-execution calls through it (acp/pi provider execution)
- [ ] Replace daemon stub `providers.getRateLimitStatus` with the real manager
- [ ] Emit `providers.rateLimit*` via `publisher.publish(...)`
- [ ] Remove desktop `rateLimitManager.ts` + raw `RATE_LIMIT_EVENTS` emitters

## Phase 3 — Notifications → daemon
- [ ] Daemon emits `notifications.showError` for backend-originated errors
- [ ] Move `database-repair-suggested` detection to the daemon DB layer; emit event
- [ ] Keep shell-only `show-error` causes on the desktop `EventBus`

## Phase 4 — Subscribers + cleanup
- [ ] `settings/App.tsx` → `bridge.on("notifications.*")`
- [ ] `settings/components/ProviderRateLimitConfig.tsx` → `bridge.on("providers.rateLimit*")`
- [ ] `packages/ui/src/composables/useAppIpcRuntime.ts` → `bridge.on(...)` for in-scope events
- [ ] Remove in-scope entries from desktop + UI raw `events.ts` maps
- [ ] Regenerate architecture baseline; browser-mode E2E check
