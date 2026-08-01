# Plan

## Approach

Update `DashboardSettings.tsx` to actively kick off usage backfill when available and retry dashboard loading while the backfill is still unsettled.

## Changes

- Reuse the existing refresh timer ref to schedule retries.
- Trigger `startUsageStatsBackfill()` when the presenter exposes it.
- Keep retrying when the dashboard is empty and backfill status is `idle` or `running`.

## Validation

- Run `bun run format`.
- Run `bun run lint`.
