# Plan

## Implementation Approach

1. Import the shared default provider catalog into the daemon config presenter.
2. Change daemon `getProviders()` to merge persisted entries onto built-in defaults while preserving custom providers.
3. Add `getDefaultProviders()` and dispatch `providers.listDefaults` in the daemon dispatcher.
4. Extend daemon hybrid coverage for fresh-start provider catalog routes.

## Affected Files

- `apps/daemon/src/host/daemonConfigPresenter.ts`
- `apps/daemon/src/dispatch/daemonDispatcher.ts`
- `apps/daemon/test/e2e-hybrid.test.ts`

## Validation

- `pnpm --filter @argos/daemon test -- e2e-hybrid.test.ts`
- `pnpm run format`
- `pnpm run lint`
- `pnpm run typecheck`
