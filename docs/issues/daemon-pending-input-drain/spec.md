# Spec: Fix steer/pending inputs never sending (daemon queue drain)

## Problem

Steering a running session never delivers the message:

1. The ⚡ **"Interrupt & send"** button on a queued item calls `sessions.steerPendingInput`. The
   route contract says it "promotes *and* interrupts", but the daemon handler only calls
   `sessionRepository.steerPendingInput()`, which flips the row's mode `queue → steer` — nothing
   interrupts the active turn and nothing sends. The item then renders as "Locked" forever.
2. Even when the current turn finishes naturally, **nothing drains the steer lane or the queue**.
   Desktop semantics (ported integration tests: "drains converted steer inputs as visible user
   messages before queued messages", "steerPendingInput drains queued turns after a session error")
   were never implemented in the daemon: `resumePendingQueue()` is a stub (`ensureSessionExists`)
   and neither the Pi nor the ACP completion path triggers any drain.
3. A steer item cannot be cancelled from the UI (no delete button; shown as "Locked"), so a
   mis-steered item is stuck permanently.

## User stories

1. As a user, when I click ⚡ on a queued message while the agent is working, the message is
   delivered into the active turn immediately (Pi: steer text into the running agent; ACP:
   interrupt + send) and disappears from the pending lane.
2. As a user, queued/steer items are sent automatically after the current turn finishes — steer
   items first as their own turn, then queue items one by one.
3. As a user, clicking ⚡ while the session is idle or errored sends that item as a new turn
   (recovery path).

## Acceptance criteria

- `sessions.steerPendingInput` delivers the promoted item (active turn steer or new-turn send) and
  removes it from the pending lane; the route still returns the promoted record.
- Pi-with-files while generating defers to the post-settle drain (Pi steer is text-only).
- Turn completion (Pi + ACP) drains pending inputs: steer rows first, then queue order, one turn
  per item; failures restore the row and stop the chain.
- `sessions.resumePendingQueue` now performs the drain for a session (idle only).
- Daemon tests cover repository drain ordering/restore and dispatcher delivery branches.

## Non-goals

- File attachments inside an active Pi turn (Pi `steer` is text-only; files wait for their own turn).
- Auto-draining queued items after a session error (desktop required explicit user action; ⚡ now
  covers it).
- UI changes to the pending lane.

## Root cause references

- `apps/daemon/src/dispatch/daemonDispatcher.ts` `sessionsSteerPendingInputRoute` handler
- `apps/daemon/src/host/bun-session-repository.ts` `steerPendingInput`/`resumePendingQueue`
- `apps/daemon/src/host/pi-provider-execution.ts` completion continuation (no drain hook)
- `apps/daemon/src/host/acp-provider-execution.ts` `runTurn` completion (no drain hook)
