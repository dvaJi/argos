# Spec: Usage dashboard cost-quality shares

## Summary

Follow-up to the tiered-cost estimation work (docs/features/tiered-cost-estimation) and the
catalog-refresh hardening, implementing t3code's `CostQuality` pattern: the usage dashboard
should make **how trustworthy the cost number is** visible — provider-reported vs
catalog-estimated — instead of a single "Mixed sources" badge.

## Changes

1. `usage.getStats` contract (`packages/shared-contracts/src/routes/usage.routes.ts`):
   `UsageSummarySchema` gains `costQuality: { reportedShare, estimatedShare, unpricedTurns }`
   (shares are cost-weighted fractions of reported vs estimated cost; `null` when nothing is
   priced).
2. Daemon `usageStatsAggregator.buildSummary` computes the shares from row `costSource`.
3. `UsageView.tsx`: next to the `CostSourceBadge`, shows
   "N% reported · M% estimated" whenever an estimated share exists.

## Acceptance criteria

- [x] Shares computed cost-weighted; unpriced turns counted; `null` shares when nothing priced.
- [x] Filtered (per-service) view keeps the contract shape with null shares (computed
      server-side only).
- [x] Aggregator tests cover mixed + unpriced cases.
- [x] Typechecks (ui/daemon/desktop), lint, daemon `bun test` (351).

## Non-goals

- Per-model cost-quality breakdown; historical cost-quality trending.
