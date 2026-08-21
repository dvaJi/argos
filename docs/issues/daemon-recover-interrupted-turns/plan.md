# Plan: recover interrupted turns on daemon restart

## Design

Single recovery pass in the repository (owns the data), invoked once from `index.ts` startup,
right after `deactivate(0)`. The daemon just booted, so **any** session still marked `generating`
is by definition orphaned (no turn can be running).

```
startup → repo.recoverInterruptedTurns()
  for each session WHERE generation_status = 'generating':
    last assistant message:
      - blocks = parsed content (or [])
      - flip every block with status 'loading' → 'error'
      - if no visible block remains → append { type: "error", content: INTERRUPTED_MSG, status: "error" }
      - setMessageError(messageId, blocks, {"runtime": "recovery"})   // sets message status = 'error'
    setSessionStatus(sessionId, 'error')
  return recovered session ids → index.ts publishes sessions.status.changed per session
```

Notes:
- Only the **last** assistant message per session is touched — the in-flight one; older messages
  were finalized by their turns.
- Partial streamed content (text deltas, completed tool calls) is preserved; only `loading`
  blocks are flipped, and the trailing error block explains why.
- Message metadata gets `{"runtime": "recovery"}` so traces can distinguish recovery from runtime
  failures.

## Files

- `apps/daemon/src/host/bun-session-repository.ts` — `recoverInterruptedTurns()`.
- `apps/daemon/src/index.ts` — call it at startup; publish `sessionsStatusChangedEvent` for each
  recovered session; log a summary line.

## Test strategy

Repository-level bun test on an in-memory DB:
- generating session with empty last assistant message → message gains error block + `error`
  status; session → `error`.
- generating session with partial blocks (loading tool call + settled text) → loading flipped,
  settled preserved.
- non-generating sessions untouched; no generating sessions → no-op.
