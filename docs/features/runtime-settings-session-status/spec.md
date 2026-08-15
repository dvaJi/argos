# Runtime resilience, settings redesigns, and session status

## [S1] Problem

Four related gaps surfaced during day-to-day use:

1. **Daemon startup failure leaves the app broken-but-alive.** When the local daemon WebSocket fails to
   connect at startup (daemon still starting, port not yet assigned, sidecar stuck), the bridge's
   reconnect loop exhausts after 10 attempts and permanently stops; the preload never re-drives the
   connection, and the renderer's stores hydrate once and never re-run. The UI renders but every action
   fails with "Daemon bridge is not connected".
2. **The Remote Channels settings page is flat and hard to use.** Four bot channels (Telegram, QQ,
   Discord, WeChat) live in plain tabs with no status affordance; icons never show their brand colors;
   there are no microinteractions to signal state.
3. **ACP settings has confusing statuses and no real update path.** "Custom agents" is always collapsed
   even when agents exist; "Shared MCP access" count can disagree with the visible list; every enabled
   agent shows "Enabled, not checked" by default; and the "update available" toast navigates to a page
   whose Update button cannot actually update a binary agent (npx/uvx are latest-at-launch no-ops).
4. **Session status is not surfaced.** The designed `done` ("finished but unseen") state is never emitted
   by the daemon (it emits `idle`), there is no `done → idle` on-view transition, and "working" sessions
   show only an inert CSS class — no spinner.

## [S2] Current State

- `WebSocketBridge` (`packages/client-sdk/src/websocket-bridge.ts`) reconnects with exponential backoff,
  capped at 10 attempts, then emits `RECONNECT_EXHAUSTED_ERROR` and stops forever. `HybridBridge.invoke`
  throws "Daemon bridge is not connected" whenever the socket is not open.
- `apps/desktop/src/preload/index.ts` `connectToLocalDaemon` warns on failure and leaves no retry;
  `bindDaemonLifecycleEvents` nulls the bridge on `unhealthy`, killing any in-flight retry.
- `packages/ui/src/lib/storeInitializer.ts` runs once with no re-run; `ChatTabView` catches hydration
  failure, logs, and `setIsReady(true)` anyway.
- `/settings/remote` (`RemoteSettings.tsx`) is a flat `Tabs` of four channels.
- `AcpSettings.tsx` uses controlled `Collapsible`s defaulting to closed; `AgentMcpSelector` reports the
  raw selection count; `AcpDiagnostics` labels enabled-but-unchecked agents "Enabled, not checked";
  `config.ensureAcpAgentInstalled` never re-downloads a binary after a registry version bump.
- Daemon providers (`acp-provider-execution.ts`, `pi-provider-execution.ts`) emit `idle` on completion;
  `sessions.activate` has no view-transition; `generation_status` column exists and is exposed.

## [S3] Proposed Changes

### Daemon reconnect + recovery UI
- Bridge keeps a slow unbounded probe loop after backoff exhaustion (never permanently stops) and adds
  `forceReconnect()`.
- `HybridBridge` gets `retryConnection()` + `setRetryHandler()`; preload keeps the bridge installed on
  failure, no longer nulls it on `unhealthy`, exposes `window.argos.connection.retryConnection`.
- Renderer: `DaemonConnectionBanner` shows for the no-URL case with a Retry button; store hydration
  re-runs on reconnect; `ChatTabView` shows a "Reconnecting to the daemon…" placeholder when hydration
  fails instead of a broken shell.

### Remote channels redesign
- Card-based overview (2-col) with per-channel status ("Not configured / Enabled / Connected"), enable
  toggles, brand-colored icons when configured, and CSS-only microinteractions using app motion tokens.

### ACP settings fixes + real updates
- New `config.updateAcpAgent` route/presenter: binary agents re-download the new version
  (`repair: true`); npx/uvx are latest-at-launch no-ops. Update button on the agent row + registry dialog.
- Auto-expand "Custom agents" when agents exist; shared-MCP count matches the visible list; "Not verified
  yet" copy + auto health-check on mount for enabled agents.

### Session status restore
- Daemon emits `done` on completion (unless the session is the active one → stay `idle`), `error` on
  failure. `markSessionViewed()` resets `done → idle` on `sessions.activate` and publishes a `viewed`
  status change. Sidebar shows a spinner for working sessions and a blue dot for finished-but-unseen.

## [S4] Design Record

- UI: BEFORE (flat tabs / collapsed sections / no status) → AFTER (cards with brand color + status dot,
  auto-expanded custom agents, spinner + blue dot in the session list). See `plan.md` for layout blocks.
- Backend: no schema migration; the existing `generation_status` column is reused. New route
  `config.updateAcpAgent` follows the existing `config.repairAcpAgent` contract shape.

## [S5] Verification

- `bun run format`, `bun run lint`, `bun run typecheck` (desktop + daemon), `packages/ui` `typecheck:web`.
- Daemon session tests, ACP config tests, launch-spec tests, preload tests.
- Manual scenarios: kill daemon mid-run → banner + retry recovers; toggle remote channels; run an ACP
  agent update; watch a session complete → blue dot appears for non-active sessions and clears on open.
