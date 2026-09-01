# Issue: pressing STOP cancels the turn but the agent starts again shortly after

## Summary

With an Argos agent turn running, pressing the stop/cancel button did not stop
generation immediately, and a new generation started again seconds later.

## Root cause

The daemon intentionally drains the **pending-input lane** after every turn settles
(`drainPendingInputs` → `resumePendingQueue` → next queued message is auto-sent).
A user cancel aborts the turn, which settles it — and the drain then auto-sent any
queued input, starting a brand-new generation right after the user pressed STOP.
The UI kept rendering stream snapshots until the abort settled, so nothing appeared
to stop immediately either.

## Fix

- `pi-provider-execution.ts` / `acp-provider-execution.ts`: cancellation adds the
  session to a `drainSuppressedSessions` set; the settle hook consumes the flag and
  **skips the drain** once. STOP therefore leaves the pending queue parked.
- A fresh user-initiated turn (`sendMessage`) clears a stale suppression flag so
  normal settles drain the queue again.

## Non-goals / follow-ups

- UI freeze of stream appends while cancelling (cooperative abort means the current
  chunk may still land once); the cancelling indicator already exists
  (`useSessionCancellingState`).
- Expose the suppressed-drain state in the queue UI if users report confusion about
  parked messages.

## Acceptance criteria

- Press STOP during a generation: the turn aborts, status leaves `generating`, and no
  new turn starts from the pending queue.
- Queued messages remain parked and can be sent manually.
- A normal (non-cancelled) turn completion still drains the queue as before.
