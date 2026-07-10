# Desktop as Daemon Client — Tasks

## Phase 1 — Ownership Register

- [x] Create `ownership-register.md`.
- [x] Classify the first-pass ownership for desktop-owned, daemon-owned, and shared behavior.
- [x] Identify the first migration slice with the smallest blast radius.
- [x] Record the canonical route catalog source and the current desktop/daemon handler families.
- [x] Mark current host dependencies for each owned area.
- [x] Reword the spec/plan to state the thin-client desktop model explicitly.

## Phase 2 — Guardrails

- [x] Extend `architecture-guard.mjs` to reject Bun imports in desktop code.
- [x] Extend `architecture-guard.mjs` to reject Electron imports in daemon code.
- [x] Add shared-package host-coupling checks.
- [x] Add allowlist support for explicitly host-specific packages if needed.
- [x] Add fixtures or focused tests for the guard rules.
- [x] Ensure guardrails block accidental desktop-side backend fallback code.

## Phase 3 — Sidecar Supervisor

- [x] Design the desktop daemon supervisor module.
- [x] Implement daemon command/executable resolution for dev mode.
- [x] Implement health polling and timeout handling.
- [x] Capture daemon stdout/stderr into desktop logs.
- [x] Add restart/backoff on unexpected daemon exit.
- [x] Add controlled shutdown on app quit for desktop-owned daemon processes.

## Phase 4 — Transport Cutover

- [x] Confirm daemon WebSocket route RPC supports route invocation and events.
- [x] Route daemon-owned calls through `WebSocketBridge`.
- [x] Keep desktop-owned native calls on IPC/local API.
- [x] Remove silent fallback for daemon-owned routes.
- [x] Return typed unsupported/native-required errors for desktop-only remote
      routes.
- [x] Remove duplicate WebSocket bridge code where `client-sdk` can be reused.

## Phase 5 — Runtime Ownership Migration

- [x] Move chat route dispatch to the daemon proxy for local daemon sessions.
- [x] Move session/chat/provider execution ownership to daemon.
  - [x] Move session CRUD, active-session, pending-input, retry, edit, fork,
        clear, and delete-message route ownership to daemon.
  - [x] Add daemon compatibility handling for `sessions.resumePendingQueue`.
  - [x] Move session agent-list route ownership to daemon.
  - [x] Move compaction, export, history/search, traces, agent-transfer, ACP
        commands/config route ownership to daemon.
  - [x] Move generation settings and disabled-tools route ownership to daemon.
  - [x] Remove daemon-side empty fallbacks for session search/trace/view routes.
- [x] Move ACP draft-session and pending-input route ownership to daemon.
- [x] Proxy daemon-backed provider catalog routes from desktop to daemon.
- [x] Move ACP execution ownership to daemon.
  - [x] Move ACP session commands/config route ownership to daemon.
  - [x] Cover ACP process warmup/config lookup daemon routes with regression tests.
- [x] Move MCP execution ownership to daemon.
  - [x] Serve MCP tool-definition lists from the daemon runtime instead of an empty placeholder.
  - [x] Require daemon MCP client enumeration to be served by the runtime.
  - [x] Cover daemon MCP sampling decisions/cancellations with headless route regressions.
  - [x] Cover daemon MCP headless default initialization with regression coverage.
- [x] Move skills execution ownership to daemon.
- [x] Move memory execution ownership to daemon.
  - [x] Cover daemon memory add/status/search behavior with a headless regression.
- [x] Move plugin host ownership to daemon.
  - [x] Add daemon-side plugin discovery, activation, and route dispatch.
  - [x] Fence UI-only plugin actions behind explicit daemon-mode unsupported errors.
  - [x] Cover daemon plugin shutdown cleanup and plugin UI action rejection with regressions.
- [x] Move backend config/model/provider catalog ownership to daemon where safe.
  - [x] Move cloud sync config routes to daemon.
  - [x] Move provider refresh route ownership to daemon.
  - [x] Refresh daemon-owned provider model catalogs from provider endpoints.
  - [x] Move provider import scan/apply to a shared daemon-safe service.
  - [x] Serve model audio transcription from the daemon provider runtime.
  - [x] Preserve custom provider models in the daemon MCP host ports.
  - [x] Extract the built-in knowledge MCP server into `backend-core` with injected ports.
  - [x] Extract the auto-prompt MCP server into `mcp-runtime` with injected ports.
  - [x] Extract the deep-research MCP server into `mcp-runtime` with injected locale/config ports.
  - [x] Extract the conversation-search MCP server into `mcp-runtime` with injected data ports.
  - [x] Move the shared built-in in-memory search/knowledge MCP servers into `mcp-runtime` so both desktop and daemon can instantiate them.
  - [x] Serve settings activity history from the daemon database.
  - [x] Move scheduled-tasks firing to the daemon with headless adapters.

## Phase 6 — Desktop Presenter Reduction

- [x] Remove daemon-owned state from Electron presenters.
  - [x] Route session read helpers through the daemon bridge in production.
  - [x] Route ACP session commands/config through the daemon bridge in production.
  - [x] Route session compaction/export/transfer helpers through the daemon bridge in production.
  - [x] Route ACP process warmup/config lookup through the daemon bridge in production.
- [x] Delete or shrink desktop presenter adapters that only forwarded backend
      behavior.
- [x] Keep native-only presenters explicit and documented.
- [x] Update route ownership register after each removal.
- [x] Verify no daemon-owned path still routes through Electron as a fallback.
  - [x] Add regression coverage for concurrent local-daemon connects during preload lifecycle events.
  - [x] Preserve daemon route failure diagnostics when the fallback error payload is empty.
  - [x] Return an explicit headless unsupported error for desktop-only routes such as `system.openSettings`.

## Validation

- [x] `pnpm run format`
- [x] `pnpm run lint`
- [x] `pnpm run typecheck`
- [x] Daemon route tests for migrated slices.
  - [x] Session repository ownership tests for ACP drafts, pending inputs, retry,
        edit, fork, and delete-from-message persistence.
  - [x] Daemon plugin discovery/activation route coverage.
  - [x] Daemon skill runtime discovery and session-state persistence coverage.
- [x] Desktop supervisor/bridge tests.
  - [x] Local-daemon connect dedupe coverage across preload lifecycle events.
  - [x] Embedded daemon supervisor health/stop coverage.
- [x] End-to-end smoke test for desktop using an embedded daemon.
