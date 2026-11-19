# MCP Elicitation Bridge — Tasks

- [x] 1. Runtime: `ElicitRequestSchema` handler + capability `elicitation: {}` in the MCP client; `McpHostServices.handleElicitationRequest`/`cancelElicitationRequest` ports.
- [x] 2. Runtime tests: accept-with-content, no-support decline, host-rejection decline, unknown-action → cancel (mcpClient.test.ts).
- [x] 3. Daemon: interactive implementation in `daemonMcpPorts.ts` — `services.handleElicitationRequest` broadcasts `mcp.elicitation.request` (eventPublisher) and awaits the decision; pending map + `elicitationBridge` (`resolveDecision`/`cancelRequest`) exported on the ports; `DaemonMcpRuntime.resolveElicitationDecision`/`cancelElicitation` delegates; dispatcher routes `mcp.submitElicitationDecision` + `mcp.cancelElicitation` wired through `mcpRuntime`.
- [x] 4. Contracts: `McpElicitationRequestPayload`/`McpElicitationDecision` types (shared/core/mcp.ts + presenter barrel); events `mcp.elicitation.request/decision/cancelled` in the catalog; routes `mcp.submitElicitationDecision` + `mcp.cancelElicitation` (428 catalog entries).
- [x] 5. Renderer: `McpClient.onElicitationRequest/onElicitationCancelled/onElicitationDecision/submitElicitationDecision/cancelElicitation`; `mcpElicitation` store (per-session pending request, field values, required validation); `McpElicitationDialog` (message + typed fields + Decline/Cancel/Submit) mounted beside `McpSamplingDialog` in `_main.tsx`.
- [x] 6. Validate: typecheck 17/17 packages, lint (route catalog 428), format, full desktop (211 files / 1813 tests) + daemon suites green.

Remaining MCP ledger: OAuth for remote servers, roots, completions, tasks, resource templates, v2 migration.

