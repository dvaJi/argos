# MCP Resource Templates

## User Need

MCP servers expose parameterized resources via `resources/templates/list` (a server capability; clients just call it). Argos' client never called it, so templated resources were invisible.

## Goal

Expose `resources/templates/list` through the full Argos chain (runtime client → ServerManager aggregation → DaemonMcpRuntime → `mcp.listResourceTemplates` route → renderer API), mirroring `listResources`.

## Acceptance Criteria

1. `McpClient.listResourceTemplates()` best-effort probe: servers without template support return `[]` (unsupported-capability probes stay quiet), entries normalized to `{ uriTemplate, name?, description?, mimeType? }`.
2. `DaemonMcpRuntime.listResourceTemplates()` aggregates across running, enabled clients with `client` attribution (name + icon), mirroring `listResources`.
3. `mcp.listResourceTemplates` route (output `{ templates: [...] }`) registered in the catalog and dispatched; renderer `McpClient.getAllResourceTemplates()` exposed.
4. Typecheck 17/17, lint, format, suites pass.

## Constraints / Non-Goals

- No UI surface yet (templates listing is an API surface; a resources-tab consumer is a follow-up).
- No caching (templates are cheap and rarely re-listed).
