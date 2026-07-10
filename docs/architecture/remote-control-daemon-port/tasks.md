# Remote Control Daemon Port — Tasks

Ordered implementation slices. Each slice maps to a reviewable commit set.
Update status (`[ ]` → `[x]`) as work lands.

## Slice 1 — Shared package skeleton + ports

- [x] 1.1 Create `packages/remote-control-runtime/` (package.json, tsconfig,
      src/index.ts) following the `agent-runtime`/`memory-runtime` package shape.
      Add to pnpm workspace + turbo pipeline.
- [x] 1.2 Define `RemoteControlRuntimePorts` (configPort, dataDir, sessionPort,
      generationPort, filePort?) + `AgentSessionPort` types in `src/ports.ts`.
- [x] 1.3 Move framework-agnostic files verbatim from desktop:
      `channelManager.ts`, `channelAdapter.ts`, `types.ts`, `types/channel.ts`,
      `services/remoteBindingStore.ts` (→ `bindingStore.ts`, configPort-injected),
      `services/remote*Router.ts`, `services/*AuthGuard.ts`,
      `services/remoteBlockRenderer.ts`, `services/remoteInteraction.ts`.
- [x] 1.4 `channelAdapter.ts`: replace `import { net } from "electron"` +
      `net.fetch` with `globalThis.fetch` (1 line, `fetchBinaryAttachment`).
- [x] 1.5 Create `RemoteControlRuntime` façade (`src/remoteControlRuntime.ts`):
      the current `index.ts` class minus Electron (no `BrowserWindow`, no
      `openWeixinIlinkLoginWindow`). WeChat `startWeixinIlinkLogin` returns
      `{ sessionKey, loginUrl }`; `waitForWeixinIlinkLogin` resolves server-side.
      Constructor takes `RemoteControlRuntimePorts`.
- [ ] 1.6 Wire `architecture-guard.mjs` to include the new package src.
- [x] 1.7 Package standalone typecheck green.

## Slice 2 — Daemon accessor + config key

- [~] 2.1 ~~Add `getActiveGeneration`~~ — **DEFERRED.** Slice 2 revealed the daemon's
      Argos execution is a basic single-shot LLM call with no generation tracking /
      streaming / agent loop. The conversation runner needs the desktop's event-driven
      `AgentRuntimePresenter`. This is a separate, larger prerequisite (daemon
      agent-loop runtime) outside this port. Bot replies are deferred until it lands.
- [x] 2.2 Add `remoteControl` to `CONFIG_ENTRY_KEYS` +
      `ConfigEntryValuesSchema` (`zod.unknown()` passthrough) +
      `ConfigEntryChangeSchema` in `packages/shared-contracts/src/routes/config.routes.ts`.
- [x] 2.3 Config round-trip test covered by `daemonRemoteControlConfig.test.ts`.

## Slice 2b — config-only runtime mode (revised scope)

- [x] 2b.1 Add `configOnly?: boolean` to `RemoteControlRuntimePorts` (skip adapter
      start; `getChannelStatus` reports `stopped`).
- [x] 2b.2 Guard `initialize()` + all 5 `rebuild*Runtime()` methods on `configOnly`.
- [x] 2b.3 Add framework-agnostic `logger.ts` to the package (replaces the
      Electron-coupled `@shared/logger`).

## Slice 3 — Move adapters + conversation runner

- [ ] 3.1 Move `telegram/` → `src/channels/telegram/` verbatim (pure fetch).
- [ ] 3.2 Move `discord/` (client+parser+runtime) → `src/channels/discord/`;
      swap `undici` `WebSocket` → global/Bun `WebSocket` in
      `discordGatewaySession.ts`.
- [ ] 3.3 Move `qqbot/` → `src/channels/qqbot/`; same `undici` → global WS swap
      in `qqbotGatewaySession.ts`.
- [ ] 3.4 Move `weixinIlink/` → `src/channels/weixinIlink/` verbatim (pure
      fetch + node:crypto).
