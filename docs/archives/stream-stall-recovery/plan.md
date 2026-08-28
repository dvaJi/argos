# Plan: Streaming stall recovery

## Approach

Three local changes: two renderer guards in `bindMessageStoreIpc`, one daemon persistence
throttle.

### 1. Renderer: settled-request guard + watchdog (`packages/ui/src/stores/ui/messageIpc.ts`)

Closure state: `settledRequestIds: Map<requestId, settledAt>` (cap ~100, evict oldest),
`activeStream: { sessionId, requestId } | null`, `lastStreamActivityAt: number`.

- `onStreamUpdated`: after the active-session check, drop payloads whose requestId already
  settled; otherwise record activity + `activeStream` and apply as today.
- `onStreamCompleted`/`onStreamFailed`: mark the requestId settled; skip the completion recovery
  (clear + reload) when a *different* requestId is currently the active stream for this session;
  clear `activeStream` when it matches.
- Watchdog (`setInterval`, 15s): if `activeStream` belongs to the active session and
  `Date.now() - lastStreamActivityAt > 120_000`, warn once and run the completion recovery
  (clear streaming state + reload persisted messages). Clears `activeStream`; a resumed live
  stream re-establishes it on the next update.
- Cleanup function clears the interval and closure state (module-level bind is singleton today,
  but keep it safe).

### 2. Daemon: pi snapshot persistence throttle (`apps/daemon/src/host/pi-provider-execution.ts`)

`publishSnapshot` currently `void`s `updateAssistantContent` on every publish. Replace with
leading-edge + trailing-edge throttle keyed by sessionId, min interval 1s:

- Leading write when ≥1s since the last persisted write for the session.
- Otherwise schedule a single trailing timer for the remainder; the flush re-checks that the
  session's worker turn is still the same `messageId` — if the turn settled meanwhile,
  `finalizeAssistantMessage` already persisted the truth and the flush is skipped.
- The event publish itself stays unconditional (hot path untouched), matching the existing
  comment's intent.

## Affected interfaces

- No contract/route/schema changes. `BindMessageStoreIpcOptions` unchanged (closure-internal
  state only). `PiProviderExecution.publishSnapshot` is private; repository call cadence changes,
  not its signature.

## Data flow

Events keep flowing daemon → WS bridge → `messageIpc` exactly as before; the renderer now
(1) refuses stale updates, (2) self-heals after 120s of silence, and the daemon writes partial
snapshots at ≤1Hz instead of per-event.

## Compatibility

- Renderer-only guards are transparent to the daemon; the pi throttle changes only *when*
  partial content is persisted. A daemon crash mid-turn now loses at most ~1s of partial blocks
  (previously ~none) — acceptable; final content is persisted on settle either way.

## Test strategy

- New Vitest cases for `bindMessageStoreIpc` guards: settled-requestId update dropped; watchdog
  fires recovery after silence (fake timers); mismatched completed requestId does not clear the
  active stream. Location mirrors source: `packages/ui/test` per repo conventions — verify
  existing UI test setup and place accordingly.
- `bun test` for the daemon still passes; `bun run typecheck` + `bun run lint`.
- Manual: long tool-heavy turn — route requests stay responsive; killing the WS (devtools
  offline) mid-stream recovers within ~2 minutes without a session switch.
