# Remote Control Daemon Port — Implementation Plan

> **SCOPE REVISION (discovered at Slice 2):** The conversation runner's bot-reply
> model needs the desktop's event-driven agent-loop runtime (`getActiveGeneration`
> + streaming + tool interactions). The daemon's Argos execution is a basic
> single-shot non-streaming fetch with none of that. So **this port now ships the
> config surface only** (settings/pairing/status/bindings — what the settings page
> needs, no agent runtime required). The bot→agent→reply flow is **deferred until
> the daemon gains an agent-loop runtime** (a separate, larger effort). The
> `packages/remote-control-runtime/` package (Slice 1, done) stays in place,
> ready for that day. Sections below that reference `getActiveGeneration` /
> conversation-runner wiring describe the eventual full state, not this slice.

## Approach

Extract the Electron-free core of the desktop `RemoteControlPresenter` into a
new shared package `packages/remote-control-runtime/`, add a daemon host module
(`DaemonRemoteControlRuntime`) + `remote.*` route contracts, and reduce the
desktop presenter to a thin proxy. The bot runtimes (pollers/gateways) move to
the daemon; the desktop keeps only native-UX shims (WeChat login window, `/open`
command) layered on daemon state.

### Target architecture

```
┌─────────────────────┐         remote.* routes         ┌──────────────────────────┐
│  Renderer (web/desktop) │ ─────────────────────────── │  Daemon                  │
│  RemoteSettings.tsx    │                              │  DaemonRemoteControlRuntime
│  RemoteControlRuntime  │  window.argos.invoke ──►     │   └─ RemoteControlRuntime (shared pkg)
│   (typed client)       │                              │        ├─ ChannelManager
│                        │  ◄── events (WS)             │        ├─ 5 channel adapters
└─────────────────────┘                              │        ├─ RemoteBindingStore (configPresenter)
                                                        │        └─ RemoteConversationRunner
                                                        │             ├─ sessionRepository (in-proc)
                                                        │             └─ providerExecutionPort (in-proc)
                                                        └──────────────────────────┘

Desktop extra (native UX only):
  RemoteControlPresenter (proxy) → remote.* routes
  + WeChat login BrowserWindow (calls remote.startWeixinIlinkLogin, renders QR)
  + /open command (resolves daemon session → focuses desktop chat window)
```

## Affected Interfaces / Data Flow

### New shared package: `packages/remote-control-runtime/`

Contents (moved from `apps/desktop/src/main/presenter/remoteControlPresenter/`,
Electron imports removed):

| Source (desktop) | Target (package) | Change |
|---|---|---|
| `channelManager.ts` | `src/channelManager.ts` | none |
| `channelAdapter.ts` | `src/channelAdapter.ts` | `net.fetch` → `globalThis.fetch` |
| `types.ts`, `types/channel.ts` | `src/types.ts` etc. | none (zod only) |
| `services/remoteBindingStore.ts` | `src/bindingStore.ts` | takes a `ConfigPort` ({getSetting,setSetting}) |
| `services/remoteConversationRunner.ts` | `src/conversationRunner.ts` | `app.getPath` → `DataDirPort`; drop `open()`/`resolveChatWindow()` (desktop-only override) |
| `services/remote*Router.ts`, `*AuthGuard.ts`, `remoteBlockRenderer.ts`, `remoteInteraction.ts` | `src/services/*` | none |
| `telegram/*`, `discord/*`(client+parser), `qqbot/*`(client+parser), `weixinIlink/*`, `adapters/**` | `src/channels/<channel>/*` | `undici` WebSocket → Bun/global `WebSocket` |
| `feishu/*` | `src/channels/feishu/*` | verify `@larksuiteoapi/node-sdk` on Bun (risk) |

The package exports a `RemoteControlRuntime` façade (the current `index.ts`
class minus Electron: no `BrowserWindow`, no `openWeixinIlinkLoginWindow`).
WeChat login becomes: `startWeixinIlinkLogin` returns `{ sessionKey, loginUrl }`;
the host/client renders the QR; `waitForWeixinIlinkLogin` resolves server-side.

### Ports the runtime depends on (injected, no Electron)

```ts
interface RemoteControlRuntimePorts {
  configPort: { getSetting<T>(key: string): Promise<T | null>; setSetting(key: string, value: unknown): Promise<void> };
  dataDir: string;                                       // replaces app.getPath("userData")
  sessionPort: AgentSessionPort;                         // createDetachedSession, getSession, getMessages, getMessage, sendMessage, setSessionModel, respondToolInteraction, getSearchResults?
  generationPort: { getActiveGeneration(sessionId): { eventId; runId } | null; cancelGenerationByEventId(sessionId, eventId): boolean };
  filePort?: { prepareFile(path, mediaType): Promise<unknown> };  // optional, null in daemon v1
  now?: () => number;
}
```

