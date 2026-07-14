# Plan

1. Unwrap `McpRouterManager.listServers()` to an array in `DaemonMcpConfig`.
2. Align the shared route schema and UI item type with the documented optional `uuid` field.
3. Use `server_key` for list identity.
4. Add daemon facade and dispatcher regression tests using the official response shape.
5. Run focused tests, type checking, React Doctor, formatting, and linting.
