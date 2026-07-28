# Pi worker stdout protocol test

## Goal

Make the daemon's Pi worker integration test consume only valid worker protocol
events so unrelated library diagnostics on stdout do not produce a misleading
test-side `undefined` error.

## Acceptance criteria

- The test rejects explicit worker `error` events with a string message.
- Non-protocol stdout lines are retained as diagnostics and do not masquerade
  as worker events.
- A missing `ready` event still fails with captured diagnostics.

## Constraints

- Do not weaken the worker readiness assertion.
- Do not change production worker semantics for a test fixture issue.
