# Plan: Pi Worker Bash Output Streaming

## Approach

Three small, additive changes along the existing event path:

1. **Protocol** (`piWorkerProtocol.ts`): add `| { type: "bashUpdate"; toolCallId?: string; delta: string }` to `PiWorkerEvent`.
2. **Worker** (`piWorker.ts`): handle `bash_execution_update` in `handleSessionEvent` and emit `bashUpdate` with `toolCallId: event.id`.
3. **Daemon** (`pi-provider-execution.ts`): handle `bashUpdate` in `onEvent`, appending the delta to the active turn's matching tool block (by `toolCallId`, falling back to the most recent `tool_call` block) and republishing the snapshot via `publishSnapshot`.

## Data Flow

```
bash tool emits chunk -> session emits bash_execution_update { id, delta }
  -> piWorker emits bashUpdate { toolCallId: id, delta }
  -> daemon appends delta to tool block.tool_call.response (status loading)
  -> publishSnapshot -> chat.stream.updated (snapshot) -> existing renderer
```

## Affected Files

- `apps/daemon/src/host/piWorkerProtocol.ts`
- `apps/daemon/src/host/piWorker.ts`
- `apps/daemon/src/host/pi-provider-execution.ts`

## Compatibility

- `bash_execution_update` is a new session event type in 0.84.x; the event union already includes it, so `handleSessionEvent` exhaustiveness and typecheck hold.
- The daemon handler is purely additive; missing tool-call matches degrade to the most recent tool block and otherwise no-op.

## Test Strategy

- Extend `apps/daemon/test/piWorker.test.ts` or add a focused daemon test asserting `bashUpdate` is emitted for a `bash_execution_update` session event and that the daemon appends the delta to the tool block.
- Run the full daemon suite.