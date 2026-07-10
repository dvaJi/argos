# Desktop as Daemon Client — Ownership Register

This register is the working map for the migration. It classifies code by host
ownership and records the first pass at where each area should live after the
desktop/daemon split. The target shape is a thin desktop shell over a
daemon-owned backend.

## Ownership Legend

- `daemon`: should execute in `apps/daemon`
- `desktop`: should stay in Electron main / preload / local native APIs
- `shared`: host-agnostic packages or contracts
- `hybrid`: desktop keeps a thin adapter while the daemon owns execution

## Current Host Boundaries

### Desktop

- Electron app bootstrap and window lifecycle
- preload and renderer bridge setup
- local capability facades
- native dialogs, clipboard, shell open, safeStorage, tray/menu/window APIs
- local sidecar process supervision once daemon is launched
- desktop-only presenters that only exist to glue local UI to local native APIs
- thin-client availability state and daemon connection status

### Daemon

- Bun-based HTTP/WebSocket transport
- backend route dispatch
- ACP runtime execution
- MCP runtime execution
- skills runtime execution
- memory runtime execution
- provider/session persistence and backend config
- Bun-native storage, file, process, and web server APIs

### Shared

- route contracts and Zod schemas
- event contracts
- pure mapping / formatting utilities
- host port interfaces
- transport interfaces and typed clients

## Initial Inventory

### Route Handler Snapshot

The canonical per-route list lives in `packages/shared-contracts/src/routes.ts`.
The handler surfaces below describe where each route family currently resolves:

