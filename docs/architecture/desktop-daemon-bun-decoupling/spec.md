# Desktop as Thin Client for Daemon — Specification

## User Need

Argos desktop should behave like a thin client of the Argos daemon, not as a
second backend host. This lets the backend use Bun APIs freely inside
`apps/daemon` without forcing Electron main to stay compatible with Bun-only
runtime code.

## Goal

Make the daemon the canonical backend runtime for daemon-safe Argos features,
while keeping Electron desktop responsible only for native shell integration,
window lifecycle, preload, local sidecar supervision, and truly desktop-only
capabilities. Desktop is a shell plus transport layer, not a fallback backend.

## Background

The repository is already moving backend code into shared packages and daemon
adapters, but desktop still has direct presenter/runtime ownership in Electron
main. That creates two backend hosts:

- Electron main process: Node/Electron APIs, IPC, presenter graph.
- Daemon: Bun APIs, HTTP/WebSocket transport, independent service graph.

This dual-host model is fragile once daemon code starts using Bun-native APIs
such as `Bun.serve`, `Bun.file`, `Bun.write`, `Bun.password`, `Bun.spawn`,
`Bun.env`, `bun:sqlite`, or Bun-specific module/runtime behavior. Electron
cannot execute those APIs. The fix is not to avoid Bun in the daemon; the fix
is to stop treating Electron main as a backend runtime for daemon-owned
behavior and to make desktop a thin shell over the daemon.

This SDD builds on:

- `docs/architecture/headless-backend-kernel/`
- `docs/architecture/daemon-transport-runtime/`
- `docs/architecture/local-api-facade/`
- `docs/architecture/acp-runtime-shared/`

## Target Architecture

### Desktop

- Starts or attaches to a daemon as a local sidecar by default.
- Exposes an `ArgosBridge` transport to renderers.
- Routes daemon-safe backend operations to daemon HTTP/WebSocket.
- Keeps IPC only for Electron-native operations.
- Owns local process supervision, window/tray/dialog/native shell integration,
  and secure local capability facades.

### Daemon

- Owns backend state, long-lived services, provider execution, session runtime,
  ACP/MCP/skills/memory runtime execution, route dispatch, event publication,
  persistence, and Bun-native APIs.
- Exposes typed route invocation and event streaming over the shared transport.
- Can run as an embedded desktop sidecar or as a remote backend.

### Shared Packages

- Contain host-agnostic contracts, types, pure runtime logic, and ports.
- May depend on standard Node-compatible APIs only when required by the package
  contract.
- Must not import Electron APIs.
- Must not import Bun APIs unless the package is explicitly daemon-only.

## Scope

### In Scope

- Define desktop as a thin client of the daemon for daemon-safe backend
  operations.
- Make daemon-safe route invocation work through `ArgosBridge` over WebSocket
  RPC, not Electron presenter calls.
- Make desktop startup launch and monitor a local daemon by default.
- Support remote daemon attach through the same renderer-facing bridge contract.
- Move or fence Bun-dependent backend behavior behind `apps/daemon`.
- Add guardrails that prevent Bun imports from entering Electron desktop code.
- Classify routes and presenters into daemon-owned, desktop-owned, or shared.
- Preserve desktop-only capabilities through explicit local APIs.
- Remove any expectation that desktop silently hosts daemon-owned behavior when
  the daemon is available.

### Out of Scope

- Removing Electron desktop.
- Rewriting the renderer UI.
- Making every settings screen browser-compatible in the first milestone.
- Multi-user daemon tenancy.
- Cloud relay or pairing.
- Replacing all legacy presenter internals in one PR.

## User Stories

### US-1: Desktop Uses Local Daemon

As a desktop user, I want the app to launch a local daemon automatically, so the
desktop UI uses the same backend runtime as remote/browser clients.

Acceptance criteria:

- Desktop starts the daemon sidecar during app startup.
- Desktop waits for daemon `/health` before routing daemon-owned operations.
- Renderer `window.argos.invoke()` reaches daemon-owned routes through daemon
  transport.
- Daemon stdout/stderr are captured in desktop logs.
- If the daemon exits unexpectedly, desktop marks backend state disconnected and
  attempts controlled restart.

### US-2: Desktop Can Attach Remotely

