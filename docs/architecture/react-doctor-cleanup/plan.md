# Plan

## Approach

Run react-doctor 0.9.12 (pinned) with `--json` against `packages/ui` (`--scope full --project packages/ui --blocking none`). Work through error diagnostics grouped by rule, fixing root causes per the canonical rule prompts. After each batch: `bun run typecheck`, `bun run lint`, and a rescan with identical selection to prove the diagnostics disappeared and nothing regressed.

## Affected interfaces

None at the public API level. Changes are intra-component: effect cleanups, updater purity, ref access moved out of render, hook dependency arrays, compiler-compatible code shapes.

## Data flow

Unchanged.

## Compatibility

- Keep props/events/rendering semantics identical.
- Keep `memo`/`useMemo`/`useCallback` where removal could change observable identity.
- React Compiler is enabled via `reactCompilerPreset()` (packages/ui/vite.config.ts), so compiler-skip diagnostics map to components that silently lose memoization — fixing them is a pure win.

## Test strategy

- Repo suite: `bun run typecheck`, `bun run lint`, `bun run format`.
- react-doctor rescan (same version/scope/project) after each batch; final unfiltered scan to prove no cross-category regression.
- Renderer unit tests where they cover touched files (`bun run test:renderer`).

## Batches (ordered)

1. `effect-needs-cleanup` (8) — add cleanup functions to subscriptions in effects.
2. `no-impure-state-updater` (6) — move side effects out of `setState(updater)` bodies.
3. `no-ref-current-in-render` (10) — move `.current` access to effects/handlers or lazy-init pattern.
4. `use-memo` (11) — make dependency arrays array literals.
5. `refs` (45) + `immutability` (34) + `purity` (7) — compiler-compatible rewrites (biggest files first: NewThreadPage.tsx, ChatPage.tsx, AcpSettings.tsx, useWorkspaceSync.ts, ModelProviderSettings.tsx).
6. `preserve-manual-memoization` (10) — evaluate each memo; only change when behavior-preserving.
7. `todo` (111) — case-by-case; cheap shape fixes where obvious, otherwise leave (hints, not defects).
8. Warnings pass if time allows: `exhaustive-deps` (167), `set-state-in-effect` (96).
