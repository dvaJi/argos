# Plan: cancel-restarts-generation

## Approach

Suppress the post-settle pending-queue drain for cancelled turns in both execution
ports (`pi-provider-execution.ts`, `acp-provider-execution.ts`):

- `cancelGeneration` adds the session to `drainSuppressedSessions` when aborting.
- The settle hook consumes the flag (`delete`) and skips the drain.
- `sendMessage` clears a stale flag so normal turns drain as before.

## Test strategy

- Existing daemon dispatcher/runtime suites (105 tests) still pass.
- Manual: press STOP during a generation with a queued message; confirm no restart
  and that the queue stays parked.
