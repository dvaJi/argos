# Plan: Provider & models catalog refresh

## Approach

Three small fixes + one data refresh:

1. `scripts/fetch-provider-db.mjs` — size guard 5MB → 25MB; output path anchored to the script
   location → `apps/desktop/resources/model-db/providers.json` (the tracked single source read by
   `apps/daemon/build.mjs`); header comment updated.
2. `packages/shared/src/types/model-db.ts` — `ModelSchema.cost` widened from
   `Record<string, string|number>` to allow nested upstream pricing structures (`tiers: [...]`,
   `context_over_200k: {...}`) as unknown-shaped values. Safe: every consumer
   (`modelCost.ts` `costNumber`, `usageStats.ts` `getCostNumber`) narrows at runtime.
3. `package.json` — `fetch:provider-db` script for repeatable refreshes.
4. Ran the refresh; validated output against `ProviderAggregateSchema`.

## Data flow

Upstream `all.json` → sanitizer whitelist → bundled snapshot (committed) → daemon build copies it
next to the daemon binary → `ProviderDbLoader` offline fallback; runtime remote refresh keeps the
daemon cache current when online.

## Verification

- `ProviderAggregateSchema.safeParse` on the generated file (via a throwaway bun script).
- `bun run typecheck` (desktop), daemon typecheck + `bun test` (344 pass).
- `bun run lint` (guards + oxlint), oxfmt.
