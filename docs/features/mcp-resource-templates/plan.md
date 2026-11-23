# MCP Resource Templates — Plan

Mirror the `listResources` chain:

1. `mcpClient.ts` — `listResourceTemplates()` probe via the SDK's `client.listResourceTemplates()`, unsupported-capability → `[]`, response normalization.
2. `DaemonMcpRuntime.listResourceTemplates()` — same enabled/running-client filter and `client` attribution as `listResources`.
3. Contract route `mcp.listResourceTemplates` (output `{ templates: [ResourceTemplateEntry] }`) + catalog registration.
4. Dispatcher case + `mcpRuntime` literal type method.
5. Renderer `McpClient.getAllResourceTemplates()`.
