# Remote Control Daemon Port — Specification

## Goal

Move the **remote control subsystem** (Telegram / Discord / Feishu / QQ Bot /
WeChat iLink bot integrations) from the Electron desktop main process into the
daemon, so that bot channels are available and run identically in **both
desktop and web mode**. Today the subsystem is desktop-only; in web mode every
`remoteControlPresenter:call` returns null and the Remote Channels settings page
is non-functional.

Concretely: configuring a Telegram (or Discord/Feishu/QQ/WeChat) bot from the
web UI, having the daemon maintain the long-lived bot connection, and receiving
replies through the bot must work without the Electron app running.

## Background / Problem

**Current transitional state:** web and desktop can configure channels through
daemon `remote.*` routes, and the Electron-free implementation exists in
`packages/remote-control-runtime`. However, the daemon constructs it in
`configOnly` mode while Electron still constructs a second, copied runtime for
live bot traffic. This duplicates every adapter, router, binding service, and
conversation-runner change and can run different behavior by host.

**Root cause:** the entire `RemoteControlPresenter`
(`apps/desktop/src/main/presenter/remoteControlPresenter/`, ~1800 lines + 5
channel adapter subtrees) lives in the Electron main process. A bot listener is
a long-running, server-side process that should survive app shutdown — the
daemon is the correct owner.

### What is actually portable

The subsystem is almost entirely framework-agnostic:

- **Channel adapters** (telegram/discord/feishu/qqbot/weixinIlink) — pure
  `fetch`/WebSocket + `node:crypto`/`node:fs`. No Electron. Run in-process (no
  child processes spawned).
- **`ChannelManager` / `ChannelAdapter`** — in-memory adapter registry. No
  Electron.
- **`RemoteBindingStore`** — thin wrapper over `configPresenter.getSetting/
  setSetting(REMOTE_CONTROL_SETTING_KEY, …)` (single persisted JSON blob). No
  Electron.
- **Services** (routers, auth guards, block renderer, conversation runner) — no
  Electron except 2 documented coupling points (see Constraints).

### The two Electron couplings

1. **`RemoteConversationRunner.open()` + `resolveChatWindow()`** — the `/open`
   bot command focuses a desktop chat window via `windowPresenter`/`tabPresenter`
   /`BrowserWindow`. This is a desktop-handoff convenience, **not** part of the
   bot-reply hot path. Headless: return `windowNotFound` (an existing branch).
2. **WeChat iLink login `BrowserWindow`** — displays a QR image for the user to
   scan. The window performs **no** credential harvesting; login state is
   resolved by server-side polling (`WeixinIlinkClient.waitForLogin`). Headless:
   return the `loginUrl` (QR image content) to the browser client and let it
   render the QR; the daemon resolves the wait exactly as today.

### Dependency that needs a new daemon accessor

The conversation runner polls `agentRuntimePresenter.getActiveGeneration(
sessionId)` to track the in-flight assistant event while streaming a bot reply.
The daemon has `providerExecutionPort.sendMessage/cancelGeneration/
respondToolInteraction` and both HTTP and ACP execution paths. It still needs a
small read accessor over their existing in-flight maps so the shared runner can
observe and cancel the active turn.

## Acceptance Criteria

1. **Web mode configuration works.** From `/#/settings/remote`, a user can
   configure each channel (Telegram, Discord, Feishu, QQ Bot, WeChat iLink),
   save settings, and see live channel status — without the Electron app.
2. **Bot runtime lives in the daemon.** Enabling a channel starts its adapter
   (poller / gateway / webhook) inside the daemon process; it keeps running when
   the desktop app is closed; restart of the daemon re-initializes enabled
   channels from persisted config.
3. **Bot → agent → bot reply works headlessly.** An incoming Telegram message
   binds a session, runs an agent turn via the daemon's session/provider-execution
   layer, and streams the reply back through Telegram — with no Electron window
   involved.
4. **Desktop delegates to the daemon.** The desktop main process stops owning
   the bot runtimes; its `RemoteControlPresenter` becomes a thin proxy (or is
   removed) that routes to daemon `remote.*` routes, mirroring the
   config/agents/memory delegation pattern.
