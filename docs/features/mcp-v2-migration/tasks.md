# MCP v2 Migration — Tasks

## Migration (COMPLETE on `migration/mcp-v2`, user-directed)

- [x] 1. v2 packages installed (client/server/core @ 2.4.0); 1.x removed from catalog, mcp-runtime, and desktop.
- [x] 2. Compat layer: `protocol/v2-schemas.ts` (schema re-exports from `@modelcontextprotocol/core`) + `protocol/errors.ts` (`McpError` = v2 `ProtocolError`; `ErrorCode` = numeric JSON-RPC codes incl. `RequestTimeout`).
- [x] 3. `mcpClient.ts` on v2 `Client`: typed-method handler registrations (sampling/elicitation/roots — handlers receive PARAMS directly, ctx.mcpReq.id), typed-method notifications, unchanged convenience methods/transports/capabilities.
- [x] 4. Error handling on v2 `ProtocolError`/`ProtocolErrorCode` (identical numeric codes; `isUnsupportedCapabilityError` maps to MethodNotFound).
- [x] 5. 9 in-memory servers + backend-core knowledge server on v2 `Server` with the 3-arg `(method, schemas, handler)` form (full-request schema as params → 1.x handler bodies preserved).
- [x] 6. OAuth provider on v2 `OAuthClientProvider` + types from the client root.
- [x] 7. Desktop `appleServer.ts` + 5 test files migrated; SDK mock updated (ProtocolError/UnauthorizedError included).
- [x] 8. Validation: typecheck 17/17 with 1.x removed, desktop 212 files / 1826 tests green, daemon suite green, lint + format clean.

## Deferred follow-ups

- [ ] v2-native task augmentation for tool calls (`_meta` task params + `tasks/get` polling) — the 1.x experimental stream API is gone in v2; `callTool` currently uses the plain request.
- [ ] Observe behavioral deltas in real usage: structuredContent unwrapping, `x-mcp-header` number rejection, Ajv strictness.
