# Consolidate Contract Catalogs — Tasks

## Phase 1 — Drift guard (DONE)

- [x] Reconcile MCPRouter catalog registrations across all three catalogs.
- [x] SDD artifacts (`spec.md`, `plan.md`, `tasks.md`).
- [x] `scripts/route-catalog-drift-guard.mjs` (now a single-catalog integrity check).
- [x] Wire `lint:route-catalog` into `pnpm run lint`.
- [x] Verified guard catches drift.

## Gate 1 — Unify daemon universe (DONE)

- [x] Switch `backend-core` imports `@shared/contracts/*` → `@argos/shared-contracts/*`.
- [x] Fix `packages/shared` internal refs (`types/plugin.ts`, `legacy.presenters.d.ts`).
- [x] Delete `packages/shared/src/contracts/`.
- [x] Fix invalid Zod v4 code exposed in shared-contracts (`z.record` 1-arg → 2-arg, `ZodType` arity).
- [x] Add `@argos/shared-contracts` path mapping to desktop `tsconfig.node.json`.
- [x] Verify: desktop / daemon / backend-core / shared-contracts typecheck, lint, tests.

## Gate 2 — Single source of truth at `@argos/shared-contracts` (DONE)

- [x] Port desktop contract evolution into the package: `connection.ts`,
      `system.routes.ts`, merged `sessions.routes.ts` (incl. `resumePendingQueue`),
      `tape-view-manifest` type, `bridge.ts` workspace extension (+ type-only
      `packages/shared/src/workspaceConfig.ts`), `routes.ts` catalog, remaining
      Zod v4 fixes.
- [x] Re-point desktop `@shared/contracts/*` → `@argos/shared-contracts`:
      Vite `pathAliasPlugin`, `tsconfig.node.json`, `tsconfig.app.tsgo.json`,
      both vitest configs.
- [x] Delete `apps/desktop/src/shared/contracts/`.
- [x] Fix 3 test files that bypassed the alias with relative imports.
- [x] Guard repurposed to single-catalog integrity check.
- [x] Verify: desktop typecheck (node+web) + 2294 tests pass, daemon/backend-core/
      shared-contracts typecheck, lint, format all green.

## Remaining (out of scope — `headless-backend-kernel`)

- [ ] Converge the two `@shared` type/presenter trees (`apps/desktop/src/shared` vs
      `packages/shared`) so the `@shared/*` types referenced by contracts are not
      themselves duplicated.
