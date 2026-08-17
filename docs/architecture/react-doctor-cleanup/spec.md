# React Doctor Cleanup

## User need

The `@argos/ui` package scores 0/100 ("Critical") on react-doctor 0.9.12 with 242 errors and 1098 warnings across 204 files. We want a materially healthier score by fixing real correctness and compiler-compatibility issues, not by suppressing rules.

## Goal

Eliminate the error-severity diagnostics in `@argos/ui`, prioritizing:

1. Real bug classes: `effect-needs-cleanup`, `no-impure-state-updater`, `no-ref-current-in-render`.
2. React Compiler bail-outs: `refs`, `immutability`, `purity`, `use-memo`, `preserve-manual-memoization`, `todo` — rewrite flagged patterns so the compiler can compile the component; use `use no memo` only where a rewrite is not feasible.

Then opportunistically reduce high-count warning categories (`exhaustive-deps`, `set-state-in-effect`, `react-compiler-no-manual-memoization`) where fixes are behavior-preserving.

## Acceptance criteria

- react-doctor full scan of `packages/ui` reports 0 errors (from 242).
- Score improves measurably from 0.
- `bun run typecheck`, `bun run lint`, `bun run format:check` pass at the same or better than baseline (baseline: all pass).
- No behavior changes: same props, events, rendering semantics.

## Constraints

- No rule suppression via config or inline disables to clear the report.
- Preserve manual memoization that encodes observable identity/comparator behavior.
- Smallest local change per root cause; no drive-by refactors.
- Follow the react-doctor per-rule fix prompts (fetched from react.doctor).

## Non-goals

- Fixing every warning (1098) in one pass.
- Restructuring the settings renderer's legacy quarantine imports.
- Performance profiling of individual components.

## Open questions

- None blocking. `todo` diagnostics are compiler-limit hints; we fix the code shape where cheap, otherwise defer (they are "not a code mistake" per the rule page).
