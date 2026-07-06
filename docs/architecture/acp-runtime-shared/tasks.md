# ACP Runtime Shared — Tasks

Phases map to `plan.md` §Phasing. Check off as work lands; each phase is a
review slice. Run `pnpm run typecheck && pnpm run lint && pnpm run format`
plus relevant `pnpm test` at every phase boundary.

## Phase 1 — Scaffolding & Host Ports ✅

### T1.1 Create `packages/acp-runtime` package
- [x] Add `packages/acp-runtime/package.json` (`@argos/acp-runtime`, type module,
      exports `./src`, deps: `@argos/backend-core`, `@argos/shared`,
      `@argos/shared-contracts`; devDep `typescript`)
- [x] Add `packages/acp-runtime/tsconfig.json` (mirror backend-core paths)
- [x] Add `src/index.ts` barrel (`export * from "./host/ports"`)
- [x] Register via `pnpm-workspace.yaml` (already globs `packages/*`) +
      `pnpm install`
- [x] Wired into `apps/desktop` tsconfig.node.json + package.json (paths + dep)

### T1.2 Define host ports
- [x] `src/host/ports.ts`: `HostPathsPort`, `RuntimePort`, `LifecyclePort`,
      `McpRuntimePort`, `AcpEventPort` (alias of backend-core `WindowEventPort`),
      `AcpHostPorts`

### T1.3 Validation
- [x] Desktop `typecheck:node` green
- [x] `architecture-guard.mjs` passes
- [x] Daemon tsconfig paths + package.json dep wired (daemon has a pre-existing
      `baseUrl` TS6 deprecation error unrelated to this work)
- [ ] Architecture guard: add a rule forbidding `electron`/`@/eventbus`/`@/routes`
      imports inside `packages/acp-runtime/src/` (deferred until first code move)

## Phase 2 — Move Pure Modules (zero-Electron) ✅

### T2.1 Protocol & state helpers
- [x] Move `acpContentMapper.ts`, `acpMessageFormatter.ts`, `acpConfigState.ts`,
      `mcpConfigConverter.ts`, `mcpTransportFilter.ts`, `acpCapabilities.ts`,
      `types.ts` into `packages/acp-runtime/src/protocol`
- [x] Desktop re-export shims left at original `acp/` paths
- [x] `acpContentMapper`'s `@shared/chat` + `@shared/types/core/llm-events`
      imports resolve in the package (cleanup guard does not scan `packages/`)

### T2.2 Config/session helpers (portable)
- [x] Move `AcpDebugLog.ts`, `AcpPathGuard.ts` into `src/config`
- [x] Move `AcpPromptController.ts` into `src/session`
- [x] Desktop re-export shims at original `acpClientPresenter/*` paths
- [x] Package `src/index.ts` barrel re-exports all moved modules

### T2.3 Validation
- [x] Desktop `typecheck:node` green
- [x] ACP tests green (acpContentMapper 13, acpConfHelper 3, acpMessageFormatter 4)
- [x] oxlint clean on package + shims (0/0); `oxfmt` applied
- [x] Confirmed `backgroundModelSync` + `ModelProviderSettings` lint/test failures
      are pre-existing uncommitted work, unrelated to this phase

> Deferred from this phase: `acpConfHelper.ts`, `acpRegistryMigrationService.ts`
> config-side moves (depend on `acpConfHelper`'s `StoreLike`/`StoreFactory` wiring
> re-evaluation — moved to Phase 3 with the registry services).

## Phase 3 — Abstract & Move Electron-Coupled Modules

### T3.1 shellEnv (pure Node, relocate) ✅
- [x] Moved `apps/desktop/src/main/lib/agentRuntime/shellEnvHelper.ts` →
      `packages/backend-core/src/runtime/shellEnv.ts` (pure Node; shared with
      non-ACP code, so backend-core is the correct home, not acp-runtime)
- [x] Re-exported from `backend-core/runtime/index.ts`; desktop shim at original
      path re-exports from `@argos/backend-core/runtime/shellEnv`
- [x] Desktop `typecheck:node` green (8 exports preserved: getPathEntriesFromEnv,
      mergePathEntries, setPathEntriesOnEnv, mergeCommandEnvironment, getUserShell,
      resolveShellBootstrapEnv, getShellEnvironment, clearShellEnvironmentCache)

