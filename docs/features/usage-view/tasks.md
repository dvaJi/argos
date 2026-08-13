# Tasks — Usage View + Repair Usage Dashboard / Recent Activity

Status: complete
Owner: usage-view
Created: 2026-08-12

Small, ordered tasks mapping to commits/PRs. Each is independently reviewable.

## Phase 1 — Daemon usage capture

- [x] **T1** Spike: confirm Pi worker session exposes token/usage counts (session API or `sessionFile` JSONL). Output: `AgentSession.getSessionStats()` → `tokens {input, output, cacheRead, cacheWrite, total}` + `cost` + `contextUsage`.
- [x] **T2** Add `daemon_usage_stats` table (create-if-not-exists + indexes) to `BunSessionRepository.ensureTable`; add `upsertUsageStat` + `getUsageStatsRows(window)` aggregation queries.
- [x] **T3** Pi: add `usage` event to `PiWorkerProtocol` (`PiWorkerEvent`); emit from `piWorker.ts` on settle with token counts + model id; handle in `PiProviderExecutionPort` → `upsertUsageStat`.
- [x] **T4** ACP: in `AcpProviderExecutionPort.runTurn`, consume `mapped.usage` (used/size/cost/meta); persist into assistant-message metadata (`usage` object) + `upsertUsageStat` (agent-reported cost wins).
- [x] **T5** Unit tests: `usageStatsAggregator` (window bucketing, cost source, provider/model grouping, daily series); repository upsert/read/window-filter; ACP runTurn persists usage (`acpProviderExecution.test.ts`).

## Phase 2 — Typed route + client

- [x] **T6** Add `usage.routes.ts` (`usage.getStats`, input window, output summary/daily/provider/model/service) to `packages/shared-contracts`; register in `ARGOS_ROUTE_CATALOG`.
- [x] **T7** Dispatch `usage.getStats` in `apps/daemon/src/dispatch/daemonDispatcher.ts` (aggregate from `daemon_usage_stats` via `usageStatsAggregator.ts`).
- [x] **T8** Add `packages/ui/api/UsageClient.ts` (`createUsageClient`) with `getStats(window)`.
- [x] **T9** Route tests: `daemonUsageStats.test.ts` + `usageStatsAggregator.test.ts` cover upsert/read/window/aggregation.

## Phase 3 — Usage page UI

- [x] **T10** Add `/_main/usage` route (peer of chat/welcome) + route tree regen (`routeTree.gen.ts`).
- [x] **T11** Components: header/filters, headline w/ caveat, service share, daily chart (cost/token toggle via **TanStack Charts** `@tanstack/charts@0.11.0` + `@tanstack/react-charts`), metric cards, Model breakdown table. `UsageView.tsx` + `DailyUsageChart.tsx`.
- [x] **T12** Wire to `UsageClient` via TanStack Router loader; loading/empty/error states. Sidebar Usage button added (`WindowSideBar.tsx`).

## Phase 4 — Repair existing dashboard + activity

- [x] **T13** Repoint `DashboardSettings.tsx` from legacy `agentSessionPresenter.getUsageDashboard()` to `UsageClient.getStats`; `UsageNostalgiaCard` adapted to `UsageStatsOutput`.
- [x] **T14** Recent Activity: add `settings.activity.record` route; daemon dispatcher writes to daemon `settings_activity` (insert + 2000-row prune); desktop `recordSettingsActivity` call sites forward to daemon; desktop `settingsActivityListRoute` reads daemon.
- [x] **T15** Remove desktop `settingsActivityTable` writes (stop split-brain); reads now daemon-side only. `SettingsClient.recordActivity` added.

## Phase 5 — Validation

- [x] **T16** Renderer/daemon tests: usage + aggregator + ACP persistence suites pass (97 tests across usage/repository/aggregator/route/ACP/tier2).
- [x] **T17** `bun run format`, `bun run lint`, `bun run typecheck` all pass; daemon tests green (pre-existing `vi.hoisted`/`vi.unstubAllGlobals` failures on base, unrelated).
- [x] **T18a** Fix "usage shows no data" — root causes:
  - Desktop `dispatchArgosRoute` threw `Unhandled argos route: usage.getStats` / `settings.activity.record` (no switch cases). Added both cases forwarding to `invokeDaemonRoute`.
  - Pi worker emitted `usage` **after** `settled` (event-ordering race) and the daemon read `lastUsage` after an await — moved persistence into the `usage` handler itself (persists via `worker.turn`), removed the racy `settled`-handler block.
  - Pi worker registered model cost as all-zero (`cost: {input:0,output:0,...}`) → `getSessionStats().cost` always 0 → `rawTokenCostUsd` null. Now resolves model pricing from the daemon provider DB (`getDaemonProviderDb`) and passes `model.cost` into the worker.
  - Added `daemonUsageRoute.test.ts` proving `usage.getStats` aggregates repository rows end-to-end through the dispatcher.
- [x] **T18b** ACP/local JSONL fallback (t3code-style): added `localUsageScanner.ts` parsing Codex (`~/.codex/sessions/**/*.jsonl`) and Claude Code (`~/.claude/projects/**/*.jsonl`) into `UsageStatRecord`s with `costSource: "estimated"`. `usage.getStats` merges scanned rows with DB rows and estimates cost from provider-DB pricing falling back to a built-in per-MTok table (`resolveBuiltinModelPrice`) for Codex/GPT-5.x/Claude models. Removed the `daemon_usage_stats` FK (external sessions) via a rebuild migration. Tests: `localUsageScanner.test.ts` (5, incl. real `event_msg.token_count` cumulative format), `resolveBuiltinModelPrice`, route dispatch; 104 usage-related tests pass. Live-verified against real `~/.codex` sessions: gpt-5.6-sol/terra/luna/mini breakdown, $152 raw cost, `costSource: "estimated"`.
- [x] **T18c** Scanner isolation: `ARGOS_USAGE_HOME` env override so tests don't scan the real home; `daemonUsageRoute.test.ts` uses a temp home.

## Phase 6 — Full-screen Usage page (layout fix)

- [x] **T19** Moved `/usage` from `_main` (chat layout with sidebar) to a **top-level route** (`routes/usage.tsx`, parent = root) — full-screen like settings: own window-drag title bar, **Back to chat** button, no chat sidebar/session list. `UsageView` is now the scrollable content (`h-full overflow-y-auto`); breakdown table gets `overflow-x-auto`. Removed `routes/_main/usage.tsx`; regenerated `routeTree.gen.ts` (build). Sidebar Usage button still navigates to `/usage`.