- [ ] 3.5 Move `adapters/**` → `src/channels/adapters/`.
- [ ] 3.6 **Feishu feasibility check:** run `@larksuiteoapi/node-sdk` under Bun
      (minimal WSClient smoke). If OK → move `feishu/` verbatim. If not → mark
      Feishu `implemented: false` in daemon mode + open follow-up issue for a
      native reimplementation; move the other 4 channels.
- [ ] 3.7 Move conversation runner → `src/conversationRunner.ts`: replace
      `app.getPath("userData")` (2 sites) with the injected `dataDir` port;
      drop `open()` + `resolveChatWindow()` (move to a desktop-only override
      hook, or return `windowNotFound`); drop `windowPresenter`/`tabPresenter`
      deps from the runtime (desktop-only override lives in the desktop proxy).
- [ ] 3.8 Remove `electron` from the package's allowed imports; verify no
      residual `electron`/`undici` imports remain.

## Slice 4 — Daemon host + routes (config surface)

- [x] 4.1 Write `packages/shared-contracts/src/routes/remote.routes.ts` with
      the coarse-grained route contracts. Register in `routes.ts` catalog +
      `ARGOS_ROUTE_CATALOG` (15 routes; 318 total entries).
- [x] 4.2 `apps/daemon/src/host/daemonRemoteControlConfig.ts`: construct
      `RemoteControlRuntime` in `configOnly` mode with a `RemoteConfigPort`
      adapter over the daemon config presenter (stub session/generation ports —
      unused while configOnly).
- [x] 4.3 Wire `DaemonRemoteControlConfig` in `apps/daemon/src/index.ts`; call
      `initialize()` (no-op in configOnly) at startup.
- [x] 4.4 Add `dispatchRemoteRoute(runtime, route, input)` in
      `daemonDispatcher.ts`; wire each `remote.*` route to a runtime method.
- [x] 4.5 Daemon host test (`daemonRemoteControlConfig.test.ts`): initialize/
      destroy, list channels, settings round-trip, pair-code issue/clear,
      config-only status stopped. 5/5 pass.
- [x] 4.6 Dispatcher test factories updated for the new `remoteControl`
      positional param (tier2, settings-activity, provider-import). 135/135 pass.

## Slice 5 — Desktop thin proxy — **DEFERRED**

- [~] 5.x The desktop keeps its full `RemoteControlPresenter` for now. Converting
      it to a daemon proxy only makes sense once the daemon can actually run bots
      (needs the agent-loop runtime). The webBridge mapping (Slice 6) makes web
      mode use the daemon config surface directly; desktop still uses its own
      in-process presenter (unchanged behavior).

## Slice 6 — webBridge + renderer client

- [x] 6.1 Replace `remoteControlPresenter:call → null` fallback in
      `apps/desktop/src/preload/webBridge.ts` with `resolveRemoteControlRoute`,
      mapping each presenter method to its `remote.*` route (generic +
      channel-specific + WeChat login).
- [x] 6.2 Added vitest `@shared/contracts` + `@argos/remote-control-runtime`
      aliases so the daemon test runtime resolves the package.

## Slice 7 — Tests + cleanup

- [x] 7.1 `daemonRemoteControlConfig.test.ts` — 5/5 pass.
- [x] 7.2 `pnpm run format` + `pnpm run lint` (0 warnings/errors, all guards) +
      `typecheck` (desktop node+web, daemon) all green.
- [ ] 7.3 Manual smoke: configure Telegram from web mode (config saves; bot does
      not reply until the daemon agent-loop runtime lands).
- [x] 7.4 webBridge null fallback replaced; no `[WebBridge]` warnings for remote
      control in web mode.

## Notes

- Slice 3.6 (Feishu) is the main risk — schedule the Bun feasibility check
  early; if it blocks, ship 4 channels and defer Feishu.
- Slice 5 is the largest desktop-side change; do it after the daemon fully owns
  the runtime (Slice 4) so there's a working backend to proxy to.
- Each slice should leave the repo typechecking + linting green.
