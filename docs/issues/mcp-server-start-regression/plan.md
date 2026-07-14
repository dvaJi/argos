# Plan

1. Add daemon-owned startup of enabled MCP servers with per-server failure isolation.
2. Make the renderer store invoke start/stop after enabled-state persistence.
3. Add a direct runtime Start/Stop action that can start an enabled-but-stopped server.
4. Surface runtime action errors from the MCP server list.
5. Repair and extend focused lifecycle tests.
6. Run formatting, lint, type checks, focused tests, and React Doctor.

## Data flow

Daemon boot reads MCP configuration → starts enabled servers through `DaemonMcpRuntime` → `ServerManager` creates clients. UI actions persist configuration through typed routes → invoke typed start/stop routes → refresh runtime status.

## Compatibility

No persisted schema or route shape changes. Plugin-owned servers are excluded from daemon global startup.

