# Spec: Provider & models catalog refresh broken (5MB guard + cost schema gap)

## Problem

The bundled provider/model catalog (`apps/desktop/resources/model-db/providers.json`, the single
source that `apps/daemon/build.mjs` copies next to the daemon binary for offline model resolution)
was stale (last refreshed 2026-07-18, 143 providers / 6,983 models). Root causes:

1. `scripts/fetch-provider-db.mjs` aborted any download over **5MB**; the upstream aggregate
   (ThinkInAIXYZ/PublicProviderConf `all.json`) is now **6.3MB** → every refresh failed with
   "Downloaded file too large".
2. The script also wrote to repo-root `resources/model-db/` (cwd-relative), not the tracked
   single-source path the daemon build reads.
3. Upstream added **nested cost structures** (`cost.tiers[]`, `cost.context_over_200k{}`);
   `ProviderAggregateSchema` typed `cost` as a flat `Record<string, string|number>` and rejected
   the refreshed catalog ("SCHEMA VALIDATION FAILED" on `cost.tiers` / `cost.context_over_200k`).

## Goal

A repeatable, correct catalog refresh: fresh data committed at the single-source path, schema
validation passing, and a wired npm script for future refreshes.

## Acceptance criteria

- [x] Size guard raised to 25MB (upstream is 6.3MB; guard still catches pathological files).
- [x] Script output anchored to `apps/desktop/resources/model-db/providers.json` via the script's
      own location (cwd-independent).
- [x] `ProviderAggregateSchema.cost` widened to allow nested pricing structures (tiers arrays,
      per-context-threshold objects) alongside flat string/number rates; all consumers already
      runtime-narrow (`costNumber`/`getCostNumber`).
- [x] Refreshed catalog validates against the schema: 206 providers / 9,479 models
      (+63 providers, +2,496 models vs. the stale snapshot; removed: github-models, firepass).
- [x] `bun run fetch:provider-db` npm script wired.
- [x] Desktop + daemon typecheck, daemon `bun test` (344), lint guards, oxlint.

## Non-goals / known limitations

- The daemon's runtime remote-fetch parser (`getStringNumberRecord`) still keeps only flat
  string/number cost keys — remote-refreshed daemon caches lose nested tier pricing (flat rates
  used by cost estimation are unaffected). The bundled snapshot retains the full nested data.
- Tiered/threshold-aware pricing is not consumed anywhere yet (flat `input`/`output`/`cache_*`
  per-MTok rates drive usage cost estimates).
- electron-builder `extraResources` still has no `model-db` entry; the desktop packaged fallback
  path relies on the daemon bundle copied by `apps/daemon/build.mjs` (verified present).
