# MCP v2 Migration

Implements the migration scoped in `evaluation.md`. **Completed** on the `migration/mcp-v2` branch after the user directed the upgrade to the current major version.

## What changed

- **Dependencies**: `@modelcontextprotocol/sdk` (1.x) removed from the catalog, mcp-runtime, and desktop; replaced by `@modelcontextprotocol/client@2.4.0`, `@modelcontextprotocol/server@2.4.0`, `@modelcontextprotocol/core@2.4.0`.
- **Protocol schemas**: all zod schemas (`CallToolRequestSchema`, `ElicitRequestSchema`, `ListRootsRequestSchema`, notification schemas, …) come from `@modelcontextprotocol/core` and are re-exported from `@argos/mcp-runtime` (`protocol/v2-schemas.ts`) for in-memory servers, backend-core's knowledge server, and tests.
- **Errors**: `McpError` → v2 `ProtocolError`, `ErrorCode` → the same numeric JSON-RPC codes (re-exposed via `protocol/errors.ts` with the 1.x shape, plus `RequestTimeout = -32001` kept for the elicitation-abort path).
- **Handler registrations** (the real API delta):
  - Client-side (`mcpClient.ts`): v2 typed-method form — `"sampling/createMessage"`, `"elicitation/create"`, `"roots/list"`; **v2 passes handlers the request's PARAMS directly** (1.x passed the full request), and the context carries the request id under `ctx.mcpReq.id`.
  - Server-side (9 in-memory servers + backend-core knowledge server): v2 3-arg form `setRequestHandler("tools/call", { params: CallToolRequestSchema }, handler)` — passing the full-request schema as `params` preserves the 1.x handler bodies unchanged.
- **Notifications**: typed method strings (`notifications/tools/list_changed`, …).
- **OAuth**: `OAuthClientProvider` + metadata/token types from the v2 client root; the provider interface is member-compatible with our implementation.
- **Transports**: unchanged shapes — `StdioClientTransport` (now at the `/stdio` subpath), `SSEClientTransport`, `StreamableHTTPClientTransport`, `InMemoryTransport.createLinkedPair()`.
- **Tasks (experimental)**: the 1.x `experimental.tasks.callToolStream` API does not exist in v2; `callTool` uses the plain request (the duck-typed stream detection remains, so it lights up again if a future SDK exposes a stream API). v2-native task augmentation (`_meta` task params + `tasks/get`) is a follow-up.
- **Downstream**: desktop `appleServer.ts` and 5 test files import via `@argos/mcp-runtime` or the v2 packages; the client test's SDK mock now includes `ProtocolError`/`UnauthorizedError`/`ProtocolErrorCode`.

## Validation

- typecheck 17/17 packages (0 errors) with 1.x fully removed
- desktop suite 212 files / 1826 tests green; daemon suite green
- lint + format clean

## Follow-ups

- v2-native task augmentation for tool calls (SEP-1686 via `_meta` task params)
- Behavioral deltas to observe in real usage: structuredContent unwrapping for `$ref` schemas, `x-mcp-header` number rejection, Ajv validation strictness
