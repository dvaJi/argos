# MCP Tasks — Tasks

- [x] 1. Runtime: task-stream-aware `callTool` (`callToolWithTaskStream` + fallback), `experimental.tasks: { list, cancel }` capability.
- [x] 2. Tests: stream-to-result, error propagation, fallback, progress broadcast (mcpClient.test.ts).
- [x] 3. Progress events: `taskCreated`/`taskStatus` messages broadcast as `mcp:tool-call-progress` events (serverName/toolName/toolCallId/taskId/status/statusMessage) on the host events bus.
- [x] 4. Correlation: `ToolManager.callTool` threads the LLM `toolCall.id` into `McpClient.callTool` → task stream → progress events, so renderer consumers can match progress to the chat's tool_call blocks.
- [x] 5. Renderer: `mcpTaskProgress` store (keyed by toolCallId when present, else taskId) + `McpTaskProgressIndicator` mounted above the composer in ChatPage; `useMcpToolCallProgress(toolCallId)` hook; terminal states remove rows after a 3s delay.
- [x] 6. Chat-block integration: `MessageBlockToolCall` consumes `useMcpToolCallProgress(block.tool_call.id)` and renders the live status message inside the tool-call pill while the block is running (`tool-call-mcp-progress`).
