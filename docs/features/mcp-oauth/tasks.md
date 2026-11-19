# MCP OAuth — Tasks

- [x] 1. `McpHostServices`: `openExternal`, `readJsonFile`, `writeJsonFile` ports.
- [x] 2. Runtime: `ArgosOAuthClientProvider` (loopback callback server, persisted tokens/client/verifier via host services, browser hand-off) in `oauthProvider.ts`.
- [x] 3. Runtime: transports accept the `authProvider`; `connect` handles `UnauthorizedError` → wait for authorization → single retry; `experimental` capability unaffected.
- [x] 4. Daemon host: `openExternal` (system browser), `readJsonFile`/`writeJsonFile` via the daemon config dir.
- [x] 5. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.

Follow-ups: desktop-host parity, sign-out UI (`invalidateCredentials`), server-config toggle UX, tests for the loopback server.
