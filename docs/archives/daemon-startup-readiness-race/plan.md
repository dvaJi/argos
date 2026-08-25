# Daemon Startup Readiness Race Plan

## Changes

1. `apps/desktop/src/main/presenter/sidecarManager/index.ts`
   - Track health waiters in `startSidecar`; resolve them on the `healthy` status transition,
     reject on `stopped`/`error`.
   - Add `whenHealthy(timeoutMs = 30000)` to `SidecarHandle`: resolves immediately when already
     healthy, otherwise waits for the transition (or rejects on timeout/stop/error).

2. `apps/desktop/src/main/routes/daemonRouteProxy.ts`
   - After obtaining a handle with a reserved port, await `handle.whenHealthy()` using the
     remaining share of the existing deadline before fetching; map failure to `DaemonRouteError`
     (`daemon_not_running`) so every daemon-route caller inherits correct startup semantics.

## Rationale

Fixing the shared proxy fixes all early daemon callers at once (provider catalog sync, config,
sessions) instead of patching each call site, and reuses the sidecar's own health status rather
than adding a parallel probe.

## Tests

- `apps/desktop/test/main/presenter/sidecarManager.test.ts`
  - `whenHealthy` resolves immediately when already healthy.
  - `whenHealthy` waits for the `healthy` transition during startup.
  - `whenHealthy` rejects when the sidecar stops while waiting.
- `apps/desktop/test/main/routes/daemonRouteProxy.test.ts`
  - Existing cases updated for the handle mock; new case asserting a readiness failure maps to
    `daemon_not_running`.
