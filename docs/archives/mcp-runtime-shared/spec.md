# MCP Runtime Shared (Desktop + Daemon) — Specification

## Goal
Port the MCP (Model Context Protocol) subsystem from the desktop Electron main
process to a shared `packages/mcp-runtime/` package consumed by both desktop and
the headless daemon, mirroring the completed ACP port.

## Background
Desktop MCP lives in `apps/desktop/src/main/presenter/mcpPresenter/` (index 856,
serverManager 314, mcpClient 1255, toolManager 885, mcprouterManager 125, +
inMemoryServers). The daemon now owns the MCP config surface plus the runtime
routes for clients, tools, prompts, resources, and sampling acknowledgements;
desktop only retains native/UI glue where necessary. `DaemonConfigPresenter.getMcpServers()`
remains the canonical MCP config entrypoint on the daemon.

## Scope

### Slice A — Config half (this slice)
- New `packages/mcp-runtime/` package.
- Move `McpConfHelper` (configPresenter/mcpConfHelper.ts) into the package;
  decouple `@/eventbus`/`@/events` (emitConfigChanged) behind an injected
  change-callback (same pattern AcpConfHelper used).
- Move `mcprouterManager.ts` (already electron-free — pure fetch).
- Desktop re-export shims; daemon `DaemonMcpConfig` (JSON StoreFactory) wired into
  `DaemonConfigPresenter` (addMcpServer/removeMcpServer/updateMcpServer/
  setServerEnabled/getMcpEnabled/setMcpEnabled/npm-registry methods).
- Activate the config/CRUD + mcprouter + npm-registry `mcp.*` routes in
  `daemonDispatcher.ts` (remove `mcp.` from TIER2 rejection for these; runtime
  routes stay rejected until Slice B).

### Slice B — Runtime half (next)
- Move `serverManager.ts`, `mcpClient.ts`, `toolManager.ts` behind host ports
  (RuntimeHelper → RuntimePort; `app.getPath/getVersion` → paths; `eventBus` →
  events; `@/presenter` singleton → injected ports; plugin policy → port).
- Keep the runtime routes on the daemon and finish any remaining host-port
  decoupling in the shared package.
- In-memory servers: desktop-only for v1 (they drag knowledge/session presenters).

### Out of scope (v1)
- In-memory MCP servers on the daemon.
- Plugin tool-policy enforcement on the daemon (no plugin runtime).
- MCP router beyond the pure fetch API.
- Additional daemon-side capability beyond the current runtime/config routes.

## Acceptance Criteria (Slice A)
- `mcp.getServers/addServer/updateServer/removeServer/setServerEnabled/setEnabled/
  isServerInstalled/getMcpRouterApiKey/setMcpRouterApiKey/listMcpRouterServers/
  installMcpRouterServer/updateMcpRouterServersAuth/getNpmRegistryStatus/
  setCustomNpmRegistry/setAutoDetectNpmRegistry/clearNpmRegistryCache` work on the
  daemon, persisted to `<configDir>/mcp_servers.json`.
- Daemon tests cover clients, tool definitions, prompts, resources, and sampling
  acknowledgements through `daemonDispatcher`.
- Desktop MCP unchanged (shims; existing MCP tests green).
- No `electron`/`@/` imports inside `packages/mcp-runtime/src/`.
- `typecheck:node`, daemon `tsc`, architecture guard, oxlint, MCP tests green.

## Constraints
- Same port-injection discipline as ACP (`AcpHostPorts` precedent).
- `McpConfHelper` keeps its `StoreLike`/`StoreFactory` seam.
- Runtime routes stay TIER2-rejected until Slice B lands.
