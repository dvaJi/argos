# Headless Backend Kernel — Tasks

## Milestone 1: Monorepo Foundation

### T1.1 Initialize Turborepo workspace

- [ ] Add `turbo.json` with build/typecheck/lint/test pipelines
- [ ] Update `pnpm-workspace.yaml` with `packages: ['apps/*', 'packages/*']`
- [ ] Update root `package.json` with workspace scripts
- [ ] Verify existing desktop build still works

### T1.2 Move desktop to `apps/desktop/`

- [ ] Move `src/`, `build/`, `resources/`, `electron.vite.config.ts`, `electron-builder.yml` into `apps/desktop/`
- [ ] Update all path references in build configs
- [ ] Update CI workflows to new paths
- [ ] Verify `pnpm run dev` and `pnpm run build` still work

### T1.3 Extract `packages/shared-contracts/`

- [ ] Move `src/shared/contracts/` → `packages/shared-contracts/src/`
- [ ] Create `package.json` with `zod` dependency
- [ ] Update all import paths in desktop to use workspace reference
- [ ] Verify typecheck passes
- [ ] Run `pnpm run format && pnpm run lint && pnpm run typecheck`

## Milestone 2: Backend Core Package

### T2.1 Define host abstraction interfaces

- [ ] Create `packages/backend-core/src/host/` with interfaces: `IPathResolver`, `ICredentialStore`, `IConfigStore`, `IDatabaseProvider`, `ISubprocessRunner`, `IEventPublisher`
- [ ] Export all interfaces from barrel file
- [ ] Write unit tests for interface contracts

### T2.2 Create platform-agnostic event bus

- [ ] Extract event bus from `src/main/eventbus.ts`
- [ ] Remove `IWindowPresenter` / `webContents` dependencies
- [ ] Implement `SubscriberEventBus` using Node `EventEmitter`
- [ ] Support `publish()` / `subscribe()` pattern for WS fanout
- [ ] Write unit tests

### T2.3 Extract route dispatch engine

- [ ] Move `dispatchDeepchatRoute()` from `routes/index.ts` into `packages/backend-core/src/dispatch/`
- [ ] Make `MainKernelRouteRuntime` an interface implemented by both Electron presenter and daemon host
- [ ] Extract sub-dispatchers (config, provider, model) as-is
- [ ] Write unit tests with mock runtime

### T2.4 Extract service layer

- [ ] Move `SessionService`, `ChatService`, `ProviderService` into `packages/backend-core/`
- [ ] Move `hotPathPorts.ts` interfaces alongside services
- [ ] Verify services have zero Electron imports
- [ ] Write unit tests (services already well-tested via ports)

### T2.5 Extract presenter core logic

- [ ] Extract `agentSessionPresenter` core → `packages/backend-core/src/session/`
- [ ] Extract `agentRuntimePresenter` core → `packages/backend-core/src/runtime/`
- [ ] Extract `llmProviderPresenter` core → `packages/backend-core/src/provider/`
- [ ] Extract `mcpPresenter` core → `packages/backend-core/src/mcp/`
- [ ] Extract `toolPresenter` core → `packages/backend-core/src/tools/`
- [ ] Extract `skillPresenter` core → `packages/backend-core/src/skills/`
- [ ] Extract `configPresenter` core (minus electron-store) → `packages/backend-core/src/config/`
- [ ] Extract `knowledgePresenter` core → `packages/backend-core/src/knowledge/`
- [ ] Extract `syncPresenter` core → `packages/backend-core/src/sync/`
- [ ] Extract `scheduledTasks` core → `packages/backend-core/src/scheduled/`
- [ ] Each extraction: inject host interfaces, remove Electron deps, verify typecheck

## Milestone 3: Electron Adapter Package

### T3.1 Create `packages/electron-adapter/`

- [ ] Implement `ElectronPathResolver` using `app.getPath()`
- [ ] Implement `ElectronConfigStore` using `electron-store`
- [ ] Implement `ElectronCredentialStore` using `safeStorage`
- [ ] Implement `ElectronDatabaseProvider` using `better-sqlite3-multiple-ciphers`
- [ ] Implement `ElectronSubprocessRunner` using `child_process` + `utilityProcess`
- [ ] Implement `ElectronEventPublisher` bridging to existing `EventBus`
- [ ] Wire all adapters in desktop main process
- [ ] Verify desktop works with extracted backend-core + electron-adapter

### T3.2 Desktop continues to work

- [ ] Desktop uses `packages/backend-core` + `packages/electron-adapter`
- [ ] All existing tests pass
- [ ] No behavior changes
- [ ] `pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test`

## Milestone 4: Client SDK

### T4.1 Create `packages/client-sdk/`

