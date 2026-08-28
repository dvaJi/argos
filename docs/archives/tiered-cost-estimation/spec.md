# Spec: Tier-aware usage cost estimation (long-context pricing)

## Summary

~325 models in the provider catalog (OpenAI-style long-context pricing, resold via routers like
llmgateway/crossmodel/edenai/orcarouter) charge **higher per-MTok rates once a request's prompt
context crosses a threshold** (e.g. 200k tokens → rates double). The catalog now preserves that
data (`cost.tiers[]`, `cost.context_over_200k`) but cost estimation ignores it, so estimates for
large-context turns on those models come out up to ~2× too low.

## Encoding (upstream)

- `context_over_200k: { input, output, cache_read, ... }` — shorthand: applies when prompt
  context > 200k tokens.
- `tiers: [{ tier: { type: "context", size: 272000 }, input, output, cache_read }]` —
  generalized thresholds; the tier with the **largest `size` ≤ context** wins.

## User story

As a user, usage cost estimates for models with long-context tiered pricing must reflect the
rates actually billed for the request's context size (when the provider doesn't report cost).

## Acceptance criteria

- [ ] Shared pure helper `resolveCostForContext(cost, contextTokens)` in `@argos/shared` picks the
      effective rates: largest matching `context` tier wins; `context_over_200k` (>200k) applies
      when no explicit tier matched; unknown context → flat rates; tier keys missing from the
      record fall back to flat.
- [ ] Daemon `resolveModelCost` accepts an optional `contextTokens`; `UsageCostEstimator` passes
      the row's prompt size (`inputTokens`, which already includes cached + cache-write portions);
      output tokens never count toward the threshold.
- [ ] Desktop `estimateUsageCostUsd` applies the same tier resolution.
- [ ] Runtime remote-parse (`getFlexibleCostRecord`) preserves nested cost structures so
      daemon-refreshed caches keep tier data (parity with the bundled snapshot).
- [ ] Tests: daemon `modelCost` (flat fallback / shorthand / explicit tier precedence) and desktop
      `usageStats` tiered fixtures; all existing suites pass.

## Non-goals

- Per-token marginal billing across a threshold (upstream bills the whole request at the tier
  rate — matches implementation).
- Tier types other than `context` (skipped defensively).
- UI display of tier breakdowns.
