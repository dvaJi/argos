# ACP Runtime Shared — Plan

Reference: `spec.md` in this folder. Read the exploration map in
`docs/architecture/acp-runtime-shared/` discussion (source: agent exploration
`ses_0d7697d46ffe8nZcnM5VBHX9X2`) for the file-by-file coupling inventory.

## Strategy

Extract the ACP runtime into a new **`packages/acp-runtime/`** package that
depends only on `@argos/shared`, `@argos/shared-contracts`,
`@argos/backend-core`, and Bun-compatible npm libs. Each host (desktop, daemon)
constructs the runtime, injecting host concerns through a single
`AcpHostPorts` seam. Desktop keeps a thin `AcpProvider extends BaseLLMProvider`
adapter; the daemon gains an `AcpProviderExecutionPort implements
ProviderExecutionPort` adapter.

## Target Package Layout (`packages/acp-runtime/`)

```
packages/acp-runtime/
  package.json            # @argos/acp-runtime, deps: shared, shared-contracts, backend-core,
                          #   cross-spawn, @agentclientprotocol/sdk, nanoid, fflate
  tsconfig.json
  src/
    index.ts              # public barrel
    host/
      ports.ts            # AcpHostPorts (HostPathsPort, RuntimePort, EventPort,
                          #   LifecyclePort, McpRuntimePort) + AcpRuntime factory
    process/
      acpProcessManager.ts
      acpFsHandler.ts
      acpTerminalManager.ts   # node-pty lazy-loaded
      acpCapabilities.ts
      shellEnv.ts             # moved from desktop lib/agentRuntime/shellEnvHelper (pure Node)
    session/
      acpSessionManager.ts
      acpSessionPersistence.ts
      acpPromptController.ts
    protocol/
      acpContentMapper.ts
      acpMessageFormatter.ts
      acpConfigState.ts
      mcpConfigConverter.ts
      mcpTransportFilter.ts
      acpEventMapper.ts
      types.ts
    config/
      acpConfHelper.ts        # persistent store (StoreLike/StoreFactory from backend-core)
      acpRegistryService.ts   # global fetch instead of electron net.fetch
      acpLaunchSpecService.ts # fflate unzip + fetch (portable)
      acpInitHelper.ts        # WebContents output -> EventPort stream (optional)
      acpRegistryMigrationService.ts
      acpPathGuard.ts
      acpDebugLog.ts
```

## Host-Port Abstraction (`src/host/ports.ts`)

The runtime never imports `electron`, `@/eventbus`, `@/routes`, or
`@/lib/runtimeHelper`. Instead:

```ts
export interface HostPathsPort {
  tempDir(): string;        // replaces app.getPath("temp")
  homeDir(): string;        // replaces app.getPath("home")
  userDataDir(): string;    // replaces app.getPath("userData")
  appVersion(): string;     // replaces app.getVersion()
  appPath?(): string;       // replaces app.getAppPath() (desktop only)
}

export interface RuntimePort {
  // Replaces RuntimeHelper.replaceWithRuntimeCommand / prependBundledRuntimeToEnv
  resolveCommand(cmd: string): string;                 // bundled bin on desktop, identity on daemon
  buildSpawnEnv(base: Record<string,string>): Record<string,string>; // prepend runtime PATH (desktop) / identity (daemon)
}

export interface EventPort {
  // Replaces eventBus.send/sendToRenderer + publishArgosEvent
  publish<T extends ArgosEventName>(name: T, payload: ArgosEventPayload<T>): void;
}

export interface LifecyclePort {
  onBeforeQuit(cb: () => void): void;   // desktop: app.on("before-quit"); daemon: SIGINT/SIGTERM
}

export interface AcpHostPorts {
  paths: HostPathsPort;
  runtime: RuntimePort;
  events: EventPort;
  lifecycle: LifecyclePort;
  mcp?: ProviderMcpRuntimePort;   // existing port (npm/uv registry)
}
```

Concrete substitutions (from the exploration map):

