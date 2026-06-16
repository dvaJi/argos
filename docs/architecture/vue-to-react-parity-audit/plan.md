# Plan

## Approach

1. Compare the user-facing route and settings inventory between `H:\o-proy\argos` and `H:\personal-proy\argos3`.
2. Inspect high-risk migrated screens for materially reduced behavior.
3. Write a migration parity audit with three buckets:
   - confirmed missing or incomplete items
   - notable parity wins
   - uncertain items requiring runtime verification

## Evidence Sources

- `src/renderer/src/pages/**`
- `src/renderer/settings/App.*`
- `src/renderer/settings/components/**`
- `src/shared/settingsNavigation.ts`

## Validation

- Ensure the audit includes direct file references for both repos.