### T3.2 Process / fs / terminal managers — move as a CLUSTER ✅
> Moved together with `ports` threaded through constructors (they are
> constructor-interlinked: `AcpProcessManager` builds `AcpFsHandler` +
> `AcpTerminalManager`).

- [x] Added `AcpFsHelpers` port (`shouldRejectAcpTextRead`, `buildBinaryReadGuidance`)
      to `AcpHostPorts` (binaryReadGuard → filePresenter/mime is NOT movable)
- [x] Expanded `RuntimePort` (`initializeRuntimes`, `expandPath`, `resolveCommand`,
      `buildSpawnEnv`) + `AcpEventPort` (`broadcast`/`broadcastToAll`/`publish`)
- [x] Moved `acpFsHandler.ts`, `acpTerminalManager.ts`, `acpProcessManager.ts` →
      `src/process/`; replaced every `app.*`/`RuntimeHelper`/`eventBus`/
      `publishArgosEvent` site with port calls; `node-pty` lazy-loaded
- [x] Desktop adapter `acp/desktopPorts.ts` (`createDesktopAcpPorts`) bridges to
      Electron `app`/`RuntimeHelper`/`eventBus`/`binaryReadGuard`
- [x] Threaded ports: `AcpProvider → AcpClientPresenter → AcpConnectionManager →
      AcpProcessManager`; `AcpSessionRuntime → AcpSessionManager(lifecycle)`
- [x] Desktop `typecheck:node` green; ACP tests green

### T3.3 Session & persistence ✅
- [x] Moved `acpSessionManager.ts`, `acpSessionPersistence.ts` → `src/session`
- [x] `app.on("before-quit")` → `ports.lifecycle.onBeforeQuit`
- [x] `app.getPath("home")` → injected `homeDir()`; `llmProviderPresenter/index.ts`
      wires `() => app.getPath("home")`

### T3.4 Registry / launch / conf services ✅ (acpInitHelper deferred)
- [x] Moved `acpLaunchSpecService.ts`, `acpRegistryMigrationService.ts` → `src/config`
      (zero Electron deps)
- [x] Moved `acpConfHelper.ts` → `src/config`; decoupled from desktop `McpConfHelper`
      via structural `AcpMcpConfigLike` interface (configPresenter unchanged —
      its `McpConfHelper` structurally satisfies it)
- [x] Moved `acpRegistryService.ts` → `src/config`; injected `userDataDir`/`appPath`/
      `sanitizeSvg`; `net.fetch` → global `fetch` (configPresenter construction
      updated to pass the new required fields)
- [x] `acpInitHelper.ts` **DEFERRED** as desktop-only: interactive PTY bootstrap of
      built-in agents streaming to a `WebContents` — genuinely desktop UX, not
      needed for daemon agent execution (registry install path covers the daemon)
- [x] Tests updated: `acpTestPorts` helper + retargeted `shellEnv` mock + fetch
      routing; all 124 ACP tests green

### T3.5 Runtime factory ✅
- [x] `createAcpRuntime({ provider, configPresenter, sessionPersistence, ports })`
      in `src/runtime.ts` composing process + session + prompt controllers
      (consumed by the daemon adapter in Phase 7)

## Phase 4 — Desktop Adapter

### T4.1 Desktop host ports
- [ ] Implement `desktopPorts` (`apps/desktop/src/main/presenter/llmProviderPresenter/acp/desktopPorts.ts`)
      backed by `app`, `RuntimeHelper`, `eventBus`, `publishArgosEvent`
- [ ] Unit-test the port adapters (tmp paths, event bridging)

### T4.2 Thin `AcpProvider`
- [ ] Rewrite `providers/acpProvider.ts` to delegate to `createAcpRuntime`
- [ ] Preserve `coreStream`, permissions, summaries, debug, agent-refresh APIs
- [ ] `providerInstanceManager.ts` construction unchanged
- [ ] Full desktop ACP test suite (`acpProvider.test.ts` etc.) green

## Phase 5 — Routes & ConfigClient ✅

