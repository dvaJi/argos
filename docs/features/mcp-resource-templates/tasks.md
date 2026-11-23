# MCP Resource Templates — Tasks

- [x] 1. Runtime: `McpClient.listResourceTemplates()` probe + normalization.
- [x] 2. Daemon: `DaemonMcpRuntime.listResourceTemplates()` aggregation; `mcp.listResourceTemplates` route + dispatcher case + catalog (429 entries).
- [x] 3. Renderer: `McpClient.getAllResourceTemplates()`.
- [x] 4. UI: resource templates displayed in the server detail sheet AND in the resources viewer panel (dashed-border cards above the resource list, fetched per server via `getAllResourceTemplates`).

Follow-up: integrate templates into the resources viewer panel's content area (currently shown in the list section only).
