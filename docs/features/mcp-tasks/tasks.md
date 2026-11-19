# MCP Tasks — Tasks

- [x] 1. Runtime: task-stream-aware `callTool` (`callToolWithTaskStream` + fallback), `experimental.tasks: { list, cancel }` capability.
- [x] 2. Tests: stream-to-result, error propagation, fallback (mcpClient.test.ts).
- [x] 3. Progress: `taskCreated`/`taskStatus` messages broadcast as `mcp:tool-call-progress` events (serverName/toolName/taskId/status/statusMessage) on the host events bus, so both hosts surface long-running tool progress to renderers. Test: two status events observed around the final result.
- [ ] 4. Follow-up: renderer consumption of `mcp:tool-call-progress` for per-tool-call progress rows in the chat pipeline (events bus → presenter wiring).
