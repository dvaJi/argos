# Implementation Plan — Usage View + Repair Usage Dashboard / Recent Activity

Status: in-progress
Owner: usage-view
Created: 2026-08-12

## Architecture Decisions

### AD-1: Daemon owns usage capture and aggregation (single source of truth)

All sessions (Pi + ACP) already persist through the daemon (`PiProviderExecutionPort` / `AcpProviderExecutionPort` → `BunSessionRepository`). Usage capture rides the same path:

- **ACP**: in `AcpProviderExecutionPort.runTurn`, consume `mapped.usage` (currently dropped). Persist per-turn into assistant-message metadata and into a new `daemon_usage_stats` table.
- **Pi**: add a usage event to `PiWorkerProtocol` (`PiWorkerEvent`), emit it from `piWorker.ts` on `agent_settled`/turn completion (read from the session's usage/token data), and handle it in `PiProviderExecutionPort` → same table.
- Cost: ACP uses agent-reported `cost` when present; Pi uses the model cost table (`providerDbLoader` style `input/output/cache_read/cache_write` per MTok) already used by `usageStats.ts`. When unknown → null (UI shows estimate caveat).

### AD-2: New `daemon_usage_stats` table (additive)

Managed in `bun-session-repository.ts` (the daemon's SQLite). Columns:

| column | type | notes |
| --- | --- | --- |
| id | TEXT PK | uuid |
| session_id | TEXT | FK daemon_sessions |
| message_id | TEXT | FK daemon_messages |
| provider_id | TEXT | |
| model_id | TEXT | |
| usage_date | TEXT | local `YYYY-MM-DD` |
| input_tokens | INTEGER | |
| cached_input_tokens | INTEGER | |
| cache_write_input_tokens | INTEGER | |
| output_tokens | INTEGER | |
| reasoning_tokens | INTEGER | |
| total_tokens | INTEGER | |
| cost_usd | REAL NULL | agent-reported or estimated |
| cost_source | TEXT | `reported` \| `estimated` \| `none` |
| created_at | INTEGER | |

Index on `(usage_date)`, `(provider_id, model_id)`, `(session_id)`. Additive; no migration of existing rows.

### AD-3: Typed route `usage.getStats` + `UsageClient`

- Route contract in `packages/shared-contracts/src/routes/usage.routes.ts`; register in `ARGOS_ROUTE_CATALOG`.
- Input: `{ window: "past24h" | "7d" | "30d" | "90d" }`.
- Output: summary + daily series + provider breakdown + model breakdown + service list (shape mirrors `UsageDashboardData` where possible so the settings section can reuse it).
- Dispatch in `apps/daemon/src/dispatch/daemonDispatcher.ts` (daemon-owned; works in desktop + web).
- Client: `packages/ui/api/UsageClient.ts` (`createUsageClient`).

### AD-4: New `/_main/usage` page (t3code-style)

- Route file `packages/ui/src/routes/_main/usage.tsx` (peer of `chat`/`welcome`).
- Components in `packages/ui/src/components/usage/`:
  - `UsageHeader` (window filter pills: Past 24h / 7d / 30d / 90d + refresh)
  - `RawTokenCostHeadline` (with "* if billed at full API rate" footnote)
  - `ServiceShareRow` (Codex / Claude Code / Argos-Pi style service share + tokens)
  - `DailyCostChart` (cost/token toggle; simple bar/line from daily series)
  - `UsageMetricCards` (processed tokens, cached input, uncached input, output, cache savings)
  - `UsageBreakdownTable` (Model / Day tabs; columns Model, Cost, Share, Tokens)
- Data fetched via `UsageClient`; TanStack Router loader + TanStack Store state.
- Chart: use **TanStack Charts** (`@tanstack/react-charts` / `@tanstack/charts`) for the daily cost/token chart — confirmed by owner.

### AD-5: Repoint settings Usage Dashboard to daemon data

`DashboardSettings.tsx` currently calls legacy `agentSessionPresenter.getUsageDashboard()` + `startUsageStatsBackfill()`. Change it to use `UsageClient.getStats(window)`; keep the `UsageNostalgiaCard` if it renders from the same shape. The legacy `getUsageDashboard` / `runUsageStatsBackfill` / `argosUsageStatsTable` path is removed (or left only for the imported-legacy migration, then deleted).

### AD-6: Fix Recent Activity (single writer)

- Daemon gets an activity-recording capability: a `settings.activity.record` route (or reuse `settingsUpdate` internals) writing to the daemon `settings_activity` table.
- Desktop `recordSettingsActivity` call sites (`routes/index.ts`) forward through the daemon route instead of the desktop SQLite table. Desktop `settingsActivityTable` writes stop; reads already come from the daemon (`daemonDispatcher.ts` `settingsActivityListRoute`), so the settings renderer gets live data.
- Alternative if daemon-forwarding is too broad: make the daemon the writer for the operations the settings UI actually performs (providers, models, mcp, skills, prompts, agents, backup) and delete desktop writes. [NEEDS CLARIFICATION] — prefer forwarding all call sites for parity.

## Event Flow

```
Pi worker (turn settle) ──usage event──▶ PiProviderExecutionPort ─┐
ACP agent (usage_update) ─▶ AcpContentMapper ─▶ AcpProviderExecutionPort.runTurn ─┴▶ BunSessionRepository.upsertUsageStat
                                                                                          │
                                                                                          ▼
                                                                              daemon_usage_stats
                                                                                          │
UI Usage page ─▶ UsageClient.getStats ─▶ daemonDispatcher usage.getStats ──▶ aggregate (SQL)
                                                                                          │
Settings overview DashboardSettings ─▶ UsageClient.getStats ───────────────────────────────┘
```

## Data Model / Compatibility

- Additive table; no schema version bump needed (create-if-not-exists in `BunSessionRepository.ensureTable`).
- `daemon_messages.metadata` gains an optional `usage` object (ACP) — additive, backward compatible.
- No breaking changes to existing session/message persistence.

## Test Strategy

- **Unit (daemon)**: `usageStats` aggregation helpers (window bucketing, cache-savings math, cost estimate); `BunSessionRepository.upsertUsageStat` + `getUsageStats`.
- **Unit (Pi protocol)**: `piWorker` emits usage event on settle; `PiProviderExecutionPort` persists it.
- **Unit (ACP)**: `AcpProviderExecutionPort.runTurn` persists `mapped.usage` (existing `acpContentMapper.test.ts` pattern); agent-reported cost wins over estimate.
- **Renderer**: `UsageClient` contract; Usage page renders loading/empty/error/data states; `DashboardSettings` uses new client; activity list renders non-empty after a recorded action.
- **Integration**: `usage.getStats` route returns expected shape for seeded rows.

## Risks

- Pi worker session API may not expose usage/token counts directly — may need to read from the session's `sessionFile` JSONL or the model runtime; verify early (spike).
- Chart library choice (dependency vs dependency-free SVG).
- Recent Activity forwarding may touch many desktop call sites — keep mechanical, test via one representative route.
