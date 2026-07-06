# Desktop as Daemon Client — Tasks

## Phase 1 — Ownership Register

- [x] Create `ownership-register.md`.
- [x] Classify the first-pass ownership for desktop-owned, daemon-owned, and shared behavior.
- [x] Identify the first migration slice with the smallest blast radius.
- [ ] List every route under shared contracts and current desktop/daemon handler.
- [ ] Mark current host dependencies for each owned area.
- [x] Reword the spec/plan to state the thin-client desktop model explicitly.

## Phase 2 — Guardrails

- [x] Extend `architecture-guard.mjs` to reject Bun imports in desktop code.
- [x] Extend `architecture-guard.mjs` to reject Electron imports in daemon code.
- [x] Add shared-package host-coupling checks.
- [ ] Add allowlist support for explicitly host-specific packages if needed.
- [ ] Add fixtures or focused tests for the guard rules.
- [ ] Ensure guardrails block accidental desktop-side backend fallback code.

## Phase 3 — Sidecar Supervisor

- [ ] Design the desktop daemon supervisor module.
- [ ] Implement daemon command/executable resolution for dev mode.
- [ ] Implement health polling and timeout handling.
- [ ] Capture daemon stdout/stderr into desktop logs.
- [ ] Add restart/backoff on unexpected daemon exit.
- [ ] Add controlled shutdown on app quit for desktop-owned daemon processes.

## Phase 4 — Transport Cutover

- [ ] Confirm daemon WebSocket route RPC supports route invocation and events.
- [x] Route daemon-owned calls through `WebSocketBridge`.
- [ ] Keep desktop-owned native calls on IPC/local API.
- [x] Remove silent fallback for daemon-owned routes.
- [ ] Return typed unsupported/native-required errors for desktop-only remote
      routes.
- [ ] Remove duplicate WebSocket bridge code where `client-sdk` can be reused.

## Phase 5 — Runtime Ownership Migration

- [x] Move chat route dispatch to the daemon proxy for local daemon sessions.
- [ ] Move session/chat/provider execution ownership to daemon.
- [ ] Move ACP execution ownership to daemon.
- [ ] Move MCP execution ownership to daemon.
- [ ] Move skills execution ownership to daemon.
- [ ] Move memory execution ownership to daemon.
- [ ] Move backend config/model/provider catalog ownership to daemon where safe.

## Phase 6 — Desktop Presenter Reduction

- [ ] Remove daemon-owned state from Electron presenters.
- [ ] Delete or shrink desktop presenter adapters that only forwarded backend
      behavior.
- [ ] Keep native-only presenters explicit and documented.
- [ ] Update route ownership register after each removal.
- [ ] Verify no daemon-owned path still routes through Electron as a fallback.

## Validation

- [ ] `pnpm run format`
- [ ] `pnpm run lint`
- [ ] `pnpm run typecheck`
- [ ] Daemon route tests for migrated slices.
- [ ] Desktop supervisor/bridge tests.
- [ ] End-to-end smoke test for desktop using an embedded daemon.
