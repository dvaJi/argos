# Spec: oxlint 1.80 React Compiler rules migration (110 `set-state-in-effect` sites)

## Problem

oxlint 1.76 → 1.80 enables the React Compiler-era `react/*` rules by default. First run surfaces
**120 warnings**: 110× `react/set-state-in-effect` (synchronous `setState` inside `useEffect`),
6× `react/use-memo`, 4× `react/immutability`. The lint gate (`--deny-warnings`) fails, so the
three rules are disabled in `.oxlintrc.json` as part of the deps bump to keep the gate green.

## Goal

Migrate the codebase so the rules can be re-enabled, restoring React Compiler-grade optimization
across the renderer.

## Plan (follow-up, not part of the deps bump)

1. Re-enable `react/immutability` + `react/use-memo` first (10 sites, mechanical).
2. Batch-migrate `set-state-in-effect` sites per area (`stores/` bindings, chat views, settings):
   derive during render, initialize state directly, or move the update into the event/store
   subscription that caused it. Event-driven `onIpcChannel` callbacks are NOT in scope (they are
   effects on external systems); the target is `useEffect(() => setState(x), [...])` patterns.
3. Remove the three rule overrides from `.oxlintrc.json` once zero warnings remain.

## Acceptance criteria

- [ ] `bunx oxlint` reports zero warnings for the three rules with them re-enabled.
- [ ] No behavior change in the affected components (render output identical before/after).
