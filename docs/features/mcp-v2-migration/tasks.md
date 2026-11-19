# MCP v2 Migration — Tasks

## Evaluation (done)
- [x] 1. Probe v2 packages: 119 exports, zero zod schemas — handler registration is restructured (typed handler maps, not zod schema objects); `McpError`/`ErrorCode` replaced by `SdkError` and typed error classes. Confirmed via runtime CJS require probe against client@2.4.0.
- [x] 2. Decision: stay on 1.x; re-evaluate quarterly per the trigger criteria in evaluation.md.

## Migration (blocked: rearchitecture effort, not a package swap)
- [ ] 3. Rewrite `setRequestHandler` registration across elicitation/roots/sampling/completion/notification handlers to the v2 typed-handler-map pattern.
- [ ] 4. Migrate `McpError`/`ErrorCode` error handling to `SdkError`/typed error classes.
- [ ] 5. Migrate in-memory servers (`src/inMemory/*`) to the v2 `Server` API.
- [ ] 6. Verify behavioral deltas: structuredContent unwrapping, `x-mcp-header` number rejection, Ajv/fast-uri validation strictness.
- [ ] 7. Swap the catalog entry, drop 1.x, run the full protocol test surface.
