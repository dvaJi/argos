# MCP OAuth for Remote Servers

## User Need

Remote MCP servers (SSE / Streamable HTTP) commonly require OAuth authorization. Argos deliberately avoided the SDK's `authProvider` until a complete `OAuthClientProvider` existed — without one, 401 responses just fail the connection.

## Goal

Opt-in OAuth (`oauth: true` on the server config): on 401, run the SDK's full flow (protected-resource + authorization-server discovery, dynamic client registration, PKCE) with the system browser and a loopback callback, persist tokens, and reconnect.

## Status

- **Runtime (done):** `ArgosOAuthClientProvider` (implements the SDK's `OAuthClientProvider`) with:
  - loopback callback server on 127.0.0.1 (random port, `/callback`, 5-minute timeout, cleanup on stop),
  - tokens / client information / code verifier persisted per server via `McpHostServices.readJsonFile` / `writeJsonFile`,
  - `redirectToAuthorization` opens the system browser via `McpHostServices.openExternal` (URL logged if the host lacks the port),
  - public-client metadata (`token_endpoint_auth_method: "none"`, authorization_code + refresh_token grants).
  - `McpClient.connect` passes the provider to the SSE / Streamable HTTP transports; on `UnauthorizedError` it waits for the browser round-trip, cleans up, and retries once (`oauthRetryCount` guard).
  - Daemon host services: `openExternal` (system browser via start/open/xdg-open), `readJsonFile`/`writeJsonFile` (`mcp-oauth.json` under the daemon config dir).
- **Remaining:** desktop-host parity for `openExternal`/storage (daemon hosts all servers today); `invalidateCredentials` UI (sign-out); server-config UX for the `oauth: true` toggle.

## Constraints

- Opt-in per server (`oauth: true`); servers without the flag keep today's behavior.
- Static `Authorization` headers still take precedence in practice (no authProvider is only skipped when the flag is on — headers are merged as before).

## Non-Goals

- Token refresh scheduling UI; multi-account OAuth; desktop-host parity (follow-ups).
