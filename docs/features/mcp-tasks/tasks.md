# MCP Tasks — Tasks

- [x] 1. Runtime: task-stream-aware `callTool` (`callToolWithTaskStream` + fallback), `experimental.tasks: { list, cancel }` capability.
- [x] 2. Tests: stream-to-result, error propagation, fallback (mcpClient.test.ts).
- [x] 3. Progress: `taskCreated`/`taskStatus` messages broadcast as `mcp:tool-call-progress` events (serverName/toolName/taskId/status/statusMessage) on the host events bus. Test: two status events observed around the final result.
- [x] 4. Renderer: `mcpTaskProgress` store + `McpTaskProgressIndicator` strip above the composer — listens for `mcp:tool-call-progress` events, shows per-task rows (spinner + tool name + status message), removes rows on terminal states after a 3s delay. Hidden when no tasks are in-flight.
