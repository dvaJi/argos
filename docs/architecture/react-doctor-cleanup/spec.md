# React Doctor Cleanup

## User need

The `@argos/ui` package scores 0/100 ("Critical") on react-doctor 0.9.12 with 242 errors and 1098 warnings across 204 files. We want a materially healthier score by fixing real correctness and compiler-compatibility issues, not by suppressing rules.

## Goal

Eliminate the error-severity diagnostics in `@argos/ui`, prioritizing:

1. Real bug classes: `effect-needs-cleanup`, `no-impure-state-updater`, `no-ref-current-in-render`.
2. React Compiler bail-outs: `refs`, `immutability`, `purity`, `use-memo`, `preserve-manual-memoization`, `todo` — rewrite flagged patterns so the compiler can compile the component; use `use no memo` only where a rewrite is not feasible.

Then opportunistically reduce high-count warning categories (`exhaustive-deps`, `set-state-in-effect`, `react-compiler-no-manual-memoization`) where fixes are behavior-preserving.

## Acceptance criteria

- react-doctor full scan of `packages/ui` reports 0 fixable (non-`todo`) errors (from 137; total errors from 242).
- Remaining error-severity diagnostics are exclusively `todo` (compiler HIR limits, ~96 try/finally) — documented as "not a code mistake" by the rule page and recorded as intentional deferrals, not defects.
- `bun run typecheck`, `bun run lint`, `bun run format` pass at the same or better than baseline (baseline: all pass).
- No behavior changes: same props, events, rendering semantics.

### Outcome notes (as-built)

- Final scan: 242 → 105 errors, all remaining are `todo`; warnings 1098 → 1211.
- The score remains 0/"Critical" because `todo` diagnostics carry error severity; clearing them is a separate decision (refactor ~96 try/finally blocks or opt files out with `use no memo`).
- Warning increase is expected: files that previously failed compilation (error) skipped warning reporting; now that they compile, their pre-existing `set-state-in-effect` / `react-compiler-no-manual-memoization` warnings surface. `exhaustive-deps` improved by 7.

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
