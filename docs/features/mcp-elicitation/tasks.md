# MCP Elicitation Bridge — Tasks

- [x] 1. Runtime: `ElicitRequestSchema` handler + capability `elicitation: {}` in the MCP client; `McpHostServices.handleElicitationRequest`/`cancelElicitationRequest` ports.
- [x] 2. Runtime tests: accept-with-content, no-support decline, host-rejection decline, unknown-action → cancel (mcpClient.test.ts).
- [ ] 3. Desktop presenter: interactive `handleElicitationRequest`/`cancelElicitationRequest` (pending map + `mcp:elicitation-request` broadcast + decision listener), mirroring sampling.
- [ ] 4. Daemon: interactive implementation in `daemonMcpPorts.ts` (eventPublisher broadcast) + `mcp.respondElicitation` route + dispatcher wiring (pass MCP ports instance).
- [ ] 5. Shared types: `McpElicitationRequestPayload` / `McpElicitationDecision`; events `mcp:elicitation-request` / `mcp:elicitation-decision` in both events maps.
- [ ] 6. Renderer: `mcpElicitation` store + dialog overlay (form fields from `requestedSchema`) + decision submission.
- [ ] 7. Validate: typecheck, lint, format, suites.
