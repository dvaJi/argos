# Vue-to-React Parity Implementation

## Goal

Close the remaining confirmed user-facing parity gaps between the React migration in `argos3` and the original Vue Argos renderer.

## Scope

- MCP settings parity
- Argos Agents editor parity
- Data settings cloud sync parity
- Database encryption UI parity
- Provider reordering parity
- Localization strategy for migrated UI

## Acceptance Criteria

- Each confirmed gap from `docs/architecture/vue-to-react-parity-audit/audit.md` is either implemented or explicitly reclassified with rationale.
- Existing migrated behavior remains functional.
- Each slice is small enough to verify independently.

## Non-Goals

- Reverting the React migration
- Full redesign of renderer or settings UX
