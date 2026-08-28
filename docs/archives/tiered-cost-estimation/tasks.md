# Tasks: Tier-aware usage cost estimation

- [x] Shared `resolveCostForContext` helper + `ProviderModelCost` types + flexible remote-parse
      (`getFlexibleCostRecord`).
- [x] Daemon: `resolveModelCost` context param, `UsageCostEstimator` signature, dispatcher call
      site.
- [x] Desktop: `estimateUsageCostUsd` tier resolution.
- [x] Tests: daemon `modelCost.test.ts` (5), desktop `usageStats.test.ts` (+3 tiered fixtures).
- [x] `bun run typecheck` (desktop + daemon), daemon `bun test` (349 pass), lint, format.
