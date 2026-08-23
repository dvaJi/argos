# Spec: Allow removing stuck steer pending inputs from the chat UI

## Problem

Steer-mode pending inputs render in `PendingInputLane` as static rows with a
hardcoded `Locked` badge and no actions. If the agent never consumes a steer
(failed interrupt, session restart mid-turn), it stays pinned above the chat
input forever with no way to remove it from the UI.

The backend already supports deleting steer rows:
`BunSessionRepository.deletePendingInput()` validates via
`assertDeletablePendingInput()`, which does not restrict by mode (unlike
`assertQueueInput()`, which blocks edit/move/reorder of steers).

## User story

As a user, when a steer pending input gets stuck in the pending rail, I want a
Remove action on the steer row so I can dismiss it without touching the daemon
API directly.

## Acceptance criteria

1. Each steer row in the pending rail shows a Remove (X) button, revealed on
   hover/focus like the queue-row actions.
2. Clicking Remove deletes the steer via the existing
   `sessions.deletePendingInput` route and the row disappears (store filter +
   `pendingInputsChanged` refresh).
3. Queue-row behavior is unchanged (drag reorder, send next, remove).
4. Read-only sessions remain non-interactive (existing guard in `ChatPage`).
5. No changes to shared contracts, routes, or backend handlers (surface already
   exists).

## Non-goals

- Editing or reordering steer items (stays locked).
- Investigating why the agent failed to consume the steer (separate issue).
- Introducing a renderer test harness (no `@testing-library/*` exists in the
  workspace yet; out of scope for this fix).
