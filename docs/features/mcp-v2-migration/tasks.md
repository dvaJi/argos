# MCP v2 Migration — Tasks

## Evaluation (done, confirmed across two independent probes)
- [x] 1. Probe v2 packages: 119 exports, zero zod schemas — handler registration is restructured (typed handler maps, not zod schema objects); `McpError`/`ErrorCode` replaced by `SdkError` and typed error classes.
- [x] 2. Decision: stay on 1.x; re-evaluate quarterly per the trigger criteria in evaluation.md.

## Typecheck probe (confirmed on `migration/mcp-v2-phase2` branch, 2026-11-19)
- [x] Swapped all `@modelcontextprotocol/sdk/*` imports in mcp-runtime to v2 packages (13 files updated).
- [x] Created compat zod schemas (`protocol/v2-schemas.ts`) for all protocol messages.
- [x] Result: **typecheck fails across 10+ files** — in-memory servers, backend-core knowledge server, and runtime all have TS2724 (missing export), TS2345 (type mismatch), TS2305 (missing member), and TS2307 (missing module) errors.
- [x] Root causes confirmed:
  - v2 `Client` class has no `setRequestHandler(zodSchema, handler)` — requires the 3-arg `(method, schemas, handler)` form with custom zod schemas.
  - v2 has no `McpError`/`ErrorCode` — uses `SdkError` with string-based `SdkErrorCode` enum (`NOT_CONNECTED`, `REQUEST_TIMEOUT`, etc.).
  - v2 `Server` constructor/API differs from 1.x `Server` used by all in-memory servers.
  - v2 `OAuthClientProvider` types moved to `shared/auth.js` (now `@modelcontextprotocol/client`).
  - v2 `Client` constructor/options differ (no `capabilities.sampling` etc.).

## Migration (deferred per trigger criteria in evaluation.md)
- [ ] 3. Write custom zod schemas for every protocol message handled by Argos (~15 types).
- [ ] 4. Rewrite `setRequestHandler` calls across all handlers to 3-arg form.
- [ ] 5. Migrate error handling from `McpError`/`ErrorCode` to `SdkError`/`SdkErrorCode`.
- [ ] 6. Migrate in-memory servers to v2 `Server` API.
- [ ] 7. Verify behavioral deltas (structuredContent, x-mcp-header, Ajv strictness).
- [ ] 8. Swap catalog entry and drop 1.x.

**Estimated effort: 3-5 dedicated sessions.** This is not achievable incrementally without breaking the MCP subsystem at each intermediate step.