5. **WeChat login works in a browser.** `startWeixinIlinkLogin` returns the QR
   `loginUrl`; the web client renders it; `waitForWeixinIlinkLogin` resolves
   server-side. No `BrowserWindow`.
6. **No regression on desktop.** All existing `remoteControlPresenter.test.ts`
   behavior is preserved (adapted to the new daemon-owned runtime).
7. **Console is clean.** No `[WebBridge] Unmapped presenter call` /
   `Unknown IPC channel` warnings for remote control in web mode.

## Constraints

- **Follow the established daemon host-module pattern** (`DaemonMemoryRuntime`,
  `DaemonArgosAgentRuntime`, `DaemonMcpRuntime`): a `DaemonRemoteControlRuntime`
  host class that constructs the shared runtime and injects daemon-specific
  ports, wired in `apps/daemon/src/index.ts`.
- **Shared code must not import `electron`.** The ported presenter + adapters
  move to a shared location importable by both daemon and desktop. `electron`
  imports (`BrowserWindow`, `net`, `app.getPath`) are removed or replaced
  (`globalThis.fetch`, a data-dir port).
- **Route contracts** live in `packages/shared-contracts/src/routes/` and are
  registered in the route catalog, mirroring config/mcp/skills routes.
- **Desktop compatibility:** the desktop `RemoteControlPresenter` either proxies
  to the daemon (preferred, consistent with agents/config delegation) or is
  reduced to the WeChat login-window UX shim that calls daemon routes. The
  `/open` desktop-handoff command stays a desktop-only nicety layered on top.
- **Bun compatibility** must be verified for:
  - `@larksuiteoapi/node-sdk` (Feishu — the only heavy SDK; risk item).
  - `undici` `WebSocket` (Discord/QQ gateway) → swap to Bun's built-in
    `WebSocket`.

## Non-Goals

- **New channels.** No new bot platforms are added; the existing 5 port as-is.
- **Webhook mode for Telegram/Feishu.** Keep the current polling/WebSocket model.
- **Redesigning the conversation-runner polling.** The `getActiveGeneration`
  polling loop ports as-is (only the accessor is added).
- **Multi-daemon / clustered bots.** Single daemon instance, as today.
- **Mobile clients.** Out of scope.

## Open Questions / Decisions

### [DECIDED] Where does the shared runtime live?

A new package `packages/remote-control-runtime/` (mirroring `agent-runtime`,
`memory-runtime`, `mcp-runtime`). It exports `RemoteControlRuntime`,
`RemoteBindingStore`, the `ChannelManager`/`ChannelAdapter` base, all channel
adapters, and the conversation runner — all Electron-free. Both the daemon
(`DaemonRemoteControlRuntime` host) and desktop (thin proxy) import from it.

### [DECIDED] Feishu SDK runs under Bun

The installed `@larksuiteoapi/node-sdk` module imports successfully under the
repository's Bun runtime from `packages/remote-control-runtime`. The shared
Feishu adapter remains enabled; no daemon-only reimplementation or degradation
is required for this cutover.

### [DECIDED] Desktop role after port — thin proxy

Desktop `RemoteControlPresenter` forwards all `remote.*` calls to the daemon
over routes. The daemon owns all bot runtimes. Desktop keeps **only** the WeChat
login window and `/open` command as native-UX layers that call daemon routes for
state but render native windows. This matches the agents/config delegation
pattern.

### [DECIDED] Config key storage — add to enum

`remoteControl` is added to the daemon's `CONFIG_ENTRY_KEYS` enum with a
permissive nested-blob schema (`zod.unknown()` passthrough), matching how desktop
already stores it today. No dedicated JSON store.

### [DECIDED] One implementation, one runtime owner

All portable implementation code lives in `packages/remote-control-runtime`.
Only the daemon instantiates it. Electron exposes a compatibility proxy over
typed daemon routes and must not keep copied adapters, routers, or a
conversation runner.
