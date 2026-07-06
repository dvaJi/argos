# MCP Runtime Shared — Tasks

## Slice A — Config half ✅

- [x] Created `packages/mcp-runtime/` (package.json, tsconfig, barrel)
- [x] Moved `McpConfHelper` → `src/config/`; decoupled `@/eventbus`/`@/events`
      behind an injected `onChange` callback (same pattern as `AcpConfHelper`)
- [x] Moved `mcprouterManager.ts` (already electron-free — pure fetch)
- [x] Desktop re-export shims; `configPresenter` passes `onChange` → eventBus
- [x] `apps/daemon/src/host/daemonMcpConfig.ts`: facade over shared helpers
      (JSON `StoreFactory`); `DaemonConfigPresenter` delegates all MCP methods
- [x] Activated 19 `mcp.*` config routes in `daemonDispatcher.ts`
      (CRUD, enabled, isServerInstalled, mcprouter API key/list/install/auth,
      npm-registry status/set/custom/auto/clear/refresh)
- [x] `typecheck:node` + daemon `tsc` green; architecture guard passes
- [x] 46 MCP tests + daemon tests green; oxlint 0/0; formatted

## Slice B — Runtime half ✅

- [x] Defined `McpHostPorts` (paths, runtime, events w/ subscribe, proxy, services)
      in `packages/mcp-runtime/src/host/ports.ts`
- [x] Moved `mcpClient.ts` (1255 lines) → `src/runtime/`: `app.getPath/getVersion`
      → `ports.paths`; `RuntimeHelper` (8 methods) → `ports.runtime`; `eventBus` →
      `ports.events`; `presenter.*` (sampling/LLM/models) → `ports.services`;
      `getInMemoryServer` → `ports.services.getInMemoryServer?` (graceful fail);
      `terminateProcessTree` moved to `@argos/backend-core`
- [x] Moved `serverManager.ts` → `src/runtime/`: eventBus/proxyConfig/axios → ports
- [x] Moved `toolManager.ts` (885 lines) → `src/runtime/`: eventBus.on/off →
      `ports.events.subscribe`; `presenter.agentSessionPresenter` → `ports.services.getSession`;
      `getPluginToolPolicy` → `ports.services.getPluginToolPolicy?`; ACP gating stays
      via injected `configPresenter`
- [x] Desktop adapter `desktopMcpPorts.ts` wires full services (presenter singleton,
      RuntimeHelper, eventBus, proxyConfig, plugin policy, in-memory servers)
- [x] Desktop `McpPresenter` constructs ServerManager/ToolManager with ports
- [x] Daemon `daemonMcpPorts.ts` (OS paths, identity runtime, eventPublisher bridge,
      minimal service stubs) + `DaemonMcpRuntime` facade
- [x] Activated ALL `mcp.*` runtime routes on daemon: startServer/stopServer/
      isServerRunning/listToolDefinitions/callTool/listPrompts/getPrompt/
      listResources/readResource (+ getClients real); sampling rejected (v1)
- [x] All MCP tests retargeted (test ports, package mock paths); **46 MCP tests green**
- [x] Daemon tests green; `typecheck` clean; architecture guard passes; oxlint 0/0
- [x] In-memory MCP servers stay desktop-only (graceful "not supported" on daemon)
