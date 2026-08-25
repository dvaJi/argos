# ACP Daemon State Ownership Spec

## Problem

The desktop shell still owns a full parallel ACP configuration stack: its own
`AcpConfHelper` (JSON store at `<userData>/acp_agents.json`), `AcpRegistryService`
(registry cache + icon cache under `<userData>/acp-registry`), and
`AcpLaunchSpecService` (installed binaries under the same root). All renderer
`config.*` traffic goes to the daemon (nothing under `config.` is desktop-only),
so this local stack only produces a second, divergent copy of the state — reset to
defaults on every launch because the desktop SQLite tables backing it are no-op
stubs. Users end up with `%APPDATA%\Argos\acp_agents.json` (empty defaults)
alongside the authoritative `%APPDATA%\Argos\config\acp_agents.json`.

## Decision

- The daemon is the single source of truth for all ACP configuration state:
  global enable flag, registry catalog, per-agent enable/env overrides, install
  states, manual agents, shared/per-agent MCP selections, and icon markup.
- Desktop main-process consumers (`agentSessionPresenter`, `mcpPresenter`
  service ports, `floatingButtonPresenter`, sync export paths, legacy event
  bridge) keep calling `ConfigPresenter`, whose ACP method bodies now delegate to
  the daemon through the typed `invokeDaemonRoute` proxy — the same pattern used
  by `providerDbLoader` and knowledge configs.
- The desktop no longer constructs `AcpConfHelper`, `AcpRegistryService`, or
  `AcpLaunchSpecService`; it no longer reads or writes `<userData>/acp_agents.json`
  or maintains a second registry/binary cache.
- Capabilities without a daemon route and without any live caller
  (`resolveAcpLaunchSpec`, per-agent MCP selection mutations
  `setAgentMcpSelections`/`addMcpToAgent`/`removeMcpFromAgent`) are removed from
  the desktop class and from `IConfigPresenter`.
- Agent listing/typing (`listAgents`, `getAgent`, `getAgentType`) resolves ACP
  agents from the daemon instead of the empty desktop SQLite store.

## Acceptance Criteria

- No desktop process writes `<userData>/acp_agents.json` on launch.
- Desktop ACP reads/writes succeed against daemon state (verified by existing
  callers compiling and by the daemon suite).
- Renderer-visible behavior is unchanged where routes already exist.
- `bun run lint` architecture guards pass; route catalog guard passes.

## Non-Goals

- Removing other duplicated desktop stores (MCP settings, prompts, provider
  models) — tracked separately.
- Deleting the orphaned legacy file on disk; it simply stops being written.
- Changes to daemon-side ACP runtime behavior (covered by
  `docs/issues/acp-agent-update-reconcile`).
