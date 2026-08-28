# Spec: Streaming diagnostics logging

## Problem

The logs from the streaming-stall report (docs/issues/stream-stall-recovery) were decisive but
cost more effort than they should have. Gaps:

1. `messageIpc.ts` prints the **entire 80-char preview of every block** on every `stream.updated`
   (multi-KB lines, repeated) with no timing, no delta, and no way to tell "stale repeat" from
   "progress" without eyeballing thousands of characters. It also builds that preview string on
   the hot path per event.
2. The WebSocket bridge (`@argos/client-sdk`) is silent about connect/close/reconnect — the single
   most important signal (a WS gap swallowing `chat.stream.completed`) was invisible. Its route
   timeout rejects a bare `Error("Request timeout")`, so `[threadSidebar] Failed to load
   experiment flag: Error: Request timeout` could not be attributed to a route or duration.
3. The daemon's WS route dispatcher (`apps/daemon/src/index.ts`) has zero logging: a hung
   `dispatchRoute` (the server-side half of that timeout) leaves no trace.
4. The pi runtime logs nothing about turn lifecycle — no turn start, no settle, no slow-tool
   signal, so "stuck while a tool runs for 66s+" looks identical to "stuck forever".

## Goal

Make the next occurrence of the stall diagnosable from logs alone, in one screen, from either the
renderer console or the daemon log — without adding hot-path cost or noise.

## Acceptance criteria

1. `stream.updated` logs are one compact line: short requestId, block count, block/content deltas
   vs. the previous snapshot for that requestId, and seconds since the previous update. The full
   content preview moves to `console.debug` (hidden by default in devtools).
2. The WebSocket bridge logs connect, close (code/reason, skip for manual close), reconnect
   backoff attempts, and probe mode; its route-timeout rejection names the route and elapsed ms.
3. The daemon WS route dispatcher logs slow dispatches (>5s: route, requestId, duration) and
   failures (route, requestId, error) using the daemon `logger`.
4. The pi runtime logs turn start, turn settled (blocks count, duration), and tool calls that run
   longer than 5s (name + duration) — silence during a long tool is thereby distinguishable from
   a wedged turn.
5. No contract/payload changes; logging only.

## Non-goals

- Structured/centralized log shipping.
- ACP runtime lifecycle logging (separate pass if its stalls show up).
- Changing reconnect/backoff behavior.

## Constraints

- Preload shares the renderer console, so bridge logs land in devtools — keep prefixes consistent
  (`[WebSocketBridge]`).
- Never log tokens or full payloads; ids only.
