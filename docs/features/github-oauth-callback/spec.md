# GitHub OAuth Callback Relay

## User Need

GitHub Copilot's traditional OAuth login (`startGitHubCopilotLogin`) ships `client_secret` inside the desktop binary and only "works" because an in-app `BrowserWindow` intercepts navigation to `https://argos.aipurrjects.xyz/auth/github/callback` before the page renders — and that page does not exist, so a real browser hit 404s. We need a real, secure flow.

## Goal

Turn the `argos.aipurrjects.xyz` landing page into a **stateless OAuth relay**: it receives GitHub's `code`, exchanges it for an `access_token` using a server-side secret (Cloudflare Worker secret), then redirects to the desktop app via `argos://auth/callback?token=...`. The desktop app opens the system browser, waits for the deep link, validates the token, and stores it.

The `client_secret` moves out of the desktop binary into the Worker; the desktop no longer needs it.

## Acceptance Criteria

1. `apps/landing` exposes `GET /auth/github/callback` that reads `code`+`state` (or `error`), exchanges `code` → `access_token` server-side using `env.GITHUB_CLIENT_SECRET` + `env.GITHUB_CLIENT_ID`, then 302-redirects to `argos://auth/callback?token=<token>&state=<state>` (or `?error=<error>&state=<state>` on failure).
2. The exchange uses GitHub's `POST https://github.com/login/oauth/access_token` endpoint and never exposes the secret to the client.
3. `apps/landing/wrangler.jsonc` declares `GITHUB_CLIENT_ID` and `OAUTH_DEEPLINK_SCHEME` as `vars`; `GITHUB_CLIENT_SECRET` is a Worker secret (set via `wrangler secret put`).
4. Desktop `startGitHubCopilotLogin(providerId)` opens the **system browser** (`shell.openExternal`) instead of a `BrowserWindow`, registers a pending `{state, providerId, resolve, reject}` with a 5-min timeout, and resolves when the deep link arrives.
5. Desktop `DeeplinkPresenter` handles `argos://auth/callback` → calls `OAuthPresenter.completeGitHubAuthFromDeepLink({token,state,error})`, which matches the pending state (CSRF), validates the token, stores it on the provider (`apiKey`), and emits `providerUpdated`.
6. The desktop binary no longer requires `VITE_GITHUB_CLIENT_SECRET` for the GitHub Copilot OAuth flow (Device Flow already didn't need it).
7. `argos://auth/callback` token value is never written to logs (use the existing redaction helper).
8. Landing `typecheck` + `build` pass; desktop `typecheck` passes; root `pnpm run lint` passes.

## Constraints

- Stateless relay only — no database, no sessions, no better-auth.
- Touch the GitHub-specific OAuth path only; leave the generic `startOAuthLogin` (localhost server) and Device Flow untouched.
- Keep the existing `state` CSRF nonce pattern.
- The deep-link `argos://` protocol is already registered (`deeplinkPresenter/index.ts:52`); reuse it.

## Non-goals

- No PKCE in this increment (relay already hides the secret; PKCE is a future simplification that could remove the relay entirely).
- No changes to the Device Flow (already works, already recommended).
- No web UI on the callback beyond a minimal fallback HTML page.
- No removal of the legacy `oauthHelper.ts` dead code (separate cleanup).

## Open Questions

Resolved:
- **System browser vs BrowserWindow**: system browser — it is the standard desktop OAuth pattern and is required for the `argos://` hand-off (a captive BrowserWindow cannot cleanly delegate to the OS protocol handler).
- **Token transport**: the access token travels through the `argos://` redirect to localhost/the running app; this matches GitHub Desktop / VS Code behavior and is acceptable for a desktop deep link.
