# Plan: Usage dashboard cost-quality shares

Contract change (`usage.routes.ts`) → daemon aggregation → view rendering. Shares are
cost-weighted (Σ reported costUsd vs Σ estimated costUsd over scoped rows); turns with
`costSource: "none"` count as unpriced. Route-catalog drift guard covers registration.

# Tasks

- [x] `UsageCostQualitySchema` + `UsageSummary.costQuality` in the contract.
- [x] Daemon `buildSummary` computes shares; dispatcher passes through output parse.
- [x] `UsageView` renders "N% reported · M% estimated" beside the badge when estimated > 0.
- [x] Aggregator tests (mixed shares + unpriced/null cases); typechecks; lint; format.
