# Plan

1. Add a typed `healthCheck` ACP debug action.
2. Implement it as `session/new` with an empty MCP list after the existing initialized connection is available.
3. Close the probe session when the agent advertises session close, then clear local session bookkeeping in all cases.
4. Add process-manager-scoped single-flight protection keyed by agent and workspace.
5. Switch ACP settings connection checks from the shallow initialize action to the deep health action.
6. Cover success, wrapper failure, cleanup, and concurrent request behavior with focused tests.
7. Run formatting, lint, typecheck, focused tests, and React Doctor regression checks.

## Compatibility

- Existing debug actions remain unchanged.
- Agents without `session/close` can still be checked; their local probe state is cleared and no prompt is sent.
- Native and wrapper ACP agents follow the same protocol-level test.