The **conversation runner** is the only consumer of session/generation ports.
In the daemon, a small adapter wraps `sessionRepository` + `providerExecutionPort`
to present `AgentSessionPort`. **`getActiveGeneration` must be added** to the
daemon's provider execution port (it tracks running generations internally).

### New daemon accessor: `getActiveGeneration`

Add to `DaemonProviderExecutionPort` / `BunProviderExecutionPort` /
`AcpProviderExecutionPort`:

```ts
getActiveGeneration(sessionId: string): { eventId: string; runId: string } | null;
```

The provider execution ports already track in-flight generations (for
`sendMessage`/`cancelGeneration`); this exposes the read accessor the
conversation runner polls.

### Config: add `remoteControl` key

`packages/shared-contracts/src/routes/config.routes.ts`:
- Add `"remoteControl"` to `CONFIG_ENTRY_KEYS`.
- Add `remoteControl: zod.unknown()` to `ConfigEntryValuesSchema` (permissive —
  the runtime owns its own nested validation via `normalizeRemoteControlConfig`).

This is a **schema migration** for existing daemon DBs: the config-entries
validator now accepts the key. No data migration (desktop already wrote it when
it owned the store; for fresh daemon DBs the key is absent → defaults).

### Route contracts: `packages/shared-contracts/src/routes/remote.routes.ts`

A new route file mirroring the ~50-method `IRemoteControlPresenter` surface.
Group into coarse-grained routes (not 1:1 per method) to keep the catalog tidy:

| Route | Input | Output | Covers |
|---|---|---|---|
| `remote.listChannels` | `{}` | `{ channels: RemoteChannelDescriptor[] }` | listRemoteChannels |
| `remote.getChannelSettings` | `{ channel }` | `{ settings }` | getChannelSettings + getTelegramSettings etc. |
| `remote.saveChannelSettings` | `{ channel, settings }` | `{ settings }` | saveChannelSettings + saveTelegramSettings etc. |
| `remote.getChannelStatus` | `{ channel }` | `{ status }` | getChannelStatus + getTelegramStatus etc. |
| `remote.getChannelBindings` | `{ channel }` | `{ bindings }` | getChannelBindings + getTelegramBindings |
| `remote.removeChannelBinding` | `{ channel, endpointKey }` | `{}` | removeChannelBinding + removeTelegramBinding |
| `remote.removeChannelPrincipal` | `{ channel, principalId }` | `{}` | removeChannelPrincipal |
| `remote.getChannelPairing` | `{ channel }` | `{ snapshot }` | getChannelPairingSnapshot + getTelegramPairingSnapshot |
| `remote.createPairCode` | `{ channel }` | `{ code, expiresAt }` | createChannelPairCode + createTelegramPairCode |
| `remote.clearPairCode` | `{ channel }` | `{}` | clearChannelPairCode + clearTelegramPairCode |
| `remote.clearBindings` | `{ channel }` | `{ count }` | clearChannelBindings + clearTelegramBindings |
| `remote.weixin.startLogin` | `{ force? }` | `{ sessionKey, loginUrl, message?, messageKey? }` | startWeixinIlinkLogin |
| `remote.weixin.waitForLogin` | `{ sessionKey, timeoutMs? }` | `{ connected, account?, message?, messageKey? }` | waitForWeixinIlinkLogin |
| `remote.weixin.removeAccount` | `{ accountId }` | `{}` | removeWeixinIlinkAccount |
| `remote.weixin.restartAccount` | `{ accountId }` | `{}` | restartWeixinIlinkAccount |

Register in `routes.ts` catalog + `ARGOS_ROUTE_CATALOG`.

### Daemon host: `apps/daemon/src/host/daemonRemoteControlRuntime.ts`

Mirrors `DaemonMemoryRuntime`:

```ts
export class DaemonRemoteControlRuntime {
  readonly runtime: RemoteControlRuntime;
  constructor(deps: { configPresenter; sessionRepository; providerExecutionPort; dataDir }) {
    this.runtime = new RemoteControlRuntime({
      configPort: adaptConfig(configPresenter),
      dataDir,
      sessionPort: adaptSession(sessionRepository, providerExecutionPort),
      generationPort: providerExecutionPort,   // now has getActiveGeneration
    });
  }
  async initialize() { await this.runtime.initialize(); }
  async destroy() { await this.runtime.destroy(); }
}
```

Wired in `apps/daemon/src/index.ts` after `providerExecutionPort` is constructed;
`initialize()` called at startup (non-blocking — adapters connect async).

### Daemon dispatcher: `remote.*` handlers

