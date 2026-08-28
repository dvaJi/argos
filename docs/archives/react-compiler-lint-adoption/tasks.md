# React Compiler Lint Adoption — Tasks

Status legend: `[ ]` todo, `[x]` done, `[~]` in progress.

1. `[x]` Probe oxlint 1.80.0 React Compiler analysis semantics; record canonical fixes (plan.md).
2. `[x]` Enable all 22 React Compiler rules as errors in `.oxlintrc.json`.
3. `[x]` Pilot fixes by lead agent: `ChatStatusBar`, `AcpSettings`, `WorkspaceSelector`,
   `ChatTabView`, `FolderPicker`, `DataSettings`, `ArgosAgentsSettings`,
   `ModelProviderSettings`, `FolderPicker`; pure store helpers `getSortedProvidersFrom`
   (providerStore) and `getChatSelectableModelGroupsFrom` (modelStore); removed
   `eslint-disable` / `react-doctor-disable` comments hiding these issues.
4. `[x]` Batch fixes across all remaining files (parallel batches + lead-finished
   batches), all 432 baseline diagnostics resolved.
5. `[x]` All stale suppression comments removed (6 `rule-suppression` sites + AcpSettings).
6. `[x]` Verified: `bunx oxlint .` → 0 warnings, 0 errors; `bun run lint` green.
7. `[x]` Verified: `bun run format` applied; `format:check` clean; UI
   `typecheck:web` and desktop `typecheck:node` pass.
8. `[x]` Tests: daemon `bun test` → 351 pass / 0 fail. Desktop `test:main`
   failures (37) verified pre-existing on the clean branch tree (identical counts
   with all changes stashed). Renderer vitest config fails on the clean tree too
   (pre-existing vite/rolldown startup error, unrelated).
9. `[x]` Goal folder archived to `docs/archives/` on completion.

## Outcome

- 432 React Compiler diagnostics (129 files) → 0.
- `.oxlintrc.json` now pins all 22 implementable compiler rules as errors, so any
  regression or new violation fails CI via `bun run lint` (`oxlint --deny-warnings`).
- Follow-up (out of scope): build-time React Compiler memoization via
  `@vitejs/plugin-react` `compiler: true` + `oxc-transform-react`.
