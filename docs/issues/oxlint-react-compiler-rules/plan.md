# Plan: oxlint 1.80 React Compiler rules migration

Batched migration, area by area, with the rules re-enabled only when an area is clean:

1. `react/immutability` + `react/use-memo` (10 sites) — mechanical.
2. `react/set-state-in-effect` (110 sites) — group by directory: `stores/ui/*` bindings, `views/*`,
   `pages/*`, `components/chat/*`, `settings/*`. For each site pick the canonical fix:
   - derive during render (no state),
   - lazy `useState(() => ...)` initializer,
   - move the set into the event/subscription callback,
   - or `useSyncExternalStore` for store-backed values.
3. Strip the overrides from `.oxlintrc.json`.

## Verification

Per batch: `bun run lint` clean, UI typecheck, and spot-check the touched screens in dev.
