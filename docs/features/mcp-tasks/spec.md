# MCP Tasks (Experimental)

## User Need

Servers with task augmentation (SEP-1686, experimental) run long tools asynchronously: the `tools/call` response is a `CreateTaskResult` (taskId + status), the client observes `taskCreated`/`taskStatus` updates and fetches the final result. Argos' plain `callTool` would break against such servers (no `content` in a task-creation response).

## Goal

Task-aware tool calls: prefer the SDK's `client.experimental.tasks.callToolStream` (yields `taskCreated`/`taskStatus`/`result`/`error` messages, terminal on `result` or `error`), fall back to the plain request when unavailable, and advertise `experimental.tasks: { list, cancel }`.

## Status

- **Runtime (done):** `callTool` routes through `callToolWithTaskStream` when the SDK exposes it; the final result maps through the existing error/content handling; stream errors propagate; fallback preserved. Capability advertised. Unit tests: stream-to-result, stream-error propagation, fallback.
- **Follow-ups:** surface `taskStatus` updates as tool-call progress in the UI; `tasks/list` + `tasks/cancel` UI (cancel is advertised for protocol completeness).

## Non-Goals

- Task-augmented sampling/elicitation requests (`requests.sampling/elicitation.create` client sub-capabilities) — Argos answers sampling/elicitation interactively and synchronously.
- Persisting task state across restarts.