### T5.1 Route contracts
- [x] Added Zod schemas (`AcpAgentInstallStateSchema`, `AcpRegistryAgentSchema`,
      `AcpManualAgentSchema`) to `domainSchemas.ts` (loose objects, matching style)
- [x] Added 12 typed routes in `config.routes.ts`: `setAcpEnabled`,
      `listAcpRegistryAgents`, `refreshAcpRegistry`, `setAcpAgentEnabled`,
      `setAcpAgentEnvOverride`, `ensureAcpAgentInstalled`, `repairAcpAgent`,
      `uninstallAcpRegistryAgent`, `listManualAcpAgents`, `addManualAcpAgent`,
      `updateManualAcpAgent`, `removeManualAcpAgent`
- [x] Registered in `ARGOS_ROUTE_CATALOG` (300 entries, drift-guard OK)

### T5.2 Dispatcher handlers (BOTH hosts)
- [x] Shared handler `packages/backend-core/.../configRouteHandler.ts` (daemon)
- [x] Desktop handler `apps/desktop/src/main/routes/config/configRouteHandler.ts`
      (added the same 12 cases so the typed client works on desktop too)

### T5.3 ConfigClient wrappers
- [x] 12 typed methods on `apps/desktop/src/renderer/api/ConfigClient.ts` +
      exported from the client surface

## Phase 6 — Daemon Config Surface ✅
- [x] `apps/daemon/src/host/jsonStoreFactory.ts`: JSON-file-backed `StoreFactory`
- [x] `apps/daemon/src/host/daemonAcpConfig.ts`: facade owning `AcpConfHelper` +
      `AcpRegistryService` + `AcpLaunchSpecService` (AcpConfHelper as state source)
- [x] `DaemonConfigPresenter` delegates all ACP methods to `DaemonAcpConfig`;
      constructor takes `(configDir, dataDir)`
- [x] `svgSanitizer` moved to `packages/backend-core` (shared by desktop + daemon)
- [x] Daemon `typecheck` green; daemon tests green

## Phase 7 — Daemon ACP Execution ✅
- [x] `apps/daemon/src/host/acpPorts.ts`: `createDaemonAcpPorts` (OS paths, identity
      runtime, IEventPublisher bridge, SIGINT/SIGTERM lifecycle) + SQLite stub
- [x] `packages/acp-runtime/src/runtime.ts`: `createAcpRuntime` +
      `runPromptTurn` async generator (yields `session/update` notifications)
- [x] `apps/daemon/src/host/acp-provider-execution.ts`: `AcpProviderExecutionPort`
      drives the runtime and streams notifications via the event publisher
- [x] `apps/daemon/src/index.ts`: provider-id routing (`acp` → ACP port, else HTTP)
- [x] Daemon `typecheck` green
- [x] **v1 caveat:** ephemeral sessions (no SQLite ACP persistence), `$PATH`-resolved
      runtimes (no bundled runtime), tool permissions auto-cancel. Stream-event
      contract (`chat.stream`) is a minimal v1 wiring for attached clients.

## Phase 8 — Renderer Migration ✅
- [x] `AcpSettings.tsx`: replaced `useLegacyPresenter` with `createConfigClient`;
      all 14 method calls → typed `configClient.*`
- [x] Replaced `window.electron.ipcRenderer.on(AGENTS_CHANGED)` with
      `window.argos.on("config.agents.changed")` (works on IPC + WS transports)
- [x] No `@api/legacy` / `window.electron` references remain in the page
- [x] Resolves the original symptom (`window.electron.ipcRenderer is not available`)
- [x] `typecheck:web` clean for AcpSettings/ConfigClient (only pre-existing
      `ModelProviderSettings*.tsx` CRLF errors remain, unrelated)

## Phase 9 — Cleanup ✅
- [x] Architecture guard passes; route-catalog drift-guard OK (300 entries)
- [x] oxlint 0/0 on `packages/acp-runtime` + `apps/daemon/src`
- [x] `oxfmt` applied across all touched files
- [x] **124 ACP tests + 9 daemon tests green**
- [ ] (Optional, deferred) Remove desktop re-export shims once all in-process
      callers import `@argos/acp-runtime` directly (shims are harmless in the
      meantime and keep the desktop build stable)
- [ ] (Optional) Update `AGENTS.md` package table to list `@argos/acp-runtime`
