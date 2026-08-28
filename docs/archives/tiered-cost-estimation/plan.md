# Plan: Tier-aware usage cost estimation

## Approach

One shared pure resolver + threading a context size through the two estimation paths.

### 1. `packages/shared/src/types/model-db.ts`

- `ProviderModelCostValue` / `ProviderModelCost` type aliases; `ModelSchema.cost` uses them.
- `resolveCostForContext(cost, contextTokens)` — pure tier resolution (see spec).
- `getStringNumberRecord` → `getFlexibleCostRecord` (keeps nested values) for the runtime
  remote-parse path.

### 2. Daemon

- `host/modelCost.ts` — `resolveModelCost(..., contextTokens?)`: effective rates via the shared
  helper, then the existing numeric coercion.
- `host/usageStatsAggregator.ts` — `UsageCostEstimator` gains optional `contextTokens`;
  `estimateRowCost` passes `row.inputTokens`.
- `dispatch/daemonDispatcher.ts` — estimator callback threads the parameter.

### 3. Desktop

- `main/presenter/usageStats.ts` — `estimateUsageCostUsd` resolves effective rates with
  `params.inputTokens`; `getCostNumber` takes the effective cost record.

## Data flow

Usage row (or estimate params) → prompt size = `inputTokens` (total prompt incl. cached) →
`resolveCostForContext` picks flat vs tiered rates → existing per-MTok arithmetic unchanged.

## Test strategy

- New `apps/daemon/test/modelCost.test.ts` (bun test): flat fallback, `context_over_200k`
  shorthand, explicit tier precedence (tier > shorthand, largest ≤ context), unknown context.
- Extend `apps/desktop/test/main/presenter/usageStats.test.ts` with a tiered model fixture.
- `bun run typecheck` (desktop + daemon), daemon `bun test`, lint, format.
