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

### Daemon-Owned Backend Areas

| Area | Current desktop surface | Target owner | Notes |
|---|---|---|---|
| Session/chat/provider execution | `apps/desktop/src/main/presenter/llmProviderPresenter/` | `daemon` | Desktop should call daemon routes/transport, not own provider execution or fallback locally. |
| ACP runtime execution | `apps/desktop/src/main/presenter/llmProviderPresenter/providers/acpProvider.ts` | `daemon` | Desktop should keep only a thin adapter for transport, not a backend fallback. |
| MCP runtime execution | `apps/desktop/src/main/presenter/mcpPresenter/` | `daemon` | Local desktop presenter should shrink to transport/native glue if the backend is moved. |
| Skills runtime execution | `apps/desktop/src/main/presenter/skillPresenter/` | `daemon` | Discovery/config may remain desktop-facing; execution should be daemon-owned. |
| Memory runtime execution | `apps/desktop/src/main/presenter/memoryPresenter/` | `daemon` | Should be a backend service, not an Electron presenter. |
| Backend config and provider catalog | `apps/desktop/src/main/presenter/configPresenter/` | `daemon` | Desktop can keep UI-facing settings, but backend state should migrate. |
| ACP shared config/runtime | `packages/acp-runtime/` + desktop adapters | `daemon` | Shared runtime stays host-agnostic; execution should be daemon-hosted. |
| Bun cloud sync / S3 | `apps/daemon/src/host/bunS3CloudStorageService.ts` | `daemon` | Already daemon-local; should stay there. |

### Desktop-Owned Native Areas

| Area | Current desktop surface | Target owner | Notes |
|---|---|---|---|
| Window lifecycle | `apps/desktop/src/main/presenter/windowPresenter/` | `desktop` | Electron-only. |
| Dialogs / file pickers | `apps/desktop/src/main/presenter/dialogPresenter/`, `filePresenter/` | `desktop` | Native capability surface. |
| Clipboard / shell open / safeStorage | `apps/desktop/src/main/lib/`, `configPresenter` helpers | `desktop` | Keep local unless a clear daemon equivalent exists. |
| Sidecar supervision | new desktop daemon supervisor | `desktop` | Desktop owns starting/stopping the local daemon process. |
| Local runtime facade | preload/runtime bridge | `desktop` | Renderer should see explicit capability APIs. |

### Shared Areas

| Area | Current surface | Target owner | Notes |
|---|---|---|---|
| Route contracts | `packages/shared-contracts/src/routes/` | `shared` | Source of truth for renderer/backend calls. |
| Event contracts | `src/shared/contracts/events` and related packages | `shared` | Must remain host-agnostic. |
| ACP/MCP protocol helpers | `packages/acp-runtime/`, `packages/mcp-runtime/` | `shared` | Only host ports and pure helpers belong here. |
| Client SDK / bridge | `packages/client-sdk/` | `shared` | Desktop and browser/remote clients share transport semantics. |
| Backend core utilities | `packages/backend-core/` | `shared` | Keep Electron/Bun-free unless explicitly host-specific. |

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
