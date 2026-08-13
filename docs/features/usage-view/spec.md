# Usage View + Repair Usage Dashboard / Recent Activity

Status: complete
Owner: usage-view
Created: 2026-08-12

## User Need

Argos runs AI agents (ACP agents like Codex/Claude Code, and the native Pi agent) but gives users no working view of what those agents cost or how much they consume. The existing **Usage Dashboard** (settings overview) and **Recent Activity** feed are both broken after the daemon migration, and there is no per-model/per-day cost breakdown like t3code's Usage page. Users want to:

1. See **raw token cost** (and "if billed at full API rate" framing), **processed tokens**, **cache savings**, **per-service share**, and **per-model breakdown** over rolling windows (Past 24h / 7d / 30d / 90d) — mirroring the t3code usage page.
2. Have a working **Usage Dashboard** on the settings overview (currently always shows "No usage data yet").
3. Have a working **Recent Activity** list in settings (currently always empty).
4. See usage per session/turn where the agent reports it (ACP `usage_update`), and token-level data where the agent is native (Pi worker).

## Current State (Root Cause)

- The active chat path is daemon-owned: `AgentSessionPresenter` → `agent.processMessage` → daemon `PiProviderExecutionPort` / `AcpProviderExecutionPort`, persisting to `daemon_sessions` / `daemon_messages`.
- The Usage Dashboard reads desktop `argosUsageStatsTable`, fed only by `ArgosMessageStore.persistUsageStats` (live) and `runUsageStatsBackfill` — but `ArgosMessageStore` is now used only by `legacyImportService`, and the old `AgentRuntimePresenter` is a stub throwing `DAEMON_ONLY_ERROR`. **No writer populates the table the dashboard reads → always empty.**
- ACP `usage_update` is mapped (`AcpContentMapper.handleUsageUpdate` → `payload.usage`) but **dropped** in `AcpProviderExecutionPort.runTurn` (only `blocks`/`planEntries` are consumed). `AcpSessionPersistence.mergeMetadata` exists but is never called with usage.
- Pi worker has **no usage/token events** in `PiWorkerProtocol`; the worker registers the model with `cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}` and never emits usage back to the daemon.
- Recent Activity: desktop `routes/index.ts` has ~30 `recordSettingsActivity` call sites writing to the desktop `settings_activity` table; the daemon owns a separate `settings_activity` table that only gets **read** (never written). The settings renderer queries the daemon table → split-brain, always empty.

## Goal

Establish daemon-side usage capture + aggregation as the single source of truth, build a t3code-style Usage view, and point the existing Usage Dashboard and Recent Activity at live data.

## Acceptance Criteria

- **AC-1** ACP turns persist usage: `usage_update` (used/size/cost/meta) is recorded per turn into `daemon_messages.metadata` (assistant message) and aggregated into a new `daemon_usage_stats` table (per message: provider, model, date, input/output/cached/cache-write tokens, cost).
- **AC-2** Pi turns persist usage: the worker emits a new usage event on turn settle with token counts (input, cached input, cache-write, output, reasoning) + model; daemon writes the same `daemon_usage_stats` row. Cost is derived locally from the model cost table (`input/output/cache_read/cache_write` per MTok), or null when unknown.
- **AC-3** A new daemon route `usage.getStats` returns: summary (processed/cached/uncached input, output, cache savings, raw token cost, active days), daily series, per-provider share, per-model breakdown, and service list — for a requested window (past24h / 7d / 30d / 90d).
- **AC-4** A new UI route `/usage` renders the t3code-style page: window filters, raw-token-cost headline with the "* if billed at full API rate" note, daily cost/token toggle chart, provider share, metric cards (processed tokens, cached input, uncached input, output, cache savings), and a Model/Day breakdown table.
- **AC-5** The existing settings **Usage Dashboard** section is repointed to the same daemon aggregation (reads `usage.getStats` via typed `UsageClient`), so it no longer shows the empty state when usage exists.
- **AC-6** **Recent Activity** is fixed: the daemon records `settings_activity` rows for the same mutating settings/providers/skills operations the desktop previously logged (writes now go to the daemon table the settings renderer reads), or the renderer reads the desktop table — single source of truth, no split-brain. The activity list renders non-empty after user actions.
- **AC-7** All new renderer↔main capabilities use typed routes (`shared-contracts/routes` + `ARGOS_ROUTE_CATALOG`) and a `UsageClient`; no new `window.api`/legacy paths.
- **AC-8** Existing usage helpers (`usageStats.ts`) are either migrated to the daemon or deleted; no dead desktop-only usage path remains.
- **AC-9** `bun run typecheck`, `bun run lint`, `bun run format`, and relevant `bun test` suites pass.

## Constraints

- Follow the typed route/client boundary: routes in `packages/shared-contracts/src/routes/`, registered in `ARGOS_ROUTE_CATALOG`, dispatched in `apps/daemon/src/dispatch/daemonDispatcher.ts`, client in `packages/ui/api/`.
- Usage capture lives in the daemon execution layer (`PiProviderExecutionPort`, `AcpProviderExecutionPort`) — not the desktop presenter graph.
- Cost is an estimate derived from token counts + model cost table for Pi; use agent-reported cost (ACP `cost`) when present, falling back to estimation when absent. Surface the "* if billed at full API rate" caveat in the UI.
- Recent Activity must have exactly one writer and one reader; choose daemon-owned `settings_activity` (the table the settings renderer already queries).
- Do not regress session/message persistence; `daemon_usage_stats` is additive.

## Non-Goals

- Subscription-billing integration (the page shows raw API-equivalent cost only).
- Rate-limit / quota surfacing.
- Export/CSV of usage.
- Per-thread or per-turn usage in the chat UI (future).
- Multi-user or remote-machine usage aggregation.

## Open Questions

- **Q1:** Should the Usage page be a top-level tab or live under Settings? **A (initial):** top-level `/usage` route, peer of chat/welcome; the settings Usage Dashboard section stays but reads the same data.
- **Q2:** For ACP agents that report `cost` in `usage_update`, do we trust it over our estimate? **A (initial):** yes — use agent-reported cost when present, else estimate; mark estimate vs reported.
- **Q3:** Which model cost table drives Pi estimates? **A (initial):** reuse `providerDbLoader` model cost fields (`input/output/cache_read/cache_write` per MTok) already used by `usageStats.ts`.
- **Q4:** Recent Activity: migrate desktop `recordSettingsActivity` calls to daemon writes, or keep desktop writes and have the renderer read desktop? **A (initial):** migrate writes to the daemon table (single source of truth); desktop call sites forward through the daemon route.
