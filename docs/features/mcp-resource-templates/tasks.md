# MCP Resource Templates — Tasks

- [x] 1. Runtime: `McpClient.listResourceTemplates()` probe + normalization.
- [x] 2. Daemon: `DaemonMcpRuntime.listResourceTemplates()` aggregation; `mcp.listResourceTemplates` route + dispatcher case + catalog (429 entries).
- [x] 3. Renderer: `McpClient.getAllResourceTemplates()`.
- [x] 4. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.

Follow-up: render templates in the resources UI tab (API surface complete).
