# Pi Worker Permission Deny Terminates Batch

Last reviewed: 2026-08-13

## Background

Pi 0.84.1 added `terminate` support to blocked extension `tool_call` events: a blocked tool call can hint that the agent should stop after the current tool batch, skipping the automatic follow-up model call. Argos's Pi worker enforces permissions through the `argos-host` inline extension (`apps/daemon/src/host/piWorker.ts`, `createHostExtension`), which returns `{ block: true, reason: "Denied by the user" }` when the user denies a permission request. Without `terminate`, Pi's agent loop continues with a follow-up model call after a fully-denied batch, wasting a turn and prompting the model to try something else even though the user just said no.

## Goal

When every tool call in the current batch is denied by the user, the Pi agent should stop after the batch instead of running another model call.

## Success Criteria

- In `createHostExtension` (`piWorker.ts`), a denied permission returns `{ block: true, reason, terminate: true }` per the Pi 0.84+ `ToolCallEventResult` shape.
- Granted/full-access paths are unchanged.
- Daemon typecheck passes; existing Pi worker test suite passes.

## Non-Goals

- No change to the permission protocol between worker and daemon (`permissionRequest`/`permissionResponse`).
- No change to steering/follow-up behavior while streaming.
- No UI changes.

## References

- Pi changelog 0.84.1 "Terminating blocked tool calls": `docs/extensions.md#tool-events`.
- `ToolCallEventResult` in `apps/daemon/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` (`block?`, `reason?`, `terminate?`).

## Open Questions

None.