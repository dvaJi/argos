# MCP market list response

## User need

The MCP Market must load the MCPRouter server catalog without route validation errors.

## Goal

Normalize the MCPRouter `data.servers` response envelope into the array returned by Argos's `mcp.listMcpRouterServers` route.

## Acceptance criteria

- The daemon route returns `{ servers: MarketServer[] }`, never a nested `{ servers: { servers: [...] } }` value.
- The route accepts the documented MCPRouter server fields, where `uuid` is not guaranteed.
- Market cards use the documented `server_key` as their stable React key.
- Empty or missing upstream data becomes an empty array.

## Constraints

- Keep the UI client return type as a server array.
- Normalize the third-party response in the daemon-owned MCP config facade.
- Preserve compatibility if MCPRouter includes `uuid` in some responses.

## Non-goals

- Redesigning the market UI.
- Changing server installation behavior.

## Open questions

None.
