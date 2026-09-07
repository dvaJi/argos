# Issue: Usage view duplicate React keys in model breakdown

## Summary

`UsageView.tsx:445` warns: "Encountered two children with the same key,
`deepseek-v4-flash:deepseek-v4-flash`". Duplicate keys can drop or duplicate rendered
rows.

## Root cause

The daemon's `buildModelBreakdown` (`apps/daemon/src/host/usageStatsAggregator.ts`)
groups usage per `(providerId, modelId)` — key `` `${providerId}::${modelId}` `` — but
sets each bucket's `id`/`label` to just `modelId`. When the same model is used under
two harnesses, the client renders two rows with identical `id`/`label`, and the row key
`` `${item.id}:${item.label}` `` collides.

Two rows for one model under different harnesses is by design (the table's "Harness"
column displays `providerId`); only the client key is wrong.

## Fix

Key rows by `${item.providerId}:${item.id}` — mirrors the daemon's grouping key and is
guaranteed unique.

## Acceptance criteria

- No duplicate-key warning when the same model appears under multiple harnesses.
- Both rows render (one per harness).
