# Daemon Startup Readiness Race Spec

## Problem

The first daemon route call after launch fails with `ECONNREFUSED 127.0.0.1:<port>` (observed as
`[providerDbLoader] Initial catalog sync from daemon failed`) on essentially every dev startup,
leaving the desktop provider-catalog mirror uninitialized until some later refresh.

## Root Cause

- `startSidecar` assigns the reserved port to the handle before the daemon process is spawned.
- `invokeDaemonRoute` treats "handle has a port" as "daemon is reachable" and fetches immediately.
- In dev, Bun cold-starting `apps/daemon/src/index.ts` loses the race against presenter
  initialization, so the TCP connect is refused.

## Acceptance Criteria

- `SidecarHandle.whenHealthy(timeoutMs?)` resolves once the daemon answers health checks:
  - immediately if the sidecar is already healthy;
  - otherwise on the `healthy` status transition;
  - rejection when the sidecar stops, errors permanently, or the timeout elapses.
- `invokeDaemonRoute` waits for daemon readiness within its existing deadline before fetching;
  readiness failure surfaces as a `DaemonRouteError` with code `daemon_not_running`.
- No caller-side retry/backoff workarounds are introduced.

## Non-Goals

- No changes to daemon startup, health endpoint, or restart policy.
- No changes to other handle consumers (`resolveUiUrl`, protocol handler).
