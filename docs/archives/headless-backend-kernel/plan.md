# Headless Backend Kernel — Architecture Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  apps/desktop (Electron)                             │
│  ┌───────────┐  ┌──────────────────────────────┐    │
│  │  Renderer  │  │  Sidecar Manager             │    │
│  │  (React)   │  │  - spawn daemon process      │    │
│  │            │  │  - health check loop          │    │
│  │            │  │  - restart on crash           │    │
│  └─────┬──────┘  └──────────────────────────────┘    │
│        │                                            │
│        │  ArgosBridge (HTTP + WS transport)       │
│        │                                            │
└────────┼────────────────────────────────────────────┘
         │
         │  HTTP (routes) + WebSocket (events/stream)
         │
┌────────┼────────────────────────────────────────────┐
│  apps/daemon (Bun)                                   │
│  ┌─────┴──────┐  ┌──────────────────────────────┐   │
│  │  Transport  │  │  Backend Core                │   │
│  │  HTTP + WS  │  │  - Session orchestration     │   │
│  │  Auth       │  │  - Agent runtime             │   │
│  │  /health    │  │  - LLM provider              │   │
│  │             │  │  - MCP server mgmt           │   │
│  │             │  │  - Tool execution             │   │
│  │             │  │  - Persistence                │   │
│  └─────┬──────┘  └──────────┬───────────────────┘   │
│        │                     │                       │
│  ┌─────┴─────────────────────┴──────────────────┐   │
│  │  Host Abstraction Layer                       │   │
│  │  IPathResolver  ICredentialStore              │   │
│  │  IConfigStore   IDatabaseProvider             │   │
│  │  ISubprocessRunner  INotificationSink         │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Monorepo Layout

```
argos3/
├── apps/
│   ├── desktop/          # Current Electron app (moved from root)
│   │   ├── src/
│   │   │   ├── main/     # Electron main (sidecar launcher + window mgmt)
│   │   │   ├── preload/
│   │   │   ├── renderer/
│   │   │   └── shadcn/
│   │   ├── electron.vite.config.ts
│   │   ├── electron-builder.yml
│   │   └── package.json
│   │
│   └── daemon/           # Bun headless server
│       ├── src/
│       │   ├── index.ts           # Bun.serve() entry
│       │   ├── transport/
│       │   │   ├── http.ts        # HTTP route handler
│       │   │   ├── websocket.ts   # WebSocket event handler
│       │   │   └── auth.ts        # Token auth middleware
│       │   ├── host/
│       │   │   ├── bun-paths.ts   # IPathResolver for Bun
│       │   │   ├── bun-db.ts      # IDatabaseProvider for Bun
│       │   │   ├── bun-config.ts  # IConfigStore for Bun
│       │   │   └── bun-secrets.ts # ICredentialStore for Bun
│       │   └── lifecycle.ts       # Startup, shutdown, health
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── shared-contracts/  # Already transport-agnostic
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── events/
│   │   │   ├── common.ts
│   │   │   ├── bridge.ts
│   │   │   └── channels.ts
│   │   └── package.json
│   │
│   ├── backend-core/      # Extracted from src/main/presenter
│   │   ├── src/
│   │   │   ├── session/       # agentSessionPresenter core
│   │   │   ├── runtime/       # agentRuntimePresenter core
│   │   │   ├── provider/      # llmProviderPresenter core
│   │   │   ├── mcp/           # mcpPresenter core
│   │   │   ├── tools/         # toolPresenter core
│   │   │   ├── skills/        # skillPresenter core
│   │   │   ├── config/        # configPresenter core (sans electron-store)
│   │   │   ├── knowledge/     # knowledgePresenter core
│   │   │   ├── sync/          # syncPresenter core
│   │   │   ├── scheduled/     # scheduledTasks core
│   │   │   ├── plugins/       # pluginPresenter core
│   │   │   ├── host/          # IPathResolver, ICredentialStore, etc.
│   │   │   ├── dispatch/      # Route dispatch (extracted from routes/index.ts)
│   │   │   └── eventbus/      # Platform-agnostic event bus
│   │   └── package.json
│   │
│   ├── client-sdk/        # ArgosBridge transports
│   │   ├── src/
│   │   │   ├── ipc-bridge.ts      # Existing IPC transport (preload)
│   │   │   ├── websocket-bridge.ts # New WS transport
│   │   │   └── http-client.ts     # HTTP invoke helper
│   │   └── package.json
│   │
│   └── electron-adapter/  # Electron-specific implementations
│       ├── src/
│       │   ├── electron-paths.ts   # IPathResolver via app.getPath
│       │   ├── electron-config.ts  # IConfigStore via electron-store
│       │   ├── electron-secrets.ts # ICredentialStore via safeStorage
│       │   ├── electron-db.ts      # IDatabaseProvider via better-sqlite3
│       │   ├── electron-notify.ts  # INotificationSink via Electron notifications
│       │   └── sidecar-manager.ts  # Daemon process lifecycle
│       └── package.json
│
├── turbo.json
├── pnpm-workspace.yaml    # packages: ['apps/*', 'packages/*']
└── package.json           # Root workspace scripts
```

