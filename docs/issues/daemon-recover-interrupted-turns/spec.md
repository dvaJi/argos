# Spec: Recover interrupted turns on daemon restart

## Problem

When the daemon dies mid-turn (crash, dev restart, update), the turn is orphaned:

1. The session row keeps `generation_status = 'generating'` forever → the sidebar shows a permanent
   working/loading indicator.
2. The in-flight assistant message keeps its streamed state: `content = []` (empty) or blocks with
   `status: "loading"` and message `status = 'sent'` → the chat renders an **empty assistant
   bubble** with no explanation (user-visible HTML shows a bare message row with no content).

Nothing at daemon startup reconciles these. Desktop had explicit recovery ("pending messages are
recovered to error status on init"); the daemon port dropped it.

## User story

As a user, after the app/daemon restarts during a generation, I want the affected session to show
an explicit error state ("turn was interrupted") instead of an eternal spinner and an empty
message — and I want to be able to send a new message immediately.

## Acceptance criteria

- On daemon startup, every session with `generation_status = 'generating'` transitions to `error`.
- The interrupted turn's last assistant message is finalized: streaming (`loading`) blocks flip to
  `error`, and an empty message gains an `error` block explaining the interruption — the UI
  renders it via the existing `MessageBlockError`.
- Settled content is preserved (partial text/tool results already persisted stay visible).
- `sessions.status.changed` is published for each recovered session so connected clients update
  immediately; a later reconnect/reload also sees the corrected state.
- Recovery is idempotent and safe when there is nothing to recover.

## Non-goals

- Resuming/replaying the interrupted agent turn.
- Recovering Pi in-memory queue state (worker processes are gone; their queue dies with them).
- Changing the pending-input lane (drain logic lives in docs/issues/daemon-pending-input-drain).

## Root cause references

- `apps/daemon/src/index.ts` startup: `sessionRepository.deactivate(0)` only — no orphan handling.
- `apps/daemon/src/host/bun-session-repository.ts`: `addMessage` inserts assistant rows as `sent`
  immediately; only `finalizeAssistantMessage`/`setMessageError` (called at turn end) close them.
