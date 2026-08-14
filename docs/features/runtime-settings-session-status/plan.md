# Plan: runtime resilience, settings redesigns, and session status

## Tasks

- [x] **T1: Bridge persistent probe + forceReconnect** (`packages/client-sdk/src/websocket-bridge.ts`)
  - `scheduleReconnect()` → `scheduleProbe()` after exhaustion (30s unbounded probe loop).
  - `forceReconnect()` cancels timers, resets attempts, opens a fresh socket.
  - `connect()` tears down any stale socket before installing a replacement so callbacks can't cross-talk.
- [x] **T2: Preload + HybridBridge retry plumbing** (`apps/desktop/src/preload/hybridBridge.ts`, `index.ts`)
  - `retryConnection()` / `setRetryHandler()`; keep bridge on connect failure; don't null on `unhealthy`;
    expose `connection.retryConnection` on `window.argos`.
- [x] **T3: Renderer recovery** (`packages/ui/src/components/DaemonConnectionBanner.tsx`,
  `packages/ui/api/runtime.ts`, `packages/ui/src/lib/storeInitializer.ts`, `_main.tsx`, `ChatTabView.tsx`)
  - Banner shows for no-URL case + Retry button; `retryRuntimeConnection()` helper;
    `retryHydrateStores()` on reconnect; placeholder instead of broken shell.
- [x] **T4: Remote channels redesign** (`packages/ui/settings/components/remote/*`,
  `RemoteSettings.tsx`)
  - Card overview with brand colors (`channelMeta.ts`), status dots, CSS microinteractions
    (`remote-channels.css`).
- [x] **T5: ACP real update** (`config.routes.ts`, `configPresenter/index.ts`,
  `configRouteHandler.ts`, `legacy.presenters.d.ts`, `ConfigClient.ts`)
  - `config.updateAcpAgent`: binary → reinstall into new version dir; npx/uvx → no-op.
  - Update button on agent row + registry dialog; toast copy.
- [x] **T6: ACP settings UX fixes** (`AcpSettings.tsx`, `AcpDiagnostics.tsx`, `AgentMcpSelector.tsx`)
  - Auto-expand custom agents; MCP count matches visible list; "Not verified yet" + auto health check.
- [x] **T7: Session status lifecycle** (`acp-provider-execution.ts`, `pi-provider-execution.ts`,
  `bun-session-repository.ts`, `daemonDispatcher.ts`, `WindowSideBarSessionItem.tsx`)
  - Emit `done`/`error` on completion (active session → `idle`); `markSessionViewed` on activate
    (done → idle + `viewed` event); sidebar spinner for working, blue dot for unseen.

## BEFORE/AFTER layout blocks

### Remote Channels (`/settings/remote`)

```
BEFORE                                   AFTER
┌──────────────────────────────┐         ┌──────────────────────────────┐
│ Remote Channels              │         │ Remote Channels              │
│ [Telegram][QQ][Discord][WeChat] tabs   │ ┌────────┐ ┌────────┐        │
│  (flat, no status)           │         │ │Telegram│ │QQ Bot  │        │
│                              │         │ │● icon  │ │● icon  │        │
│                              │         │ │Enabled │ │Not conf│        │
│                              │         │ └────────┘ └────────┘        │
│                              │         │ ┌────────┐ ┌────────┐        │
│                              │         │ │Discord │ │WeChat  │        │
│                              │         │ └────────┘ └────────┘        │
│                              │         │ Configure <channel> panel    │
└──────────────────────────────┘         └──────────────────────────────┘
```

### Session list (sidebar)

```
BEFORE                          AFTER
┌─────────────────────┐         ┌─────────────────────┐
│ Chat A              │         │ Chat A        ⟳     │  (working spinner)
│ Chat B              │         │ Chat B        ●     │  (blue new-results dot)
│ Chat C              │         │ Chat C              │
└─────────────────────┘         └─────────────────────┘
```