| Route family | Current desktop handler | Current daemon handler | Target owner | Host dependencies |
|---|---|---|---|---|
| Session/chat/provider execution | `apps/desktop/src/main/routes/index.ts`, `apps/desktop/src/main/presenter/agentSessionPresenter/`, `apps/desktop/src/main/presenter/llmProviderPresenter/` | `apps/daemon/src/dispatch/daemonDispatcher.ts`, `apps/daemon/src/host/bun-session-repository.ts`, `apps/daemon/src/host/acp-provider-execution.ts`, `apps/daemon/src/host/bun-provider-execution.ts` | `daemon` | Desktop: Electron/Node IPC. Daemon: Bun, SQLite, fetch. | Daemon now also carries the compatibility `sessions.resumePendingQueue` route. |
| ACP runtime execution | `apps/desktop/src/main/presenter/llmProviderPresenter/providers/acpProvider.ts` | `apps/daemon/src/host/acp-provider-execution.ts` | `daemon` | Desktop: Electron/Node transport glue. Daemon: Bun, SQLite, process spawning, protocol runtime. Desktop now delegates to `createAcpRuntime` and the local `acpClientPresenter` adapter tree has been removed. Daemon ACP persistence now creates/deletes conversations for remote-session sync, and daemon steering / legacy model selection now uses the ACP runtime instead of a local stub. |
| MCP runtime execution | `apps/desktop/src/main/presenter/mcpPresenter/` | `apps/daemon/src/dispatch/daemonDispatcher.ts` and daemon MCP host code | `daemon` | Desktop: Electron-native dialogs and connection state. Daemon: Bun, filesystem, network. | Daemon now serves `tools.listDefinitions` from the MCP runtime instead of returning an empty list. |
| Skills runtime execution | `apps/desktop/src/main/presenter/skillPresenter/` | `apps/daemon/src/dispatch/daemonDispatcher.ts` and daemon skill host code | `daemon` | Desktop: Electron file picker/native shell. Daemon: Bun, filesystem, zip/url installs, persisted per-session active skill state. |
| Memory runtime execution | `apps/desktop/src/main/presenter/memoryPresenter/` | `apps/daemon/src/dispatch/daemonDispatcher.ts` and daemon memory host code | `daemon` | Desktop: Electron-only UI shell. Daemon: Bun, SQLite, persistence. |
| Backend config and provider catalog | `apps/desktop/src/main/presenter/configPresenter/`, `apps/desktop/src/main/routes/providers/`, `apps/desktop/src/main/routes/models/` | `apps/daemon/src/dispatch/daemonDispatcher.ts`, `apps/daemon/src/host/daemonConfigPresenter.ts` | `daemon` | Desktop: Electron settings UI. Daemon: Bun, persistence, provider config state, and provider-model refresh/catalog storage. Daemon config now returns a valid Argos agent config object instead of a null placeholder, and the daemon MCP ports now preserve custom provider models. |
| Scheduled tasks firing | `apps/desktop/src/main/presenter/scheduledTasks/`, `apps/desktop/src/main/routes/index.ts` | `apps/daemon/src/dispatch/daemonDispatcher.ts`, `apps/daemon/src/host/daemonScheduledTasks.ts` | `daemon` | Desktop: shell/UI presentation for the settings screen. Daemon: persisted scheduling, background firing, and auto-send task execution. The daemon now owns the scheduler loop and explicit headless adapters. |
| Provider import scan/apply | `packages/backend-core/src/services/providerImportService.ts` | `packages/backend-core/src/services/providerImportService.ts`, `apps/daemon/src/dispatch/daemonDispatcher.ts` | `daemon` | Desktop: Electron import dialog shell. Daemon: shared Node-safe provider import service backed by config state and filesystem access. |
| Model audio transcription | `apps/desktop/src/main/routes/models/modelRouteHandler.ts`, `apps/desktop/src/main/presenter/llmProviderPresenter/index.ts` | `apps/daemon/src/dispatch/daemonDispatcher.ts`, `apps/daemon/src/host/bun-provider-execution.ts` | `daemon` | Desktop: transport glue only. Daemon: provider runtime can now transcribe audio through the configured provider endpoint instead of throwing. |
| Built-in knowledge MCP server | `apps/desktop/src/main/presenter/mcpPresenter/inMemoryServers/builtinKnowledgeServer.ts` | `packages/backend-core/src/knowledge/builtinKnowledgeServer.ts`, desktop builder injection | `hybrid` | Shared server now accepts injected knowledge/config ports instead of reaching into the desktop presenter singleton. Daemon can adopt the same boundary when a daemon knowledge port is available. |
| Auto-prompt MCP server | `apps/desktop/src/main/presenter/mcpPresenter/inMemoryServers/autoPromptingServer.ts` | `packages/mcp-runtime/src/inMemory/autoPromptingServer.ts`, desktop builder injection | `hybrid` | Shared server now accepts injected custom-prompt ports instead of reading desktop presenter state directly. |
| Deep-research MCP server | `apps/desktop/src/main/presenter/mcpPresenter/inMemoryServers/deepResearchServer.ts` | `packages/mcp-runtime/src/inMemory/deepResearchServer.ts`, desktop builder injection | `hybrid` | Shared server now accepts injected locale/config ports instead of reading desktop presenter state directly. |
| Conversation-search MCP server | `apps/desktop/src/main/presenter/mcpPresenter/inMemoryServers/conversationSearchServer.ts` | `packages/mcp-runtime/src/inMemory/conversationSearchServer.ts`, desktop builder injection | `hybrid` | Shared server now accepts injected data-access ports instead of reading the desktop presenter singleton directly. |
| Built-in in-memory search/knowledge servers | `apps/desktop/src/main/presenter/mcpPresenter/inMemoryServers/{artifactsServer.ts,bochaSearchServer.ts,braveSearchServer.ts,difyKnowledgeServer.ts,ragflowKnowledgeServer.ts,fastGptKnowledgeServer.ts}` | `packages/mcp-runtime/src/inMemory/{artifactsServer.ts,bochaSearchServer.ts,braveSearchServer.ts,difyKnowledgeServer.ts,ragflowKnowledgeServer.ts,fastGptKnowledgeServer.ts}`, daemon MCP host ports | `shared` | These servers are now owned by the shared MCP runtime and instantiated by both desktop and daemon host ports. |
| Settings activity history | `apps/desktop/src/main/presenter/sqlitePresenter/tables/settingsActivity.ts`, `apps/desktop/src/main/routes/index.ts` | `apps/daemon/src/dispatch/daemonDispatcher.ts`, daemon SQLite DB | `daemon` | Desktop: Electron settings UI. Daemon: Bun, SQLite, persisted activity history. The daemon now serves `settings.activity.list` from its own database instead of the desktop presenter table. |
| Native shell / process supervision | `apps/desktop/src/main/presenter/lifecyclePresenter/`, `apps/desktop/src/main/presenter/windowPresenter/` | none | `desktop` | Electron, IPC, process lifecycle, shell APIs. |

