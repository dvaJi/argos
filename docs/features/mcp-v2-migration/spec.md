# MCP v2 Migration

Implements the migration scoped in `evaluation.md`. Phase 1 makes the v2 packages available additively (alongside 1.x) so the runtime can be migrated incrementally without breaking the tree.

## Phase 1: Runtime import swap (in progress)

`packages/mcp-runtime` migrates first — it owns the client, transports, protocol handlers, OAuth provider, and in-memory servers, and is covered by the protocol test surface (`mcpClient.test.ts`, `oauthProvider.test.ts`).

Import mapping (v2 packages export the same class/schema names from their top-level or matching subpaths):

| 1.x import | v2 import |
|---|---|
| `@modelcontextprotocol/sdk/client/index.js` (Client) | `@modelcontextprotocol/client` (Client) |
| `@modelcontextprotocol/sdk/client/{stdio,sse,streamableHttp}.js` | `@modelcontextprotocol/client/{stdio,sse,streamableHttp}.js` (check per-file exports) |
| `@modelcontextprotocol/sdk/inMemory.js` (InMemoryTransport) | `@modelcontextprotocol/client` (InMemoryTransport) |
| `@modelcontextprotocol/sdk/client/auth.js` (OAuthClientProvider, UnauthorizedError, auth) | `@modelcontextprotocol/client` (auth, OAuthClientProvider, UnauthorizedError) |
| `@modelcontextprotocol/sdk/shared/auth.js` (OAuthClientMetadata/Tokens/ClientInformationMixed) | `@modelcontextprotocol/client` |
| `@modelcontextprotocol/sdk/shared/transport.js` (Transport) | `@modelcontextprotocol/client` |
| `@modelcontextprotocol/sdk/types.js` (all schemas/types) | `@modelcontextprotocol/client` or `@modelcontextprotocol/core` |
| `@modelcontextprotocol/sdk/server/index.js` (Server) | `@modelcontextprotocol/server` |
| `@modelcontextprotocol/sdk/inMemory.js` server-side pair | `@modelcontextprotocol/server` |

Behavioral deltas to verify against Argos' surfaces (from v2.4.0 notes): structuredContent unwrapping for `$ref`-rooted object schemas, `x-mcp-header` number rejection, stricter Ajv/fast-uri validation.

## Phase 2 (follow-up)

- Migrate `packages/mcp-runtime` imports + run the protocol test surface.
- Migrate the in-memory servers (`src/inMemory/*`) to `@modelcontextprotocol/server`.
- Drop `@modelcontextprotocol/sdk` from the catalog once no imports remain.
- Desktop-host MCP presenter test fixtures updated.

## Acceptance Criteria (Phase 1)

- v2 packages present in the catalog and installed (additive).
- Runtime typechecks and protocol tests pass **on 1.x still** (Phase 1 is preparation only; the import swap lands in Phase 2 to keep the tree green per-commit).
- Phase-2 tasks documented with the import mapping table.
