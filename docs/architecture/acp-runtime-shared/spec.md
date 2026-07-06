# ACP Runtime Shared (Desktop + Daemon) — Specification

## Goal

Make the Agent Client Protocol (ACP) runtime work in **both** the desktop
Electron main process and the headless daemon (`apps/daemon`, Bun), so ACP
agents can be enabled, installed, configured, and executed regardless of which
backend hosts the session. Today the entire ACP stack lives exclusively in
`apps/desktop/src/main/`; the daemon has only stub config methods and a
HTTP-only `BunProviderExecutionPort` with zero ACP support.

## Background / Problem

Symptom (current): opening the ACP settings page against a daemon backend logs
`[ACP] settings error: window.electron.ipcRenderer is not available` and
`[ACP] toggle error: ...`. Root cause: `AcpSettings.tsx` calls the legacy
presenter transport, which is desktop-Electron-IPC-only. But even after migrating
that page to typed routes, ACP would still be non-functional in the daemon
because the daemon backend has no ACP runtime at all:

- `apps/daemon/src/host/daemonConfigPresenter.ts` returns empty/null for
  `listAcpRegistryAgents`, `resolveAcpLaunchSpec`, install/repair/uninstall,
  `setAcpEnabled`, etc. (only `getAcpEnabled`/`getAcpAgents`/shared-MCP are
  stubbed as stored values).
- `apps/daemon/src/host/bun-provider-execution.ts` is a barebones
  OpenAI-compatible HTTP `fetch` client; it cannot spawn agent subprocesses,
  manage ACP sessions, or handle tool/permission interactions.

The ACP runtime is ~9,000 lines spread across `llmProviderPresenter/acp/`,
`llmProviderPresenter/providers/acpProvider.ts`, `acpClientPresenter/`, and
`configPresenter/` ACP services, plus ~4,700 lines of tests — all in
`apps/desktop`.

## Scope

### In Scope

- New shared package `packages/acp-runtime/` hosting the host-agnostic ACP
  runtime (process manager, session manager, persistence, content mapper,
  registry/launch-spec/conf helpers, fs/terminal handlers).
- Host-port abstraction layer (`AcpHostPorts`) injected by each host: paths,
  runtime resolution, event publication, lifecycle hooks, MCP runtime.
- Desktop adapter: thin `AcpProvider extends BaseLLMProvider` wrapping the
  shared runtime (preserves `ILlmProviderPresenter` integration).
- Daemon adapter: `AcpProviderExecutionPort implements ProviderExecutionPort`
  wrapping the shared runtime; wiring into `apps/daemon/src/index.ts`.
- Extend `DaemonConfigPresenter` with the full ACP config surface, backed by
  the shared `acpConfHelper` store logic.
- Add typed `config.*` ACP routes (install/uninstall/repair/registry/launch-spec/
  env-override/manual agents) to `shared-contracts` + the shared config
  dispatcher so they work in both hosts (daemon already delegates `config.*`).
- Migrate `AcpSettings.tsx` (and any other settings-surface legacy callers)
  off `useLegacyPresenter` onto the typed `ConfigClient`.
- Move existing desktop ACP tests to mirror the new package layout; keep them
  green.

### Out of Scope (v1)

- Bundling a runtime (node/uv/ripgrep) into the daemon. The daemon resolves
  `npx`/`uvx`/`node` from `$PATH` in v1.
- A web/CLI/mobile client UX for ACP — the desktop settings UI remains the
  management surface; the daemon serves the same routes/events.
- Remote-attach specific hardening (auth/TLS) for ACP streams — covered by the
  existing daemon transport, not re-addressed here.
- Cloud sync of ACP registry state.
- Multi-tenant ACP isolation.

### Deferred

- Bundled runtime shipping for the daemon (so agents work on hosts without
  Node/uv preinstalled).
- ACP terminal protocol via `node-pty` on the daemon (gated behind native-addon
  availability; see Risks).

## User Stories

### US-1: Enable ACP on any backend

**As a** user connected to a daemon (or desktop),
**I want** to toggle ACP on, install registry agents, and configure them,
**So that** ACP agents appear as usable models.

**Acceptance Criteria:**

