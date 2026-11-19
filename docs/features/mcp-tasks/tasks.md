# MCP Tasks — Tasks

- [x] 1. Runtime: task-stream-aware `callTool` (`callToolWithTaskStream` + fallback), `experimental.tasks: { list, cancel }` capability.
- [x] 2. Tests: stream-to-result, error propagation, fallback, progress broadcast (mcpClient.test.ts).
- [x] 3. Progress: `taskCreated`/`taskStatus` messages broadcast as `mcp:tool-call-progress` events (serverName/toolName/taskId/status/statusMessage) on the host events bus.
- [x] 4. Renderer: `mcpTaskProgress` store + `McpTaskProgressIndicator` component mounted above the composer in ChatPage. Tracks in-flight tasks keyed by taskId, shows spinner + tool name + status message, removes rows on terminal states after 3s delay.
