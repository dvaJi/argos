# MCP OAuth — Tasks

- [x] 1. `McpHostServices`: `openExternal`, `readJsonFile`, `writeJsonFile` ports.
- [x] 2. Runtime: `ArgosOAuthClientProvider` (loopback callback server, persisted tokens/client/verifier via host services, browser hand-off) in `oauthProvider.ts`.
- [x] 3. Runtime: transports accept the `authProvider`; `connect` handles `UnauthorizedError` → wait for authorization → single retry.
- [x] 4. Daemon host: `openExternal` (system browser), `readJsonFile`/`writeJsonFile` via the daemon config dir.
- [x] 5. Desktop host parity: `openExternal` via Electron `shell`, JSON storage under the Electron userData dir (`mcp-oauth.json` via `oauthStorage.ts`).
- [x] 6. Sign-out: `McpClient.invalidateCredentials` → `ServerManager.invalidateCredentials` → `DaemonMcpRuntime.invalidateOAuthCredentials` → `mcp.invalidateOAuthCredentials` route; renderer `McpClient.invalidateOAuthCredentials`; "Sign out" button on OAuth server detail sheets (tokens scope) with toasts.
- [x] 7. Tests: `oauthProvider.test.ts` — loopback callback capture + timeout rejection, storage round-trip, scoped invalidation (4 tests).
- [x] 8. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.
- [x] 9. Sign-out scope UI: the detail sheet offers "Sign out" (tokens — keeps client registration for faster re-auth) and "All" (invalidates tokens, client registration, verifier, discovery) with per-scope toast descriptions.
- [x] 10. Server-config toggle UX: the server form gains an OAuth checkbox in the remote (SSE/HTTP) section — state + `SET_OAUTH` reducer action + submit wiring (`oauth` on the server config); `MCPServerConfig.oauth?: boolean` is now a typed field (the detail sheet reads it without casts).

Follow-ups: desktop-host end-to-end validation with a running desktop instance (requires an interactive session).