### Daemon-Owned Backend Areas

| Area | Current desktop surface | Target owner | Host dependencies | Notes |
|---|---|---|---|---|
| Session/chat/provider execution | `apps/desktop/src/main/presenter/llmProviderPresenter/` | `daemon` | Desktop: Electron/Node transport glue. Daemon: Bun, SQLite, fetch. | Desktop should call daemon routes/transport, not own provider execution or fallback locally. Session read helpers, compaction/export/transfer helpers, ACP process warmup/config lookup, analytics read routes, and compatibility queue-resume handling now route through the daemon bridge in production. |
| ACP runtime execution | `apps/desktop/src/main/presenter/llmProviderPresenter/providers/acpProvider.ts` | `daemon` | Desktop: Electron/Node transport glue. Daemon: Bun, SQLite, process spawning, protocol runtime. | Desktop should keep only a thin adapter for transport, not a backend fallback. |
| MCP runtime execution | `apps/desktop/src/main/presenter/mcpPresenter/` | `daemon` | Desktop: Electron-native dialogs and connection state. Daemon: Bun, filesystem, network. | Local desktop presenter should shrink to transport/native glue if the backend is moved. Daemon tool-definition listing now uses the runtime rather than a placeholder response, and daemon sampling routes are acknowledged without desktop UI state. |
| Plugin host / tool policy | `apps/desktop/src/main/presenter/pluginPresenter/` | `daemon` | Desktop: Electron-native settings shell and window chrome. Daemon: Bun, filesystem, persisted plugin state, MCP tool policy lookup. | Plugin activation, tool policy decisions, and headless route dispatch now live in the daemon. |
| Skills runtime execution | `apps/desktop/src/main/presenter/skillPresenter/` | `daemon` | Desktop: Electron file picker/native shell. Daemon: Bun, filesystem, zip/url installs, persisted per-session active skill state. | Discovery/config may remain desktop-facing; execution should be daemon-owned. |
| Memory runtime execution | `apps/desktop/src/main/presenter/memoryPresenter/` | `daemon` | Desktop: Electron-only UI shell. Daemon: Bun, SQLite, persistence. | Should be a backend service, not an Electron presenter. Daemon add/status/search behavior now has a headless regression. |
| Backend config and provider catalog | `apps/desktop/src/main/presenter/configPresenter/` | `daemon` | Desktop: Electron settings UI. Daemon: Bun, persistence, provider config state. | Desktop can keep UI-facing settings, but backend state should migrate. |
| Scheduled tasks firing | `apps/desktop/src/main/presenter/scheduledTasks/` | `daemon` | Desktop: settings UI and shell-only controls. Daemon: persistent schedule state plus background firing and headless auto-send execution. |
| ACP shared config/runtime | `packages/acp-runtime/` + desktop adapters | `daemon` | Shared runtime stays host-agnostic. Daemon: Bun, SQLite, process spawning. Desktop: transport/native glue only. | Execution should be daemon-hosted. |
| Bun cloud sync / S3 | `apps/daemon/src/host/bunS3CloudStorageService.ts` | `daemon` | Daemon: Bun, filesystem, S3. | Already daemon-local; should stay there. |

### Desktop-Owned Native Areas

