# Spec: Streaming UI stalls until the session is switched

## Problem

User report: occasionally the chat UI stays stuck "streaming" (spinner, no new content) until the
user switches to another thread and back — after which the message shows as complete. Renderer
logs from a stuck turn:

```
messageIpc.ts:40 [chat] stream.updated ← f0bd8c5b… session= acf4db7a… blocks= 86 content= …
messageIpc.ts:40 [chat] stream.updated ← f0bd8c5b… blocks= 86 …            (identical)
threadSidebar.ts:86 [threadSidebar] Failed to load experiment flag: Error: Request timeout
9messageIpc.ts:40 [chat] stream.updated ← f0bd8c5b… blocks= 86 …           (identical ×9)
ChatPage.tsx:793 [Startup][Renderer] ChatPage restoring session …          (switch)
message.ts:302 [chat] loadMessages: 30 messages for acf4db7a…               (message complete in DB)
```

Findings:

1. The backend **did** finalize the assistant turn (switching back re-fetches the completed
   message), but no `[chat] stream.completed ←` line ever appeared — the completion event was
   lost or never delivered, so `streamStateStore.isStreaming` stayed `true`.
2. `stream.updated` events kept re-arriving with a **frozen** snapshot (identical `blocks= 86`
   payload ~11 times) — stale republication, not progress.
3. A route invoke over the same WebSocket timed out (`Request timeout`, the bridge's 30s limit)
   while events still flowed — the daemon was briefly not answering requests during the heavy
   turn. `pi-provider-execution.publishSnapshot` persists the **entire** blocks array to the DB on
   every publish (per delta/tool event); over a long tool-heavy turn this is O(n²) serialization +
   write load, contradicting its own comment ("Persistence is not on the streaming hot path").
4. The renderer has **no recovery path**: `isStreaming` only clears on
   `stream.completed`/`stream.failed`/legacy end/error or on session switch
   (`clearStreamingState`). If the completion event is lost (WS drop/reconnect gap, daemon wedge),
   the UI spins forever. There is also no guard against a stale `stream.updated` re-sticking the
   UI after completion.

## User stories

- As a user, if stream events stop arriving, the UI must recover on its own instead of spinning
  until I manually switch threads.
- As a user, a stale stream snapshot must never resurrect a stream that already completed.
- As a user, a long agentic turn must not make the rest of the app (routes, sidebar) time out.

## Acceptance criteria

1. `stream.updated` payloads for a requestId that already completed/failed are ignored (no
   `setStream`, no re-stick).
2. While the UI is streaming for the active session, a silence watchdog (no `stream.updated` for
   120s) triggers the same recovery as completion: clear streaming state + reload persisted
   messages, with a single console warning. Live updates that resume afterwards re-set the
   streaming state naturally.
3. A `stream.completed`/`stream.failed` for a requestId other than the currently tracked stream
   does not wipe the active stream's UI state.
4. The pi runtime persists stream snapshots at most ~once per second per session (leading + a
   guarded trailing flush); the final content is still persisted exactly once by
   `finalizeAssistantMessage` on settle, and a trailing flush can never overwrite a finalized
   message.
5. No changes to event contracts or route schemas.

## Non-goals

- Diagnosing the specific hung tool call that froze the underlying turn (agent-runtime concern).
- Replaying missed events on WS reconnect (transport-level redesign).
- Changing the ACP runtime's publication cadence (it does not persist per-event).

## Constraints

- Watchdog threshold must tolerate legitimately slow tools (a 66s webhook wait is normal in this
  workload) — 120s chosen.
- Recovery must be self-correcting: if the stream is actually still running, the next
  `stream.updated` re-enters the streaming state.
- The pi persistence throttle must preserve crash-recovery granularity reasonably (≤1s of loss).
