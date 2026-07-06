# Headless Backend Kernel — Specification

## Goal

Extract the Argos backend runtime from the Electron main process into a standalone
headless daemon/server that can run persistently, support multiple client surfaces
(desktop, CLI, web, mobile, bots), and allow remote attach via Tailscale MagicDNS.

## Scope

### In Scope (v1)

- Monorepo restructuring with Turborepo
- Shared contracts package extraction
- Backend core package extraction (session, runtime, agent, persistence, provider, MCP, tools)
- Bun-based daemon: HTTP + WebSocket server, health endpoint, auth token, host/port config
- Desktop sidecar launcher: spawn local daemon, connect renderer over HTTP/WS
- Host abstraction layer (paths, secrets, config store, DB provider, subprocess)
- ~195 routes portable to daemon (Tier 1 + Tier 2)
- Tailscale-friendly URL handling (no localhost-only assumptions)

### Out of Scope (v1)

- Multi-tenancy (single-user per daemon)
- CLI / web / mobile clients (daemon + desktop first)
- Remote control channels (Telegram, Discord, Feishu, QQBot, Weixin) migration
- `node-pty` terminal features in daemon
- Electron auto-updater in daemon context
- TLS termination (daemon binds plain HTTP/WS; reverse proxy or Tailscale handles TLS)
- Plugin system migration to daemon

### Deferred

- Web/mobile client surfaces
- Multi-user auth
- Cloud sync via daemon
- Container/Docker packaging

## User Stories

### US-1: Embedded Sidecar

**As a** desktop user,
**I want** the app to launch a local headless server automatically,
**So that** the UI connects to the backend over HTTP/WebSocket without coupling to Electron IPC.

**Acceptance Criteria:**

- Desktop launches daemon executable at startup
- Daemon reports healthy via `/health` within 5 seconds
- Renderer connects via `ArgosBridge` over HTTP+WS (no IPC)
- All Tier 1 routes work identically to current IPC behavior
- Desktop can restart daemon on crash
- Desktop logs daemon stdout/stderr

### US-2: Remote Attach

**As a** desktop user with a remote daemon,
**I want** to configure the app to connect to a daemon at `http://mybox.tailnet.ts.net:port`,
**So that** I can use the same UI with a backend running on another machine.

**Acceptance Criteria:**

- Settings UI allows entering a `serverUrl` (host:port or MagicDNS hostname)
- Connection test validates health endpoint
- Auth token is stored securely
- Renderer switches to remote daemon transparently
- Reconnect logic handles temporary disconnections

### US-3: Standalone Daemon

**As a** developer,
**I want** to run the daemon as a standalone executable,
**So that** I can deploy it on a server without Electron.

**Acceptance Criteria:**

- `bun build --compile` produces a standalone executable
- CLI flags for `--host`, `--port`, `--data-dir`, `--token`
- `/health` endpoint returns status, version, uptime
- Session create/send message flow works via HTTP+WS without any Electron dependency
- Database persistence works with `better-sqlite3` (or Bun SQLite fallback)

### US-4: Transport Switch

**As a** developer,
**I want** to swap the `ArgosBridge` transport from IPC to WebSocket,
**So that** the renderer works with both embedded and remote daemons.

**Acceptance Criteria:**

- `WebSocketBridge` implements `ArgosBridge` interface
- `invoke()` maps to HTTP POST with Zod validation
- `on()` maps to WebSocket event subscription
- No renderer code changes when switching between IPC and WS transport
- Latency comparable to IPC for chat/send operations

## Non-Functional Requirements

- **Startup**: daemon health ready in <5s (warm), <10s (cold with DB init)
- **Latency**: HTTP route dispatch <50ms overhead vs IPC (excluding network)
- **Memory**: daemon <200MB baseline (no active sessions)
- **Compatibility**: Windows, macOS, Linux
- **Security**: auth token required for non-localhost connections; localhost-only mode by default
