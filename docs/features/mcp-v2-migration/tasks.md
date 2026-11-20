# MCP v2 Migration — Tasks

## Migration (COMPLETE on `migration/mcp-v2`, user-directed)

- [x] 1. v2 packages installed (client/server/core @ 2.4.0); 1.x removed from catalog, mcp-runtime, and desktop.
- [x] 2. Compat layer: `protocol/v2-schemas.ts` (schema re-exports from `@modelcontextprotocol/core`) + `protocol/errors.ts` (`McpError` = v2 `ProtocolError`; `ErrorCode` = numeric JSON-RPC codes incl. `RequestTimeout`).
- [x] 3. `mcpClient.ts` on v2 `Client`: typed-method handler registrations (sampling/elicitation/roots — handlers receive PARAMS directly, ctx.mcpReq.id), typed-method notifications, unchanged convenience methods/transports/capabilities.
- [x] 4. Error handling on v2 `ProtocolError`/`ProtocolErrorCode` (identical numeric codes; `isUnsupportedCapabilityError` maps to MethodNotFound).
- [x] 5. 9 in-memory servers + backend-core knowledge server on v2 `Server` with the 3-arg `(method, schemas, handler)` form. **Correction (found by the live-connection test):** v2 validates and forwards request PARAMS, so server-side registrations use params-only loose schemas (`ToolsCallParamsSchema`/`ToolsListParamsSchema` — core's `*RequestSchema` exports are full-request shapes with `method` literals that fail params validation); handler bodies receive parsed params.
- [x] 6. OAuth provider on v2 `OAuthClientProvider` + types from the client root.
- [x] 7. Desktop `appleServer.ts` + 5 test files migrated; SDK mock updated (ProtocolError/UnauthorizedError included).
- [x] 8. Validation: typecheck 17/17 with 1.x removed, desktop 212 files / 1826 tests green, daemon suite green, lint + format clean.

## Post-migration follow-ups

- [x] **v2-native task augmentation (SEP-1686)**: `callToolWithTaskAugmentation` gates on `tasks.requests.tools.call` capability, sends task-creation params on `tools/call`, polls `tasks/get` (honoring server `pollInterval`, broadcasting `mcp:tool-call-progress` with the LLM toolCallId per poll), fetches the final result via `tasks/result`. Tests: augment-to-result, progress correlation, failure propagation, plain fallback.
- [x] **Behavioral verification on a real v2 connection** (`v2Behavior.test.ts`): tools/list + tools/call round-trip, structuredContent passthrough on matching outputSchema, Ajv strictness (non-matching structuredContent rejected client-side). The 2026-era deltas (structuredContent `$ref`-rooted unwrapping, `x-mcp-header` body-derived headers) are **dormant by design** — v2 negotiates the `legacy` era by default; they activate only if a connection opts into `mode: "auto"` (not used by Argos).
