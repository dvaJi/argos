# Plan

1. Convert running daemon MCP clients to the existing `McpClient` summary shape inside `DaemonMcpRuntime`.
2. Preserve filtering and optional prompt/resource discovery behavior from the established MCP presenter implementation.
3. Extend daemon runtime and dispatcher tests to prove the output is a serializable DTO.
4. Run focused tests, type checking, formatting, and linting.
