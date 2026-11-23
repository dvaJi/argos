# MCP OAuth — Plan

1. **Ports**: `McpHostServices.openExternal/readJsonFile/writeJsonFile` (host-agnostic `unknown` payloads, mirroring sampling).
2. **Provider**: `ArgosOAuthClientProvider implements OAuthClientProvider` (`client/auth.js` types from `shared/auth.js` for OAuthClientMetadata/Tokens/ClientInformationMixed). Loopback `node:http` server on 127.0.0.1:0 catches `/callback` with a 5-minute timeout and an HTML "you can close this window" response. Storage keys: `mcp-oauth:<serverName>:{client,tokens,verifier}` (+ scoped invalidation).
3. **Client wiring**: `serverConfig.oauth === true` → `getOAuthProvider()` passed as `authProvider` to the SSE / Streamable HTTP transports. `connect` catches `UnauthorizedError` → `waitForAuthorization()` → `cleanupResources()` → single retry (`oauthRetryCount <= 1`).
4. **Daemon**: `openExternal` spawns the system browser (win32/darwin/xdg-open); JSON storage via `createJsonStoreFactory(configDir)("mcp-oauth")`.

Desktop-host parity and the sign-out UI are follow-ups; the flag is opt-in so nothing changes for existing servers.