| Current coupling | Site | Replacement |
|---|---|---|
| `app.getPath("temp")` | `acpProcessManager.ts:322,327`, `acpTerminalManager.ts:46,52` | `ports.paths.tempDir()` |
| `app.getVersion()` | `acpProcessManager.ts:831` | `ports.paths.appVersion()` |
| `app.getPath("home")` | `acpSessionPersistence.ts:290` | `ports.paths.homeDir()` |
| `app.getPath("userData")` | `acpRegistryService.ts:210`, `acpInitHelper.ts:87` | `ports.paths.userDataDir()` |
| `app.getAppPath()` | `acpRegistryService.ts:430` | `ports.paths.appPath?.()` (desktop) / skip on daemon |
| `app.on("before-quit")` | `acpSessionManager.ts:88` | `ports.lifecycle.onBeforeQuit()` |
| `net.fetch` | `acpRegistryService.ts:507` | global `fetch` |
| `eventBus.send/sendToRenderer` | `acpProvider.ts:227,245,571`, `acpProcessManager.ts:1676,1687`, `configPresenter` | `ports.events.publish()` |
| `publishArgosEvent` | `acpProvider.ts:1378,1398`, `acpProcessManager.ts:1693` | `ports.events.publish()` |
| `RuntimeHelper` | `acpProcessManager.ts:201,1186,1196,1198,1202,1252`, `acpInitHelper.ts:77` | `ports.runtime` |

## Public Runtime Factory

```ts
export interface AcpRuntime {
  processManager: AcpProcessManager;
  sessionManager: AcpSessionManager;
  promptController: AcpPromptController;
  // ...read-only handles consumed by host adapters
}

export function createAcpRuntime(deps: {
  ports: AcpHostPorts;
  configPresenter: IConfigPresenter;
  sessionPersistence: AcpSessionPersistence; // constructed over a SQLite port
  provider: LLM_PROVIDER;
}): AcpRuntime;
```

## Host Adapters

### Desktop (`apps/desktop/src/main/presenter/llmProviderPresenter/providers/acpProvider.ts`)

- `AcpProvider extends BaseLLMProvider` becomes a thin adapter: constructs
  `createAcpRuntime({ ports: desktopPorts, ... })` and delegates `coreStream`,
  permissions, summaries, debug, agent refresh to it.
- `desktopPorts`:
  - `paths`: backed by Electron `app` (existing behavior).
  - `runtime`: backed by `RuntimeHelper` (existing behavior).
  - `events`: bridges to `eventBus`/`publishArgosEvent` (existing behavior).
  - `lifecycle`: `app.on("before-quit")`.
  - `mcp`: injected `ProviderMcpRuntimePort`.
- `providerInstanceManager.ts:281` still constructs `AcpProvider` by id `"acp"`;
  no change to the wiring boundary.
- Re-export shims left at old paths (`acp/index.ts`) so in-process callers and
  tests compile until fully migrated.

### Daemon (`apps/daemon/src/host/acp-provider-execution.ts` — new)

- `AcpProviderExecutionPort implements ProviderExecutionPort`:
  - Holds a lazily-initialized `AcpRuntime` per active ACP session.
  - `sendMessage`: resolves the session's agent, runs a prompt turn via
    `promptController`, translates `SessionNotification` updates into daemon
    events via `ports.events.publish` (the daemon `IEventPublisher` → WS).
  - `cancelGeneration`: cancels the active turn.
  - `steerActiveTurn` / `respondToolInteraction`: delegate to the runtime's
    permission/tool-interaction paths (replacing the current
    "not yet implemented" throws).
  - `testConnection`: spawns+initializes the agent process and returns
    success/failure.
- `daemonPorts`:
  - `paths`: OS tmpdir/homedir + daemon `--data-dir`.
  - `runtime`: identity resolver + PATH passthrough (no bundled runtime in v1).
  - `events`: daemon `IEventPublisher`.
  - `lifecycle`: `process.on("SIGINT"/"SIGTERM")`.
  - `mcp`: `undefined` in v1 (daemon has no MCP runtime yet; registry env
    passthrough skipped).
- Wired at `apps/daemon/src/index.ts:125` alongside `BunProviderExecutionPort`;
  dispatch chooses ACP vs HTTP based on the session's provider id (`"acp"`).

### Daemon config (`apps/daemon/src/host/daemonConfigPresenter.ts`)

- Compose the shared `AcpConfHelper` (portable; uses `StoreLike`/`StoreFactory`)
  to back the full ACP config surface.
- Implement the missing methods (currently absent/empty):
  `setAcpEnabled`, `listAcpRegistryAgents`, `refreshAcpRegistry`,
  `getAcpAgentState`, `setAcpAgentEnabled`, `setAcpAgentEnvOverride`,
  `ensureAcpAgentInstalled`, `repairAcpAgent`, `uninstallAcpRegistryAgent`,
  `getAcpAgentInstallStatus`, `listManualAcpAgents`, `addManualAcpAgent`,
  `updateManualAcpAgent`, `removeManualAcpAgent`, `resolveAcpLaunchSpec`.
