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
- [x] 1.6 Wire `architecture-guard.mjs` to include the new package src.
- [x] 1.7 Package standalone typecheck green.

## Slice 2 — Daemon accessor + config key

- [x] 2.1 Add `getActiveGeneration` state to both daemon execution ports and the
      combined provider router; expose cancellation through a runtime adapter.
- [x] 2.2 Add `remoteControl` to `CONFIG_ENTRY_KEYS` +
      `ConfigEntryValuesSchema` (`zod.unknown()` passthrough) +
      `ConfigEntryChangeSchema` in `packages/shared-contracts/src/routes/config.routes.ts`.
- [x] 2.3 Config round-trip test covered by `daemonRemoteControlConfig.test.ts`.

## Slice 2b — config-only runtime mode (revised scope)

- [x] 2b.1 Add `configOnly?: boolean` to `RemoteControlRuntimePorts` (skip adapter
      start; `getChannelStatus` reports `stopped`).
- [x] 2b.2 Guard `initialize()` + all 4 `rebuild*Runtime()` methods on `configOnly`.
- [x] 2b.3 Add framework-agnostic `logger.ts` to the package (replaces the
      Electron-coupled `@shared/logger`).

## Slice 3 — Move adapters + conversation runner

- [x] 3.1 Move `telegram/` into the shared runtime (pure fetch).
- [x] 3.2 Move `discord/` (client+parser+runtime) into the shared runtime;
      swap `undici` `WebSocket` → global/Bun `WebSocket` in
      `discordGatewaySession.ts`.
- [x] 3.3 Move `qqbot/` into the shared runtime; use global WebSocket
      in `qqbotGatewaySession.ts`.
- [x] 3.4 Move `weixinIlink/` into the shared runtime (pure
      fetch + node:crypto).
- [x] 3.5 Move all adapters into the shared runtime.
- [x] 3.6 Move conversation runner into the shared runtime: replace
      `app.getPath("userData")` (2 sites) with the injected `dataDir` port;
      drop `open()` + `resolveChatWindow()` (move to a desktop-only override
      hook, or return `windowNotFound`); drop `windowPresenter`/`tabPresenter`
      deps from the runtime (desktop-only override lives in the desktop proxy).
- [x] 3.8 Remove `electron` from the package's allowed imports; verify no
      residual `electron`/`undici` imports remain.

## Slice 4 — Daemon host + routes

- [x] 4.1 Write `packages/shared-contracts/src/routes/remote.routes.ts` with
      the coarse-grained route contracts. Register in `routes.ts` catalog +
      `ARGOS_ROUTE_CATALOG` (15 routes; 318 total entries).
- [x] 4.2 `apps/daemon/src/host/daemonRemoteControlRuntime.ts`: construct the
      shared runtime with real config, session, provider-execution, and
      generation adapters.
- [x] 4.3 Wire `DaemonRemoteControlRuntime` in `apps/daemon/src/index.ts`; start
      enabled channels after daemon plugins initialize and destroy them during
      shutdown.
- [x] 4.4 Add `dispatchRemoteRoute(runtime, route, input)` in
      `daemonDispatcher.ts`; wire each `remote.*` route to a runtime method.
- [x] 4.5 Daemon host test (`daemonRemoteControlRuntime.test.ts`): initialize/
      destroy, list channels, settings round-trip, pair-code issue/clear, and
      disabled-channel status. 5/5 pass.
- [x] 4.6 Dispatcher test factories updated for the new `remoteControl`
      positional param (tier2, settings-activity, provider-import). 135/135 pass.

## Slice 5 — Desktop thin proxy

- [x] 5.1 Replace the desktop `RemoteControlPresenter` implementation with a
      compatibility proxy over `remote.*` routes.
- [x] 5.2 Remove the duplicated desktop adapters, clients, routers, binding
      store, conversation runner, and their desktop-only implementation tests.
- [x] 5.3 Keep canonical runtime tests against `@argos/remote-control-runtime`
      and daemon host adapters.

## Slice 6 — webBridge + renderer client

- [x] 6.1 Replace `remoteControlPresenter:call → null` fallback in
      `apps/desktop/src/preload/webBridge.ts` with `resolveRemoteControlRoute`,
      mapping each presenter method to its `remote.*` route (generic +
      channel-specific + WeChat login).
- [x] 6.2 Added vitest `@shared/contracts` + `@argos/remote-control-runtime`
      aliases so the daemon test runtime resolves the package.

## Slice 7 — Tests + cleanup

- [x] 7.1 `daemonRemoteControlRuntime.test.ts` — 5/5 pass.
- [x] 7.2 `pnpm run format`, `pnpm run format:check`, `pnpm run lint`, desktop
      typecheck, shared-runtime typecheck, and focused daemon/runtime tests are
      green. The standalone daemon typecheck still reports the pre-existing
      `daemonMcpRuntime.ts` unknown-config errors.
- [ ] 7.3 Manual smoke: configure Telegram from web mode and verify an incoming
      message produces a daemon-owned session and bot reply.
- [x] 7.4 webBridge null fallback replaced; no `[WebBridge]` warnings for remote
      control in web mode.

## Notes

- The architecture guard prevents portable runtime code from returning to the
  Electron presenter directory.
- Each slice should leave the repo typechecking + linting green.
