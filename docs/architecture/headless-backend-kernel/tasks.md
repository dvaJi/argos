# Headless Backend Kernel — Tasks

## Milestone 1: Monorepo Foundation

### T1.1 Initialize Turborepo workspace

- [x] Add `turbo.json` with build/typecheck/lint/test pipelines
- [x] Update `pnpm-workspace.yaml` with `packages: ['apps/*', 'packages/*']`
- [x] Update root `package.json` with workspace scripts (turbo installed as devDep)
- [x] Verify existing desktop build still works (typecheck + lint + format all green)

### T1.2 Move desktop to `apps/desktop/`

- [ ] Move `src/`, `build/`, `resources/`, `electron.vite.config.ts`, `electron-builder.yml` into `apps/desktop/`
- [ ] Update all path references in build configs
- [ ] Update CI workflows to new paths
- [ ] Verify `pnpm run dev` and `pnpm run build` still work

> **Status: DEFERRED** — Windows file permissions block `mv src/`. Desktop stays at root for now; all path aliases (`@shared/*`, `@/*`) continue to work. Will move on Linux/WSL or via git mv.

### T1.3 Extract `packages/shared-contracts/`

- [x] Move `src/shared/contracts/` → `packages/shared-contracts/src/` (copy + fix relative imports)
- [x] Create `package.json` with `zod` dependency
- [x] Create barrel `index.ts` re-exporting all contracts
- [x] Fix relative imports (`../../providerImport` → `../providerImport`, etc.)
- [x] Copy utility deps (`providerImport.ts`, `scheduledTasks.ts`, `guidedOnboarding.ts`) into package
- [x] Verify typecheck passes
- [x] Run `pnpm run format && pnpm run lint && pnpm run typecheck`

> **Note:** Desktop continues using `@shared/contracts` alias (→ `src/shared/contracts/`). Package exists for daemon use via `@argos/shared-contracts` workspace reference. Import switch deferred to avoid 72-file change risk.

## Milestone 2: Backend Core Package

### T2.1 Define host abstraction interfaces

- [x] Create `packages/backend-core/src/host/interfaces.ts` with: `IPathResolver`, `ICredentialStore`, `IConfigStore`, `IDatabaseProvider`, `ISubprocessRunner`, `IEventPublisher`, `HostDependencies`
- [x] Export all interfaces from barrel file (`src/index.ts`)
- [ ] Write unit tests for interface contracts

### T2.2 Create platform-agnostic event bus

- [x] Create `packages/backend-core/src/eventbus/subscriberEventBus.ts`
- [x] Implement `SubscriberEventBus` using Node `EventEmitter` (no `IWindowPresenter` / `webContents`)
- [x] Support `publish()` / `subscribe()` pattern for WS fanout
- [ ] Write unit tests

### T2.3 Extract route dispatch engine

- [x] Copy sub-dispatchers into `packages/backend-core/src/dispatch/`:
  - `dispatch/config/configRouteHandler.ts` + `configRouteSupport.ts`
  - `dispatch/providers/providerRouteHandler.ts` + `providerImportService.ts`
  - `dispatch/models/modelRouteHandler.ts`
  - `dispatch/sessions/sessionService.ts`
  - `dispatch/chat/chatService.ts`
  - `dispatch/onboarding/onboardingRouteSupport.ts`
  - `dispatch/settings/settingsHandler.ts` + `settingsAdapter.ts`
- [x] Fix cross-directory imports to use backend-core paths (`../../ports/hotPathPorts`, `../../scheduler/scheduler`)
- [x] Sub-dispatchers use `@shared/presenter` and `@shared/contracts/routes` via tsconfig paths (type-only, zero runtime Electron deps)
- [x] Extract `MainKernelRouteRuntime` as an interface (`DaemonRouteRuntime`, `Tier1RouteRuntime` in `dispatch/routeRuntime.ts`)
- [ ] Write unit tests with mock runtime

> **Note:** The full `dispatchDeepchatRoute()` (2600 lines) from `routes/index.ts` has NOT been moved yet. Only the extracted sub-dispatchers are in backend-core. The main dispatch switch statement remains in `src/main/routes/index.ts`.

### T2.4 Extract service layer

- [x] Move `SessionService` → `packages/backend-core/src/services/sessionService.ts`
- [x] Move `ChatService` → `packages/backend-core/src/services/chatService.ts`
- [x] Move `ProviderService` → `packages/backend-core/src/services/providerService.ts`
- [x] Move `Scheduler` → `packages/backend-core/src/scheduler/scheduler.ts`
- [x] Move port interfaces (`hotPathPorts.ts`) → `packages/backend-core/src/ports/hotPathPorts.ts`
- [x] Verify services have zero Electron imports (only `@shared/types`, port interfaces, scheduler)
- [ ] Write unit tests (services already well-tested via ports in `test/main/`)

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

> **Status: DEFERRED.** Instead of extracting all 10 presenter implementations, we extracted the **interfaces** they depend on (`IConfigPresenterPort`, `IProviderPresenterPort` in `dispatch/routeRuntime.ts`). The actual presenter implementations remain in `src/main/presenter/` and are wired via the electron-adapter. Full extraction can be done incrementally — the architecture supports it without blocking other milestones.

