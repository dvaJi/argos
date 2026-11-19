# MCP OAuth — Tasks

- [x] 1. `McpHostServices`: `openExternal`, `readJsonFile`, `writeJsonFile` ports.
- [x] 2. Runtime: `ArgosOAuthClientProvider` (loopback callback server, persisted tokens/client/verifier via host services, browser hand-off) in `oauthProvider.ts`.
- [x] 3. Runtime: transports accept the `authProvider`; `connect` handles `UnauthorizedError` → wait for authorization → single retry.
- [x] 4. Daemon host: `openExternal` (system browser), `readJsonFile`/`writeJsonFile` via the daemon config dir.
- [x] 5. Desktop host parity: `openExternal` via Electron `shell`, JSON storage under the Electron userData dir (`mcp-oauth.json` via `oauthStorage.ts`).
- [x] 6. Sign-out: `McpClient.invalidateCredentials` → `ServerManager.invalidateCredentials` → `DaemonMcpRuntime.invalidateOAuthCredentials` → `mcp.invalidateOAuthCredentials` route; renderer `McpClient.invalidateOAuthCredentials`; "Sign out" button on OAuth server detail sheets (tokens scope) with toasts.
- [x] 7. Tests: `oauthProvider.test.ts` — loopback callback capture + timeout rejection, storage round-trip, scoped invalidation (4 tests).
- [x] 8. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.

Follow-ups: `invalidateCredentials` scope UI (all vs tokens), server-config UX for the `oauth: true` toggle, loopback-server unit tests, desktop-host end-to-end validation with a running desktop instance.
