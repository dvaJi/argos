# Consolidate Contract Catalogs — Plan

## Current State

Three live `ARGOS_ROUTE_CATALOG` registrations exist (see `spec.md`). They are
static object literals of the form:

```ts
[<routeId>Route.name]: <routeId>Route,
```

so the registered set can be compared by static parse without importing the
modules (which would require resolving `@shared/*` aliases per-universe).

## Approach

### Phase 1 — Drift guard (this goal)

Add `scripts/route-catalog-drift-guard.mjs` that:

1. Reads the three catalog files.
2. Extracts registered route identifiers via `/\[(\w+)\.name\]\s*:/g`.
3. Verifies every registered identifier is also imported in the same file
   (catches registration-without-import).
4. Compares the three identifier sets and fails with a precise diff if they
   differ.

Wire it into `pnpm run lint` as `lint:route-catalog` (after the existing guards,
before `oxlint`).

This makes the exact "Unknown argos route" failure mode fail CI at lint time
instead of at daemon runtime.

### Phase 2 — Single source of truth (deferred to `headless-backend-kernel`)

True consolidation requires converging the duplicated `@shared` type/presenter
trees, because the contract files import `@shared/presenter`, `@shared/types/*`,
and `@shared/chat`, and those resolve to different (drifted) trees per universe.

Ordered steps (to be executed under the daemon migration, not here):

1. **Port desktop contract evolution → `@argos/shared-contracts`.** Copy the
   desktop versions of the drifted files into the package, rewriting
   `../../<sibling>` → `../<sibling>` (desktop's `contracts/routes/` nests one
   level deeper than the package's `src/routes/`). Keep `@shared/*` type imports
   as-is (both universes use them). Includes: Zod v4 API migration, MCPRouter
   routes, `sessions.*` tape-view-manifest routes, `system.*` provider-install
   routes, `bridge.ts` workspace extension.
2. **Point consumers at the package.**
   - `backend-core`: switch `@shared/contracts/*` → `@argos/shared-contracts/*`.
   - daemon: already uses `@argos/shared-contracts` — no change.
   - desktop: re-alias `@shared/contracts/*` → `@argos/shared-contracts` in the
     Vite `pathAliasPlugin` (prefix-specific, ahead of the generic `@shared/`
     rule) and desktop tsconfig paths.
3. **Delete the two superseded trees:**
   `apps/desktop/src/shared/contracts/` and `packages/shared/src/contracts/`.
4. **Converge the `@shared` type/presenter trees** (`apps/desktop/src/shared`
   vs `packages/shared`) so `@shared/*` resolves to one implementation — the
   larger daemon-migration scope.

## Compatibility

Phase 1 is additive (a guard + lint wiring) and cannot change runtime behavior.
Phase 2 is a breaking refactor isolated to the daemon-migration program.

## Test Strategy

- Phase 1 guard is itself verified by `pnpm run lint` passing green on the
  reconciled tree, and by intentionally simulating drift (covered by the guard's
  own diff output format, reviewed manually).
- Existing `pnpm run typecheck` (desktop node + web) and the daemon/backend-core
  typechecks remain the regression gate for any later phase.
