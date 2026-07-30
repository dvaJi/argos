# Tasks

- [x] Landing: add `src/lib/githubOAuth.ts` (code→token exchange helper).
- [x] Landing: add `src/routes/auth/github/callback.tsx` (server handler: exchange + 302 to argos://).
- [x] Landing: update `wrangler.jsonc` (`vars` for client_id + scheme).
- [x] Landing: add `src/cloudflare.d.ts` (typed `cloudflare:workers` env import); gitignore generated `worker-configuration.d.ts`.
- [x] Desktop: refactor `githubCopilotOAuth.ts` (drop secret/BrowserWindow/exchange; add buildAuthUrl + generateState; keep validateToken).
- [x] Desktop: rewrite `startGitHubCopilotLogin` in `oauthPresenter.ts` (system browser + pending registry + completeGitHubAuthFromDeepLink).
- [x] Desktop: add `auth/callback` handler to `deeplinkPresenter/index.ts` (token redacted in logs).
- [x] Desktop: add `completeGitHubAuthFromDeepLink` to `IOAuthPresenter` shared type.
- [x] Update `.env.example` (desktop no longer needs the secret).
- [x] Landing typecheck + build pass; desktop typecheck (node+web) passes; root lint (agent-cleanup + architecture + oxlint) clean.