In `daemonDispatcher.ts`, add a `dispatchRemoteRoute(runtime, route, input)`
helper (mirroring `dispatchConfigRoute`). Each route maps to a runtime method.

### Desktop thin proxy

`apps/desktop/src/main/presenter/remoteControlPresenter/index.ts` is reduced to:
- A proxy that forwards every method to daemon `remote.*` routes via
  `invokeDaemonRoute` (same pattern as configPresenter agent delegation).
- The **WeChat login window** stays: on `startWeixinIlinkLogin`, call the daemon
  route to get `{ sessionKey, loginUrl }`, then `openWeixinIlinkLoginWindow(
  loginUrl)` for the native QR window; `waitForWeixinIlinkLogin` calls the daemon
  route. The window is pure UX; state is daemon-owned.
- The **`/open` command** stays a desktop-only layer: the conversation runner's
  `open()` calls a desktop route that resolves the daemon session and focuses a
  chat window. (In daemon-only/web mode, `/open` returns `windowNotFound`.)

The desktop stops constructing adapters, the `ChannelManager`, pollers, etc.

### webBridge mapping

Replace the temporary `remoteControlPresenter:call → null` fallback in
`apps/desktop/src/preload/webBridge.ts` with a `ROUTE_MAP` entry mapping each
presenter method to its `remote.*` route (with `mapInput`/`mapOutput`).

### Renderer client

The typed `RemoteControlRuntime` client (`apps/desktop/src/renderer/api/
RemoteControlRuntime.ts`) keeps its current shape but routes through
`window.argos.invoke("remote.*", …)` instead of the legacy presenter channel.
`RemoteSettings.tsx` is unchanged (it already uses the client/presenter).

## Compatibility / Migration

- **Existing desktop users:** on first launch after upgrade, the desktop proxy
  reads remote-control config from the daemon (the same `remoteControl` config
  key the desktop wrote). No data migration — the key already exists in the
  shared config store if the user configured bots before.
- **Enabled bots restart in the daemon:** `DaemonRemoteControlRuntime.
  initialize()` reads persisted config and starts enabled channels, so bots
  survive desktop restarts.
- **No double-running:** the desktop no longer owns adapters; only the daemon
  runs them. The desktop `/open` + WeChat window are stateless UX layers.
- **Config schema:** adding `remoteControl` to the enum is backward-compatible
  (existing daemon DBs without the key return null → runtime applies defaults).

## Test Strategy

1. **Ported unit tests** — move `apps/desktop/test/main/presenter/
   remoteControlPresenter/remoteControlPresenter.test.ts` to the package level,
   adapting to the `RemoteControlRuntime` + ports shape (inject fakes). These
   cover binding store, pairing, settings snapshots, command routing.
2. **Daemon host test** — `apps/daemon/test/daemonRemoteControlRuntime.test.ts`:
   construct the runtime with fake ports, verify initialize/destroy, settings
   round-trip, and that enabling a channel starts its adapter.
3. **Daemon dispatcher test** — add `remote.*` route cases to
   `daemonDispatcher-tier2.test.ts` (settings/status/pairing round-trip).
4. **Conversation runner test** — verify the headless runner drives a fake
   `sessionPort`/`generationPort` through a full turn (send → poll generation →
   snapshot → reply) with NO window deps.
5. **webBridge test** — verify `remoteControlPresenter:call` maps to `remote.*`
   routes with correct input/output shaping.
6. **`getActiveGeneration`** — unit test the new daemon accessor.
7. **Migration/config** — test that `remoteControl` config key round-trips
   through the daemon config route.

## Implementation Slices (maps to tasks.md)

1. **Slice 1 — Shared package skeleton + ports.** Create
   `packages/remote-control-runtime/`, define ports, move framework-agnostic
   files verbatim (channelManager, types, services minus Electron). Get it
   typechecking standalone.
2. **Slice 2 — Daemon accessor + config key.** Add `getActiveGeneration` to
   provider execution; add `remoteControl` to config enum.
3. **Slice 3 — Move adapters + conversation runner.** Port the 5 channel
   adapters (swap `undici` WS, `net.fetch`); port the conversation runner (data
   dir port, drop `open()`/window deps). Verify Feishu SDK on Bun.
4. **Slice 4 — Daemon host + routes.** `DaemonRemoteControlRuntime`, route
   contracts, dispatcher handlers, wiring in `index.ts`.
5. **Slice 5 — Desktop thin proxy.** Reduce desktop presenter to daemon proxy +
   WeChat window + `/open` shim.
6. **Slice 6 — webBridge mapping + renderer client.** Replace null fallback;
   route client through `remote.*`.
7. **Slice 7 — Tests + cleanup.** Port/adapt all tests; remove dead desktop
   adapter code.
