# Plan: Pi Worker Permission Deny Terminates Batch

## Approach

Single edit in `apps/daemon/src/host/piWorker.ts` (`createHostExtension`): when the permission grant is denied, return `terminate: true` alongside `block: true` and the existing reason.

## Data Flow

```text
User denies -> permissionRequest -> daemon sends permissionResponse(granted=false)
  -> piWorker createHostExtension returns { block: true, reason, terminate: true }
  -> Pi agent skips the follow-up model call for a fully-blocked batch
```

## Affected Files

- `apps/daemon/src/host/piWorker.ts` — return `terminate: true` on deny.

## Compatibility

- `terminate` is optional on `ToolCallEventResult`; older semantics (block-only) are preserved when the field is absent. The 0.84.1 runtime supports it.
- Early termination only applies when every finalized tool result in the batch is blocked, which matches the deny path.

## Test Strategy

- Add a daemon regression test asserting that a denied `permissionRequest` makes `createHostExtension` return `{ block: true, reason, terminate: true }` and that a fully-denied batch suppresses the follow-up model call.
- Existing `apps/daemon/test/piWorker.test.ts` covers worker startup and the permission round-trip path (exercised through the host extension). Rely on typecheck + daemon suite.
