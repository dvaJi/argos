# MCP client route serialization

## User need

The settings UI must be able to load running MCP clients through the daemon without a transport serialization error.

## Goal

Return plain MCP client summaries from `mcp.getClients` instead of live runtime client instances.

## Acceptance criteria

- `mcp.getClients` returns JSON-serializable client summaries.
- Each summary retains the server name, icon, running state, tools, prompts, and resources used by the UI.
- Plugin-owned clients remain visible when global MCP is disabled, matching the existing runtime policy.
- A regression test rejects live/cyclic runtime state at this boundary.

## Constraints

- The daemon remains the owner of MCP runtime state.
- The route contract and UI client API remain compatible.

## Non-goals

- Changing MCP server lifecycle behavior.
- Moving MCP ownership back into the desktop process.

## Open questions

None.