## Milestone 3: Electron Adapter Package

### T3.1 Create `packages/electron-adapter/`

- [x] Create package with `package.json` + `tsconfig.json` (resolves `@argos/backend-core`, `@shared/*`, `@/*` paths)
- [x] Implement `createElectronHotPathPorts()` — wires Electron presenters to backend-core port interfaces:
  - `IAgentSessionPresenter` → `SessionRepository`, `MessageRepository`, `ProviderExecutionPort`, `SessionPermissionPort`
  - `IConfigPresenter` → `ProviderCatalogPort`
  - `ILlmProviderPresenter` → `ProviderExecutionPort.testConnection`
  - `EventBus` → `WindowEventPort` (via `publishDeepchatEvent`)
- [x] Implement `ElectronPathResolver` using `app.getPath()`
- [x] Implement `ElectronConfigStore` (Map-based, electron-store compatible interface)
- [x] Implement `ElectronCredentialStore` using `safeStorage`
- [ ] Implement `ElectronDatabaseProvider` using `better-sqlite3-multiple-ciphers`
- [x] Implement `ElectronSubprocessRunner` using `child_process`
- [x] Implement `ElectronEventPublisher` bridging to existing `EventBus`
- [ ] Wire all adapters in desktop main process
- [ ] Verify desktop works with extracted backend-core + electron-adapter

### T3.2 Desktop continues to work

- [ ] Desktop uses `packages/backend-core` + `packages/electron-adapter`
- [ ] All existing tests pass
- [ ] No behavior changes
- [ ] `pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test`

> **Status: PARTIAL.** Package created with port wiring adapter. Full host interface implementations (paths, config, DB, secrets, subprocess) not yet implemented. Desktop still uses in-process presenters directly.

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

> **Status: NOT STARTED**

## Milestone 5: Daemon Server

### T5.1 Create `apps/daemon/`

- [x] Initialize Bun project with `package.json`
- [x] Create entry point: `Bun.serve()` with HTTP + WebSocket upgrade
- [x] Implement `/health` endpoint (returns status, version, uptime)
- [x] Implement auth middleware (token from env/CLI flag, Bearer token validation)
- [x] Implement HTTP route dispatch handler (validates against Zod contracts, pluggable `RouteDispatcher`)
- [x] Implement WebSocket event handler (subscribe to event topics)
- [x] Wire `packages/backend-core` dispatch engine to HTTP handler (config routes working)
- [x] Wire event bus to WebSocket fanout

### T5.2 Implement Bun host adapters

- [x] `BunPathResolver` — uses `~/.argos-daemon/` as data root, configurable via `--data-dir`
- [x] `BunConfigStore` — `DaemonConfigPresenter` JSON-file backed, implements `IConfigPresenter`
- [x] `BunCredentialStore` — uses file-based encryption (env var or OS keychain via `security`/`cmdkey`)
- [x] `BunDatabaseProvider` — uses `bun:sqlite`
- [x] `BunSubprocessRunner` — uses `Bun.spawn()` (via `ElectronSubprocessRunner` in electron-adapter)
- [x] `BunEventPublisher` — uses in-process subscriber map + WS fanout

### T5.3 Daemon lifecycle

- [x] CLI flags: `--host`, `--port`, `--data-dir`, `--token`, `--log-level`
- [x] Graceful shutdown (SIGINT/SIGTERM)
- [ ] Database initialization on first run
- [ ] Session restore on restart
- [ ] Error recovery and logging

### T5.4 Daemon executable

- [ ] `bun build --compile` produces standalone executable
- [ ] Test on Windows, macOS, Linux
- [ ] Verify all Tier 1 routes work via HTTP
- [ ] Verify event streaming works via WebSocket
- [ ] Integration test: create session, send message, receive stream, list sessions

> **Status: E2E CONFIG + ONBOARDING + SETTINGS + PROVIDER/MODEL ROUTES WORKING.** Daemon boots with full lifecycle: CLI flags parsing, graceful shutdown (SIGINT/SIGTERM), auto-generated auth tokens. Routes supported: all `config.*`, `onboarding.*`, `settings.*`, `tools.*`, provider CRUD (`providers.list`, `providers.setById`, `providers.update`, `providers.add`, `providers.remove`, `providers.reorder`, `providers.testConnection`), model config (`models.getProviderCatalog`, `models.getConfig`, `models.setConfig`, `models.resetConfig`, `models.getProviderConfigs`, `models.hasUserConfig`, `models.exportConfigs`, `models.importConfigs`, `models.addCustom`, `models.removeCustom`, `models.updateCustom`, `models.getCapabilities`). WebSocket event fanout works via `BunEventPublisher` with topic-based subscription. Host adapters: `BunPathResolver`, `DaemonConfigPresenter`, `BunCredentialStore`, `BunDatabaseProvider`, `BunEventPublisher` all implemented. Desktop-only routes (`window.*`, `browser.*`, `tab.*`, etc.) return descriptive errors. Tier 2 routes requiring full runtime (sessions, chat, mcp) return "coming soon" errors.

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

> **Status: NOT STARTED**

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

> **Status: NOT STARTED**
