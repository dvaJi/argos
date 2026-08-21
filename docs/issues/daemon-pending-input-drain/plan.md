# Plan: daemon pending-input drain

## Design

Ownership follows the data: the session repository owns the pending rows, so it owns the drain.
Sending needs the provider port, which is assembled after the repository (and after both provider
ports) in `index.ts` — wired late via a setter, mirroring `orchestrationRuntime.setSessionActions`.

```
turn settles (Pi markDone / ACP runTurn success)
        │ onTurnSettled(sessionId)
        ▼
repo.resumePendingQueue(sessionId)
  ├─ sender not wired | session generating | no rows → return
  ├─ rows ordered: steer first (created_at), then queue (queue_order)
  ├─ first row: delete → sender(sessionId, payload)   // providerExecutionPort.sendMessage
  │     └─ that turn settles → onTurnSettled → drain next item (chained, one per turn)
  └─ on failure: re-insert row (same id/mode) + log + stop
```

### sessions.steerPendingInput (⚡ button) delivery matrix

| Session state        | ACP                            | Pi                                   |
| -------------------- | ------------------------------ | ------------------------------------ |
| generating           | delete row + `steerActiveTurn` | text-only: delete row + `steerActiveTurn`; with files: keep row (post-settle drain sends it) |
| idle / error / done  | delete row + `sendMessage` (new turn) | same                          |

ACP `steerActiveTurn` = interrupt + send (already implemented). Pi `steerActiveTurn` =
persist user message + `session.steer(text)` (text-only by protocol).

### Changes

1. `bun-session-repository.ts`
   - `setPendingQueueSender(fn)` + private sender/draining-guard state.
   - Real `resumePendingQueue`: guards (wired, not generating, not already draining, rows exist),
     delete-first-then-send with restore-on-failure (`reinsertPendingRow`, same id/mode).
2. `pi-provider-execution.ts` — `setTurnSettledHandler(fn)`; invoke after `markDone` in the
   completion continuation (not after `markError`).
3. `acp-provider-execution.ts` — same handler; invoke after the `generation-completed` publish in
   `runTurn` (not on the error path).
4. `index.ts` — after assembling `providerExecutionPort`: wire
   `sessionRepository.setPendingQueueSender(...)`, set both ports' turn-settled handlers to
   `repo.resumePendingQueue`.
5. `daemonDispatcher.ts` — implement the delivery matrix in the `sessionsSteerPendingInputRoute`
   handler (`providerExecutionPort` + `sessionRepository.get` are both in scope).

## Compatibility

- Route input/output schemas unchanged (still returns the promoted record).
- Desktop behavior preserved: steer-before-queue ordering, one item per turn, error-state recovery
  via explicit ⚡, no auto-drain after errors.
- `providerExecutionPort.getActiveGeneration` guards against the Pi "active turn" race.

## Test strategy

- Repository-level (bun test): drain ordering (steer first), delete-then-send, restore-on-failure,
  skip while generating, chained drain via re-invocation.
- Dispatcher tier2: steerPendingInput branches — generating (steer path), idle (send path),
  Pi-with-files deferral.