## Route Classification

### Tier 1: Fully Daemon-Portable (~90 routes)

config.\*, models.\*, chat.\*, onboarding.\*, scheduledTasks.\*, databaseSecurity.\*, tools.\*, mcp.\*

### Tier 2: Mostly Daemon-Portable (~105 routes, ~15 desktop-only exceptions)

sessions.\*, providers.\*, settings.\*, device.\*, project.\*, file.\*, workspace.\*, skills.\*, sync.\*, plugins.\*, startup.\*

Desktop-only actions within Tier 2 (call `shell.openPath`, native dialogs):

- `device.selectDirectory`, `device.restartApp`
- `project.openDirectory`, `project.selectDirectory`
- `file.saveImage`, `file.copyImage` (native save dialogs)
- `workspace.revealFileInFolder`, `workspace.openFile`
- `sync.openFolder`

Strategy: these routes return a "not available in headless mode" error or are handled by the desktop-side adapter.

### Tier 3: Desktop-Only (~30 routes)

window.\*, browser.\*, tab.\*, dialog.\*, upgrade.\*, system.openSettings, settings.listSystemFonts

These stay in the Electron main process. The daemon never handles them.

## Host Abstraction Interfaces

```typescript
interface IPathResolver {
  getDataDir(): string
  getConfigDir(): string
  getCacheDir(): string
  getTempDir(): string
  getDatabasePath(): string
  getLogsDir(): string
}

interface ICredentialStore {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

interface IConfigStore {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  delete(key: string): void
  onChanged(callback: (key: string, value: unknown) => void): () => void
}

interface IDatabaseProvider {
  open(path: string, encryptionKey?: string): Promise<DatabaseConnection>
  close(): Promise<void>
}

interface ISubprocessRunner {
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess
  exec(command: string): Promise<ExecResult>
}

interface IEventPublisher {
  publish(eventName: string, target: EventTarget, payload: unknown): void
  subscribe(eventName: string, handler: EventHandler): () => void
}
```

## Transport Protocol

### HTTP Routes

- `POST /api/v1/route` — dispatch any route from the catalog
- Body: `{ route: "sessions.list", input: { ... } }`
- Response: `{ ok: true, output: { ... } }` or `{ ok: false, error: { code, message } }`
- Auth: `Authorization: Bearer <token>` (required for non-localhost)

### WebSocket Events

- Connect: `ws://host:port/api/v1/events?token=<token>`
- Client → Server: `{ type: "subscribe", events: ["chat.stream.*", "session.*"] }`
- Server → Client: `{ type: "event", name: "chat.stream.updated", payload: { ... } }`
- Server → Client: `{ type: "event", name: "session.created", payload: { ... } }`

### Health

- `GET /health` → `{ status: "ok", version: "1.0.6-beta.2", uptime: 12345 }`

## Database Strategy

### v1: `better-sqlite3` on Bun