- Registry root resolves to `path.join(dataDir, "acp-registry")`.

## Routes & Renderer

### New typed routes (`packages/shared-contracts/src/routes/config.routes.ts`)

Add Zod-validated routes for the full ACP config surface (input/output schemas)
and register them in `ARGOS_ROUTE_CATALOG`. Because the daemon dispatcher
delegates all `config.*` to the shared handler
(`packages/backend-core/src/dispatch/config/configRouteHandler.ts`), adding
handlers there makes them available to **both** hosts automatically.

New route names (prefix `config.acp.*` / `config.`):
`config.setAcpEnabled`, `config.listAcpRegistryAgents`,
`config.refreshAcpRegistry`, `config.ensureAcpAgentInstalled`,
`config.repairAcpAgent`, `config.uninstallAcpRegistryAgent`,
`config.setAcpAgentEnabled`, `config.setAcpAgentEnvOverride`,
`config.getAcpAgentState`, `config.listManualAcpAgents`,
`config.addManualAcpAgent`, `config.updateManualAcpAgent`,
`config.removeManualAcpAgent`.

### `ConfigClient` (`apps/desktop/src/renderer/api/ConfigClient.ts`)

- Add typed wrappers for each new route.
- Migrate `AcpSettings.tsx` (and any settings-surface callers) from
  `useLegacyPresenter("configPresenter")` to `configClient.*`.
- Remove the `window.electron.ipcRenderer.on(CONFIG_EVENTS.AGENTS_CHANGED)`
  subscription at `AcpSettings.tsx:232`; replace with a bridge event
  subscription (`bridge.on`) so it works on both transports.

## Data Flow

```
Renderer ──bridge.invoke(config.*)──▶ shared config dispatcher ──▶ IConfigPresenter
                                          (desktop | daemon)            │
                                                                        ▼
                                            AcpConfHelper / Registry / LaunchSpec

Renderer ──bridge.invoke(chat.*)──▶ daemon dispatcher ──▶ AcpProviderExecutionPort
                                                          │ createAcpRuntime(ports)
                                                          ▼
                                              AcpProcessManager ──stdio──▶ agent subprocess
                                                          │
                                              SessionNotification
                                                          ▼
                                              ports.events.publish ──WS──▶ Renderer
```

## Compatibility & Migration

- Desktop public APIs (`IConfigPresenter` ACP methods, `AcpProvider` surface)
  stay signature-stable.
- Old desktop import paths keep re-exporting from `@argos/acp-runtime` until
  all in-process callers are updated; shims removed in the final phase.
- `scripts/architecture-guard.mjs`: allowlist `@argos/acp-runtime` import edges
  from `apps/desktop/src/main` and `apps/daemon/src`; forbid `electron`/`@/`
  imports inside `packages/acp-runtime/`.

## Test Strategy

- **Move** the existing desktop ACP tests to mirror the new package
  (`packages/acp-runtime/test/` or `apps/desktop/test/...` importing the
  package) so the same behavior is asserted against the shared code.
- **Host-port fakes**: tests inject in-memory `AcpHostPorts` (tmp dirs,
  no-op event publisher, fake lifecycle) — no Electron in the test harness.
- **New daemon tests**: `apps/daemon/test/` for `AcpProviderExecutionPort`
  (spawn a mock agent over stdio) and the extended `DaemonConfigPresenter`
  ACP methods.
- **Route tests**: extend shared config-dispatcher tests for the new ACP routes.
- Gates: `pnpm run typecheck`, `pnpm run lint`, `pnpm run format`, `pnpm test`
  (main + renderer) all green before each phase merges.

## Phasing (maps to `tasks.md`)

1. **Scaffold** `packages/acp-runtime`, host ports, package wiring, guard
   updates (no behavior change).
2. **Move pure modules** (zero-Electron: mappers, state, capabilities, conf
   helper, path guard, debug log).
3. **Abstract & move** Electron-coupled modules (process/session/registry/
   launch/init) behind ports; leave desktop re-export shims.
4. **Desktop adapter** rewrite (`AcpProvider` thin wrapper); keep tests green.
5. **Routes** — new `config.*` ACP routes + `ConfigClient` wrappers + shared
   dispatcher handlers.
6. **Daemon config** — extend `DaemonConfigPresenter` with full ACP surface.
7. **Daemon execution** — `AcpProviderExecutionPort` + wiring + event bridging.
8. **Renderer** — migrate `AcpSettings.tsx` off legacy transport.
9. **Cleanup** — remove shims, finalize guard edges, full lint/type/test pass.
