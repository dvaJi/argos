# MCP Elicitation Bridge

## User Need

MCP servers can elicit structured input from the user mid-tool-call (`elicitation/create`, client capability `elicitation: {}`): a message plus a primitive-typed JSON schema (form), answered with `{ action: "accept"|"decline"|"cancel", content? }`. Argos' client never advertised the capability or registered a handler, so capable servers could not ask.

## Goal

Handle `elicitation/create` in the MCP client runtime, routed to the host's interactive surface (mirroring the sampling flow: handler → `McpHostServices` → pending + renderer decision event → respond).

## Status

- **Runtime (done):** `ElicitRequestSchema` handler registered; capability `elicitation: {}` advertised; `McpHostServices.handleElicitationRequest` / `cancelElicitationRequest` ports added; host rejections map to `decline`, aborts to `-32800`, unknown actions normalize to `cancel`; unit-tested (accept with content, no-support decline, host-rejection decline, unknown-action cancel).
- **Host/UI slices (next, designed below):** interactive implementations on both hosts + renderer overlay.

## Host/UI Design (next slice)

1. **Desktop presenter** (`mcpPresenter/index.ts`) — mirror sampling: `handleElicitationRequest(payload)` stores a pending entry keyed by `payload.requestId`, broadcasts `mcp:elicitation-request` (new `MCP_EVENTS.ELICITATION_REQUEST`), listens for `mcp:elicitation-decision` to resolve; `cancelElicitationRequest` rejects the pending.
2. **Daemon ports** (`daemonMcpPorts.ts`) — same, using `eventPublisher` for the broadcast; the decision returns via a new `mcp.respondElicitation` route wired into the dispatcher (needs the MCP ports instance passed to the dispatcher factory).
3. **Renderer** — `mcpElicitation` store (mirroring `mcpSampling.ts`): consumes `mcp:elicitation-request`, renders a dialog with the message + form fields (reuse the ACP overlay's field rendering patterns), submits the decision event; add `ELICITATION_REQUEST`/`ELICITATION_DECISION` to both events maps.
4. Payload/decision types: `McpElicitationRequestPayload { requestId, serverName, message, requestedSchema }` and `McpElicitationDecision { requestId, action, content? }` in shared presenter types.

## Constraints

- Payload/decision cross the port as `unknown`-typed structures (host-agnostic), like sampling.
- Never auto-accept: elicitation is inherently interactive.

## Non-Goals

- MCP tasks/completions/roots/OAuth/v2 (separate ledger items).
- Request-scoped ACP elicitation (ACP-side gap, separate goal).
