# React Compiler Lint Adoption

## User need

Oxlint 1.79+ ships 22 React Compiler-powered rules that validate the Rules of React using
the compiler's own analysis passes (see the
[Oxc React Compiler announcement](https://oxc.rs/blog/2026-08-18-react-compiler-support.html)).
Argos must adopt these rules so that `@argos/ui` (and `apps/landing`) code is React
Compiler-compatible: components that violate the rules are skipped by the compiler's
automatic memoization, so every violation today is a component that silently gets no
optimization and may harbor a real Rules-of-React bug.

## Goal

1. Enable the full set of React Compiler lint rules in `.oxlintrc.json` as errors.
2. Fix every diagnostic they report, without suppression comments
   (`oxlint-disable-*`, and removing stale `eslint-disable-*` / `react-doctor-disable-*`
   comments that suppress the same underlying issues).
3. `bun run lint` (which runs `oxlint --deny-warnings .`) passes with zero diagnostics.

## Baseline inventory (oxlint 1.80.0, full rule set enabled)

432 diagnostics across 129 files:

| Rule | Count | Nature |
| --- | --- | --- |
| `react/exhaustive-effect-dependencies` | 115 | Missing/extra effect deps |
| `react/set-state-in-effect` | 109 | Sync setState inside effects |
| `react/todo` | 105 | Compiler bailout: `try`/`finally` (87), getters (4), others (one-offs) |
| `react/memo-dependencies` | 93 | Missing/extra `useMemo`/`useCallback` deps |
| `react/rule-suppression` | 6 | Stale `eslint-disable-next-line` comments |
| `react/use-memo` | 4 | Function calls used as deps |

Scope: `packages/ui` (src, settings, browser-overlay) and `apps/landing`.

## Acceptance criteria

- [ ] `.oxlintrc.json` enables all 22 implementable React Compiler rules as `error`.
- [ ] `bunx oxlint .` reports 0 errors and 0 warnings.
- [ ] No new suppression directives are added; pre-existing stale suppressions that
      hide React-hooks/compiler issues are removed.
- [ ] `bun run lint` passes (guards + oxlint).
- [ ] `bun run typecheck` passes.
- [ ] `bun test` (daemon) and desktop/UI Vitest suites pass.
- [ ] `bun run format` applied.

## Constraints

- No behavior regressions: refactors must preserve user-visible behavior.
- Prefer idiomatic React fixes endorsed by the React Compiler docs:
  derive during render, lazy `useState` initializers, reset-with-key, adjusting state
  during render (prev-compare), effects with `.then()`/async-IIFE + cancellation guards,
  module-scope helpers for opaque flows, refs for non-render values.
- No `oxlint-disable` directives. No `eslint-disable`/`react-doctor-disable` directives
  on the issues fixed here.

## Non-goals

- Re-enabling the classic `react-hooks/exhaustive-deps` rule (the compiler-based
  `exhaustive-effect-dependencies` / `memo-dependencies` rules supersede it for effects
  and memoization hooks; the project previously disabled the classic rule).
- Actually compiling the UI with the React Compiler at build time
  (`oxc-transform-react` / `@vitejs/plugin-react` `compiler: true`). Lint adoption first;
  build-time compilation is a follow-up.
- Fixing vendored/generated files (`resources/`, `routeTree.gen.ts`, `shadcn/`, `test/`)
  which remain lint-ignored.

## Open questions

None. Rule scope (all 22 rules) and severity (`error`) are settled.