- [ ] Move `createBridge.ts` (IPC bridge) → `packages/client-sdk/src/ipc-bridge.ts`
- [ ] Create `packages/client-sdk/src/websocket-bridge.ts` implementing `DeepchatBridge` over WS
- [ ] Create `packages/client-sdk/src/http-client.ts` for HTTP invoke
- [ ] WebSocket bridge handles: connect, reconnect, subscribe, event dispatch
- [ ] Both bridges validate via Zod schemas from shared-contracts
- [ ] Write unit tests for WebSocketBridge with mock server

### T4.2 Update renderer to use client-sdk

- [ ] Replace `src/renderer/api/core.ts` with `@argos/client-sdk` import
- [ ] Renderer gets bridge from desktop main process (embedded) or settings (remote)
- [ ] Verify all existing renderer API calls work identically

## Milestone 5: Daemon Server

### T5.1 Create `apps/daemon/`

- [ ] Initialize Bun project with `package.json`
- [ ] Create entry point: `Bun.serve()` with HTTP + WebSocket upgrade
- [ ] Implement `/health` endpoint
- [ ] Implement auth middleware (token from env/CLI flag)
- [ ] Wire `packages/backend-core` dispatch engine to HTTP handler
- [ ] Wire event bus to WebSocket fanout

### T5.2 Implement Bun host adapters

- [ ] `BunPathResolver` — uses `~/.argos-daemon/` as data root, configurable via `--data-dir`
- [ ] `BunConfigStore` — uses JSON file or `bun:sqlite` config table
- [ ] `BunCredentialStore` — uses file-based encryption (env var or OS keychain via `security`/`cmdkey`)
- [ ] `BunDatabaseProvider` — uses `better-sqlite3` or `bun:sqlite`
- [ ] `BunSubprocessRunner` — uses `Bun.spawn()`
- [ ] `BunEventPublisher` — uses in-process subscriber map + WS fanout

### T5.3 Daemon lifecycle

- [ ] CLI flags: `--host`, `--port`, `--data-dir`, `--token`, `--log-level`
- [ ] Graceful shutdown (SIGINT/SIGTERM)
- [ ] Database initialization on first run
- [ ] Session restore on restart
- [ ] Error recovery and logging

### T5.4 Daemon executable

- [ ] `bun build --compile` produces standalone executable
- [ ] Test on Windows, macOS, Linux
- [ ] Verify all Tier 1 routes work via HTTP
- [ ] Verify event streaming works via WebSocket
- [ ] Integration test: create session, send message, receive stream, list sessions

## Milestone 6: Desktop Sidecar

### T6.1 Sidecar manager in Electron main

- [ ] Bundle daemon executable with desktop app
- [ ] Spawn daemon on app startup with auto-assigned port
- [ ] Health check loop (retry `/health` every 500ms, timeout 10s)
- [ ] Restart daemon on crash (max 3 retries, then show error)
- [ ] Pass `--data-dir` pointing at existing Electron userData path
- [ ] Clean shutdown: send SIGTERM on app quit, wait for exit

### T6.2 Renderer switches to WebSocket transport

- [ ] Desktop main process provides `ws://127.0.0.1:<port>` to renderer
- [ ] Renderer uses `WebSocketBridge` from client-sdk
- [ ] Tier 3 routes (window, browser, tab, dialog, upgrade) handled by Electron IPC fallback
- [ ] Hybrid transport: WS for daemon routes, IPC for desktop-only routes
- [ ] Verify all existing UI flows work

### T6.3 End-to-end validation

- [ ] All existing tests pass
- [ ] All E2E smoke tests pass
- [ ] Manual test: full chat flow, session management, MCP tools, config changes
- [ ] Performance: no regression in startup time or chat latency
- [ ] `pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test`

## Milestone 7: Remote Attach

### T7.1 Settings UI for remote daemon

- [ ] Add "Server" section in Settings
- [ ] Local/Remote toggle
- [ ] Remote: `serverUrl` input + auth token input + "Test Connection" button
- [ ] Connection test hits `/health` with auth header
- [ ] Store remote config securely

### T7.2 Remote connection logic

- [ ] When remote mode: renderer connects to `serverUrl` via WebSocket
- [ ] Auth token sent on WS connect + HTTP Authorization header
- [ ] Reconnect logic: exponential backoff, max 30s, show status in UI
- [ ] Connection state indicator in UI (connected/disconnected/reconnecting)
- [ ] Tailscale MagicDNS: no localhost-only assumptions in URL handling

### T7.3 Security

- [ ] Localhost connections: no auth required
- [ ] Remote connections: token auth required
- [ ] Token generated on daemon first run, printed to stdout
- [ ] Desktop shows token in settings for copy
- [ ] Rate limiting on auth failures
