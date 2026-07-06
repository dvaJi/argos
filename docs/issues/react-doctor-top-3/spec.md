# React Doctor Top 3 Cleanup

## Problem

The latest React Doctor run surfaced three high-priority warning groups we want to clear on this pass:

- `deslop/unused-dependency` for unused desktop package dependencies.
- `deslop/unused-dev-dependency` for unused desktop devDependencies.
- `react-doctor/insecure-crypto-risk` in three places where non-security fingerprint or vendor-code patterns were being flagged.

These warnings add package surface, make dependency review noisier, and leave the current doctor report with avoidable security noise.

## Acceptance Criteria

- Unused dependencies are removed from `apps/desktop/package.json`.
- Unused devDependencies are removed from `apps/desktop/package.json`.
- The three reported insecure-crypto-risk findings are addressed at the root cause, not silenced.
- A follow-up `npx react-doctor@latest --verbose` run no longer reports these three groups.

## Non-goals

- No attempt to clear the rest of the doctor report in this pass.
- No rule disables, ignores, or suppressions.
- No broad dependency audit beyond the warned entries.