- `config.setAcpEnabled`, `config.listAcpRegistryAgents`,
  `config.refreshAcpRegistry`, `config.ensureAcpAgentInstalled`,
  `config.repairAcpAgent`, `config.uninstallAcpRegistryAgent`,
  `config.setAcpAgentEnabled`, `config.setAcpAgentEnvOverride`,
  `config.listManualAcpAgents`, `config.addManualAcpAgent`,
  `config.updateManualAcpAgent`, `config.removeManualAcpAgent` are typed routes
  served identically by desktop and daemon dispatchers.
- The ACP settings page works in daemon mode with no `window.electron` access.
- Registry install/uninstall persists across daemon restarts.

### US-2: Run an ACP agent turn on the daemon

**As a** user with an active ACP agent,
**I want** to send a message and receive the streamed agent response,
**So that** ACP agents behave like any other provider on the daemon.

**Acceptance Criteria:**

- `chat.sendMessage` for an ACP-backed session spawns the agent process via the
  shared runtime and streams `SessionNotification` updates back to the client
  over the daemon event channel.
- Session persistence (load/new/resume) works against the daemon's SQLite store.
- `chat.stopStream` cancels the active ACP turn.
- Tool/permission requests surface as events the client can respond to
  (`respondToolInteraction`).

### US-3: No desktop regression

**As a** desktop user,
**I want** ACP to keep working identically,
**So that** the refactor is invisible.

**Acceptance Criteria:**

- All existing desktop ACP tests pass unchanged (public APIs preserved).
- `pnpm run typecheck && pnpm run lint && pnpm run format` green.
- No new `electron` imports inside `packages/acp-runtime/`.

## Constraints

- **No Electron inside the shared package.** `packages/acp-runtime/` must not
  import `electron`, `@/eventbus`, `@/routes/...`, or `@/lib/runtimeHelper`
  directly. All host concerns are injected via `AcpHostPorts`.
- **Bun compatibility.** Shared code may only use Node stdlib + npm libs that
  run under Bun (`child_process`, `fs`, `path`, `stream`, `cross-spawn`,
  `@agentclientprotocol/sdk`, `nanoid`, `fflate`). `node-pty` is lazy-loaded
  and optional.
- **Route contract discipline.** New ACP capabilities exposed to renderers go
  through Zod-validated `shared-contracts` routes, never raw presenter calls.
- **Architecture guards.** `scripts/architecture-guard.mjs` must be updated to
  permit the `packages/acp-runtime` boundary and the new desktop→package edges.
- **Compatibility.** `IConfigPresenter` ACP method signatures stay unchanged;
  desktop keeps its in-process direct calls during/after migration.

## Non-Functional Requirements

- **Startup**: enabling ACP and listing registry agents on the daemon <1s
  (excluding network registry fetch).
- **Streaming latency**: daemon ACP event dispatch overhead <50ms vs desktop.
- **Memory**: shared runtime adds <50MB resident per active agent process
  (parity with desktop).
- **Portability**: Windows, macOS, Linux for both hosts (modulo `node-pty`).

## Risks

- **`node-pty`** (native addon) under Bun: used by `AcpTerminalManager` and
  `acpInitHelper`. Mitigation: lazy-load; if the addon is unavailable, terminal
  requests and interactive built-in bootstrap degrade gracefully (agent
  execution still works). Document as v1-deferred for the daemon.
- **`RuntimeHelper` coupling**: the desktop resolves bundled node/uv/ripgrep
  via Electron `app.getAppPath()`; the daemon has no bundle. Mitigation:
  abstract behind `RuntimePort`; daemon implementation resolves from `$PATH`.
- **ACP execution model vs `ProviderExecutionPort`**: ACP is streaming +
  permission/tool-interactive, not a single request/response. Mitigation: the
  daemon adapter translates ACP stream events into the daemon `IEventPublisher`
  channel; permissions/tool interactions reuse `respondToolInteraction`.
- **Migration size**: ~9k lines / ~4.7k test lines. Mitigation: phased rollout
  (see `plan.md`), keep desktop shims/re-exports until each phase stabilizes.

## Open Questions

Resolved up front (no `[NEEDS CLARIFICATION]` remains):

1. **Management UX source?** The desktop settings UI remains the management
   surface; the daemon serves the same routes so any attached client can manage.
2. **Bundled runtime in daemon?** No for v1 — daemon uses `$PATH`-resolved
   `npx`/`uvx`/`node`. Bundled runtime deferred.
3. **Full streaming/permission support on daemon?** Yes — "ACP everywhere"
   requires it; delivered via the daemon event channel.