- Bun supports native Node addons via `node:` prefix
- Use `better-sqlite3` (standard, no custom cipher) for daemon
- Encryption via SQLCipher can be added later via `better-sqlite3-multiple-ciphers` or file-level encryption
- Desktop continues using `better-sqlite3-multiple-ciphers` as before

### Fallback: Bun built-in `bun:sqlite`

- If native addon issues arise with `bun build --compile`, fall back to `bun:sqlite`
- Same synchronous API, no encryption support
- Acceptable for v1 single-user local daemon

## Event Flow

```
Current (Electron IPC):
  Presenter → EventBus.sendToRenderer() → ipcMain → webContents.send() → preload → ArgosBridge.on()

Daemon (WebSocket):
  Core Logic → IEventPublisher.publish() → WS fanout → WebSocketBridge.on()

Desktop Sidecar (both):
  Core Logic → IEventPublisher.publish() → WS fanout → WebSocketBridge.on()

Desktop Legacy (transition):
  Core Logic → IEventPublisher.publish() → EventBus adapter → ipcMain → webContents.send()
```

## Key Coupling Points and Mitigations

### `webContentsId` in session/context

- `RouteContext` carries `webContentsId` and `windowId`
- Replace with abstract `clientId` in daemon routes
- Desktop adapter maps `webContentsId` → `clientId`

### `EventBus` window-centric dispatch

- `sendToRenderer()`, `sendToWindow()`, `sendToWebContents()` all assume BrowserWindow
- New `SubscriberEventBus` uses topic-based pub/sub
- Electron adapter bridges to old EventBus during transition

### `Presenter` God-object (1071 lines, 30+ fields)

- Decompose into individual presenter modules in `packages/backend-core/`
- Each receives host interfaces via constructor injection
- `dispatchArgosRoute` receives a runtime interface, not the Presenter class

### `dispatchArgosRoute` monolith (2600 lines)

- Extract into `packages/backend-core/src/dispatch/`
- Sub-dispatchers already exist for config, provider, model — extend the pattern
- Route handler functions are pure: validate input → call service → validate output

### `better-sqlite3-multiple-ciphers` (native C++ addon)

- Risk: may not work with `bun build --compile`
- Mitigation: try `better-sqlite3` first on Bun, fall back to `bun:sqlite`
- Desktop keeps `better-sqlite3-multiple-ciphers` via electron-adapter

### `electron-store` for config

- Replace with `IConfigStore` interface
- Daemon uses JSON file or SQLite-backed config
- Desktop continues using electron-store via adapter

### `safeStorage` for encryption keys

- Replace with `ICredentialStore` interface
- Daemon uses file-based encryption (env var or OS keychain)
- Desktop continues using safeStorage via adapter

### `RemoteConversationRunner` creates BrowserWindow

- Must stay in desktop-only code
- Remote control channels (Telegram/Discord/Feishu/QQBot/Weixin) deferred to post-v1

## Migration Phases

### Phase 1: Monorepo + Contracts

- Add Turborepo, restructure into `apps/` + `packages/`
- Extract `src/shared/contracts/` → `packages/shared-contracts`
- Build system still works for desktop

### Phase 2: Backend Core Extraction

- Create `packages/backend-core/`
- Extract presenter core logic behind host interfaces
- Extract route dispatch from `routes/index.ts`
- Both Electron adapter and daemon adapter can host the core

### Phase 3: Client SDK

- Create `packages/client-sdk/`
- Implement `WebSocketBridge` for `ArgosBridge`
- Keep `IpcBridge` for backward compat during transition

### Phase 4: Daemon Server

- Create `apps/daemon/`
- `Bun.serve()` with HTTP + WebSocket
- Wire backend-core with Bun host implementations
- Health, auth, config

### Phase 5: Desktop Sidecar

- Desktop launches daemon at startup
- Renderer switches to `WebSocketBridge`
- Electron main process handles only Tier 3 routes
- Gradual removal of in-process backend

### Phase 6: Remote Attach

- Settings UI for `serverUrl` + auth token
- Connection test, reconnect logic
- Tailscale MagicDNS hostname support
