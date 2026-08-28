# Plan: Streaming diagnostics logging

## Changes

1. `packages/ui/src/stores/ui/messageIpc.ts`
   - Track per-requestId `{blocks, chars, at}`; log one compact line per update:
     `[chat] stream.updated ← ab12cd34 blocks=86 (+0/+0 chars, +4.1s)` — repeats are instantly
     visible as `+0/+0`. First update logs `first`.
   - Move the existing full content preview to `console.debug` (devtools verbose level).
   - Clear the tracking map in the bind cleanup.

2. `packages/client-sdk/src/websocket-bridge.ts`
   - `onopen`: `console.info("[WebSocketBridge] connected:", url)`.
   - `onclose` (non-manual): warn with close code/reason; note reconnect intent.
   - `scheduleReconnect`: warn with delay + attempt counters.
   - `scheduleProbe`: warn once when fast attempts are exhausted.
   - `invoke` timeout: `Error("Request timeout after 30000ms: <route>")`.

3. `apps/daemon/src/index.ts` (WS `message` handler, route branch)
   - Measure `dispatchRoute`; `logger.warn` when >5s (`[daemon] slow ws route …`), `logger.warn`
     on failure (`[daemon] ws route failed …`). Uses the existing daemon logger.

4. `apps/daemon/src/host/pi-provider-execution.ts`
   - `sendMessage`: log turn start (session/request short ids).
   - `settled` handler: log settle with block count + turn duration.
   - `toolStart`/`toolEnd`: on completion, if the block's timestamp shows >5s elapsed, log tool
     name + duration (makes "slow tool" visible without per-tool spam).

## Affected interfaces

Logging only. The timeout `Error` message text changes (was `Request timeout`) — callers match on
the error object, not the message; `[threadSidebar]` and friends print `error.message`, which now
gains route + duration automatically.

## Test strategy

- `bun run typecheck` (ui + daemon + desktop), `bun test` (daemon), `bun run lint`.
- Manual: stream a turn with a >5s tool and observe the new daemon lines; kill the daemon WS to
  see bridge reconnect logs; the renderer stream lines show `+0/+0` for repeats.