| Area | Current desktop surface | Target owner | Notes |
|---|---|---|---|
| Window lifecycle | `apps/desktop/src/main/presenter/windowPresenter/` | `desktop` | Electron-only. |
| Dialogs / file pickers | `apps/desktop/src/main/presenter/dialogPresenter/`, `filePresenter/` | `desktop` | Native capability surface. |
| Clipboard / shell open / safeStorage | `apps/desktop/src/main/lib/`, `configPresenter` helpers | `desktop` | Keep local unless a clear daemon equivalent exists. |
| Sidecar supervision | new desktop daemon supervisor | `desktop` | Desktop owns starting/stopping the local daemon process. |
| Local runtime facade | preload/runtime bridge | `desktop` | Renderer should see explicit capability APIs. |

### Native-Only Desktop Presenters

These presenters should remain explicit desktop-owned surfaces and should not
silently grow backend fallback behavior:

- `apps/desktop/src/main/presenter/windowPresenter/`
- `apps/desktop/src/main/presenter/dialogPresenter/`
- `apps/desktop/src/main/presenter/filePresenter/`
- `apps/desktop/src/main/presenter/lifecyclePresenter/`
- `apps/desktop/src/main/lib/`

They are the Electron-native capability layer, not the daemon execution layer.

### Shared Areas

| Area | Current surface | Target owner | Notes |
|---|---|---|---|
| Route contracts | `packages/shared-contracts/src/routes/` | `shared` | Source of truth for renderer/backend calls. |
| Event contracts | `src/shared/contracts/events` and related packages | `shared` | Must remain host-agnostic. |
| ACP/MCP protocol helpers | `packages/acp-runtime/`, `packages/mcp-runtime/` | `shared` | Only host ports and pure helpers belong here. |
| Client SDK / bridge | `packages/client-sdk/` | `shared` | Desktop and browser/remote clients share transport semantics. |
| Backend core utilities | `packages/backend-core/` | `shared` | Keep Electron/Bun-free unless explicitly host-specific. |

### Current Route Groups

The register tracks ownership by family because the route catalog is the source
of truth and currently spans 300 routes. The active desktop and daemon handler
surfaces are:

- `apps/desktop/src/main/routes/index.ts`
- `apps/desktop/src/main/routes/providers/providerRouteHandler.ts`
- `apps/desktop/src/main/routes/models/modelRouteHandler.ts`
- `apps/daemon/src/dispatch/daemonDispatcher.ts`
- `apps/daemon/src/host/*`

## Bun / Electron Boundary Check

### Bun-specific desktop risk surfaces

These should not appear in `apps/desktop`:

- `Bun.*`
- `bun:*` imports
- Bun-native SQLite or file/process APIs that only work in Bun

### Electron-specific daemon risk surfaces

These should not appear in `apps/daemon`:

- `electron`
- `window.electron`
- `BrowserWindow`
- `ipcMain` / `ipcRenderer`
- direct preload-only runtime helpers

## Migration Slices

### Slice 1: Transport and supervisor boundary

- Desktop starts and monitors the daemon.
- Renderer calls daemon-owned routes through bridge/client APIs.
- Desktop-owned native actions stay on local APIs.
- Desktop does not keep a hidden fallback execution path for daemon-owned work.

Why first:

- Lowest behavior risk.
- Proves the desktop can run as a client before backend execution moves.

### Slice 2: Session / provider execution

- Move provider/session execution fully behind daemon routes.
- Keep desktop in control of connection state and transport choice.
- Keep desktop as a shell/client, not as a second backend host.

Why second:

- This is the core backend ownership change.
- It de-risks later ACP/MCP/skills migration.

### Slice 3: ACP / MCP / skills / memory

- Move each runtime family behind daemon-owned handlers and clients.
- Remove desktop presenter execution once parity is proven.

### Slice 4: Backend config and catalog

- Keep UI-facing settings in desktop if needed.
- Move authoritative backend config state into daemon-owned services.

## Exit Criteria For The Register

- Every route and runtime family has a target owner.
- Every Bun-dependent backend path has a daemon home.
- Every desktop-owned native path has an explicit local API home.
- The first migration slice is identified and ready for implementation.