As a user, I want desktop to connect to a remote daemon, so the Electron app can
be used as a UI for a backend running elsewhere.

Acceptance criteria:

- Desktop can store a daemon URL and auth credential.
- Connection test validates `/health` and authenticated route invocation.
- Event subscriptions reconnect without requiring renderer code changes.
- Desktop-only routes return explicit unsupported/native-required errors when
  attached to a remote daemon.

### US-3: Daemon Can Use Bun APIs

As a developer, I want daemon internals to use Bun APIs without breaking the
Electron app, so daemon implementation can use Bun-native server, storage,
process, file, and SQLite capabilities.

Acceptance criteria:

- Bun APIs appear only in `apps/daemon` or explicitly daemon-only packages.
- Desktop build/typecheck does not load Bun-only modules.
- Shared packages used by desktop do not import `bun:*` or reference global
  `Bun`.
- Guard scripts fail on new Bun imports in desktop or shared runtime packages.

### US-4: One Renderer Backend Contract

As a developer, I want renderer code to use one backend contract, so moving
execution into the daemon does not require UI rewrites.

Acceptance criteria:

- `ArgosBridge` remains the renderer backend contract.
- IPC and WebSocket transports implement the same route/event semantics.
- Renderer domain clients do not know whether a route is served by local IPC,
  embedded daemon, or remote daemon.
- Native-only host capabilities stay behind `@api/runtime` or another explicit
  local capability facade.

## Route Ownership

### Daemon-Owned

These should route to the daemon when the daemon is available:

- chat/session send/stop/steer flows
- provider execution
- ACP runtime execution and config state that can be served headlessly
- MCP runtime/config that does not require Electron UI
- skills runtime/config that does not require Electron UI
- memory runtime
- agent/session persistence
- model/provider catalog and backend config

### Desktop-Owned

These remain in Electron IPC/local APIs:

- window, tray, menu, tab, and BrowserWindow lifecycle
- native file/folder dialogs
- clipboard and shell open helpers
- Electron safeStorage where no daemon equivalent exists
- app update/restart/version packaging controls
- local browser/window capture features that depend on Electron WebContents

### Shared / Host-Agnostic

These may live in packages when they do not import Electron or Bun:

- route contracts and Zod schemas
- event contracts
- pure mapping/formatting utilities
- host ports and interfaces
- portable state helpers

## Non-Functional Requirements

- Startup: embedded daemon health ready within 5 seconds warm, 10 seconds cold.
- Transport overhead: daemon route dispatch adds less than 50 ms local overhead
  for non-streaming calls.
- Reliability: daemon crash does not crash the renderer process.
- Security: remote daemon access requires authenticated transport; no secrets in
  WebSocket query strings.
- Maintainability: route ownership is explicit and enforced by guard scripts.

## Constraints

- Do not import Bun APIs from `apps/desktop`.
- Do not import Electron APIs from `apps/daemon`.
- Do not import Electron or Bun APIs from shared packages unless a package is
  explicitly host-specific and named as such.
- New renderer backend calls must use typed route/client patterns.
- Native desktop capabilities must be explicit; no hidden fallback from daemon
  transport into legacy presenters for daemon-owned routes.
- Desktop should remain usable as a shell when the daemon is unreachable, but
  daemon-owned routes must not fall back to Electron presenter execution.

## Decisions

- The desktop should use an embedded local daemon by default for daemon-owned
  routes.
- Remote daemon attach uses the same bridge transport model as the embedded
  daemon.
- Electron IPC remains for desktop-owned native routes only.
- Bun APIs are allowed and expected in `apps/daemon`.
- Shared runtime packages stay host-agnostic; daemon-specific wrappers live in
  daemon code or daemon-only packages.
- WebSocket route RPC is the preferred desktop-to-daemon invocation path once
  `daemon-transport-runtime` lands; HTTP route invocation remains useful for
  health/debug and migration fallback.
- Desktop should be treated as a shell/client surface, not a second execution
  host, matching the thin-client/server split we want here.

## Open Questions

- Which settings screens should be daemon-safe in the first cut, and which stay
  Electron-only until later?
- Should local daemon binaries be bundled per platform in the first cut, or
  should desktop initially spawn `bun run daemon` in dev and use packaged daemon
  only for release builds?
- Which desktop-only errors should be user-visible versus developer-only logs?
