# Desktop as Thin Client for Daemon — Plan

## Strategy

Use the existing Argos architecture instead of introducing a new transport
model, but shape it around a thin desktop shell and a daemon-owned backend:

- `ArgosBridge` remains the renderer backend contract.
- `WebSocketBridge` becomes the primary bridge for daemon-owned routes.
- `HybridBridge` keeps IPC for desktop-owned native routes.
- The daemon becomes the canonical backend host for runtime execution.
- Electron main becomes a host shell and local capability provider.
- Desktop remains a thin client for daemon-owned work; it does not retain a
  second backend path as a fallback.

This is a boundary migration, not a behavior rewrite. Each phase moves ownership
from Electron-presenter execution to daemon execution while preserving the
renderer-facing API.

## Phase 1 — Inventory and Ownership Register

Create a route/presenter ownership register covering:

- route name / event name
- current desktop handler
- current daemon handler
- target owner: `daemon`, `desktop`, or `shared`
- transport: WebSocket RPC, HTTP fallback, or IPC/local API
- host dependencies: Electron, Bun, Node stdlib, native addon
- migration status
- whether the area is thin-client-only, daemon-owned, or desktop-native

Initial source candidates:

- `apps/desktop/src/main/routes/`
- `apps/desktop/src/main/presenter/`
- `apps/daemon/src/dispatch/`
- `apps/daemon/src/host/`
- `packages/shared-contracts/src/routes/`
- `packages/client-sdk/src/`

Expected artifact:

- `docs/architecture/desktop-daemon-bun-decoupling/ownership-register.md`

## Phase 2 — Guardrails

Add static checks before moving more code:

- fail on `Bun`, `bun:*`, or Bun-only module imports under `apps/desktop`
- fail on `electron` imports under `apps/daemon`
- fail on Electron/Bun imports in host-agnostic shared packages
- optionally allow host-specific packages by explicit allowlist
- block any new desktop-side daemon fallback code paths

Candidate implementation:

- extend `scripts/architecture-guard.mjs`
- add a small import-boundary helper if the guard becomes too large

The purpose is to make future migration work safer. Without this, daemon code
can silently leak back into desktop.

## Phase 3 — Sidecar Supervisor

Desktop needs a small daemon supervisor owned by Electron main:

- resolve daemon executable or dev command
- choose host/port/data-dir/token
- start daemon in background
- poll `/health`
- capture stdout/stderr
- restart on unexpected exit with backoff
- expose connection state to preload/renderer
- shut down local daemon on app quit when desktop owns the process
- keep the desktop usable as a shell even when daemon startup fails

Target location:

- `apps/desktop/src/main/daemon/` or
  `apps/desktop/src/main/presenter/daemonPresenter/`

This component is desktop-owned. It must not import daemon internals directly;
it should treat the daemon as a process with HTTP/WebSocket endpoints and must
not become a fallback backend host.

## Phase 4 — Transport Cutover

Align desktop bridge behavior with `daemon-transport-runtime`:

- daemon-owned routes use `WebSocketBridge`
- desktop-owned routes use IPC/local API
- unsupported remote desktop routes return typed errors
- remove silent fallback from daemon-owned routes back into desktop presenters
- consolidate duplicate WebSocket bridge implementations onto `client-sdk`
- make the bridge layer explicit about client/server ownership

Primary files:

- `packages/client-sdk/src/websocket-bridge.ts`
- `apps/desktop/src/preload/hybridBridge.ts`
- `apps/desktop/src/preload/createBridge.ts`
- `apps/daemon/src/index.ts`

## Phase 5 — Runtime Ownership Migration

Move daemon-safe backend execution out of Electron presenter ownership in
reviewable slices:

1. Session/chat/provider execution.
2. ACP runtime execution.
3. MCP runtime execution.
4. Skills runtime execution.
5. Memory runtime execution.
6. Backend config and model/provider catalog.

For each slice:

- route exists in shared contracts
- daemon handler is complete
- desktop renderer client calls the typed route
- Electron presenter direct path is removed or reduced to transport/native glue
- tests prove daemon handler parity for the moved behavior

## Phase 6 — Desktop Presenter Reduction

Once route ownership is moved, shrink desktop presenters:

- remove daemon-owned state from Electron main
- keep only desktop-native presenters
- remove direct imports into daemon-owned runtime packages where possible
- keep compatibility adapters only where a route is explicitly desktop-owned

This phase is where the desktop starts to look like a shell/client instead of a
backend host.

## Boundary Rules

### Allowed

- Desktop imports `@argos/client-sdk`, shared contracts, renderer clients, and
  desktop-native helpers.
- Desktop starts daemon as an external process.
- Daemon imports Bun APIs and daemon host adapters.
- Shared packages expose host ports and pure logic.
- Desktop-owned code may manage availability and connection state, but it does
  not own daemon-safe backend execution.

### Forbidden

- Desktop importing `apps/daemon/*`.
- Desktop importing packages that reference global `Bun` or `bun:*`.
- Daemon importing Electron.
- Renderer importing presenter internals.
- Daemon-owned routes falling back silently to desktop presenters.
- Daemon-owned routes never execute through Electron presenters when the daemon
  is reachable.

## Data Flow

Embedded desktop:

```text
Renderer -> window.argos -> HybridBridge -> WebSocketBridge -> local daemon
         -> daemon dispatcher -> daemon host/runtime -> daemon events -> renderer

Renderer -> @api/runtime native call -> IPC/local facade -> Electron native API
```

Remote desktop:

```text
Renderer -> window.argos -> HybridBridge -> WebSocketBridge -> remote daemon
         -> daemon dispatcher -> daemon host/runtime -> daemon events -> renderer

Renderer -> @api/runtime native call -> IPC/local facade -> Electron native API
```

## Testing

- Guard tests for forbidden Bun/Electron imports.
- Daemon route tests for every migrated route slice.
- Bridge tests for route RPC, events, reconnect, and typed errors.
- Desktop supervisor tests for health timeout, restart, and shutdown.
- End-to-end smoke test:
  - start desktop
  - daemon becomes healthy
  - create session
  - send message
  - receive stream event

## Validation Commands

- `pnpm run format`
- `pnpm run lint`
- `pnpm run typecheck`
- daemon-focused tests for migrated slices
- desktop bridge/supervisor tests

## Risks and Mitigations

- Risk: desktop startup becomes dependent on daemon readiness.
  Mitigation: explicit connection state and retry UI; keep native shell usable.

- Risk: route ownership becomes ambiguous.
  Mitigation: ownership register plus architecture guard.

- Risk: remote daemon breaks desktop-only workflows.
  Mitigation: typed unsupported/native-required errors and UI capability checks.

- Risk: shared packages accidentally become Bun-specific.
  Mitigation: import guard and host-specific package naming.

- Risk: migration is too large for one PR.
  Mitigation: migrate by route/runtime slice, with shippable checkpoints.
