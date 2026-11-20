# MCP Completions — Tasks

- [x] 1. Runtime: `McpClient.completeArgument()` probe (graceful empty for unsupported servers).
- [x] 2. Daemon: `DaemonMcpRuntime.completeArgument` + `toolManager.completeArgumentByClient` + `mcp.completeArgument` route + dispatcher case + catalog.
- [x] 3. Renderer: `McpClient.completeArgument` API.
- [x] 4. UI: `PromptArgumentFields` component (per-argument inputs, debounced server completions, suggestion dropdowns) + `PromptRunCard` Fields/JSON toggle, field→JSON sync on edit, required-field gating.
- [x] 5. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.
- [x] 6. UI consumer: `PromptArgumentFields` in the prompt panel (Fields mode with debounced server completions, suggestion dropdowns, required gating, field→JSON sync) **and** `ResourceTemplateCompletions` in the resources viewer — per-`{placeholder}` inputs for resource templates via `ref/resource_template` completions with a composed-URI preview.

Follow-up: prompt-argument completions in the chat composer for MCP-tool args (the settings surfaces cover prompt and resource-template arguments).
