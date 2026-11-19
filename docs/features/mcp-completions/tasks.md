# MCP Completions — Tasks

- [x] 1. Runtime: `McpClient.completeArgument()` probe (graceful empty for unsupported servers).
- [x] 2. Daemon: `DaemonMcpRuntime.completeArgument` + `toolManager.completeArgumentByClient` + `mcp.completeArgument` route + dispatcher case + catalog.
- [x] 3. Renderer: `McpClient.completeArgument` API.
- [x] 4. UI: `PromptArgumentFields` component (per-argument inputs, debounced server completions, suggestion dropdowns) + `PromptRunCard` Fields/JSON toggle, field→JSON sync on edit, required-field gating.
- [x] 5. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.

Follow-up: resource-template argument completions in the resources viewer (same route, `ref/resource_template`).
