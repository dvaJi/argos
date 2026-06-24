import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { exchangeCodeForToken, GitHubOAuthError } from "~/lib/githubOAuth";

const DEFAULT_REDIRECT_URI = "https://argos.aipurrjects.xyz/auth/github/callback";

export const Route = createFileRoute("/auth/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        const scheme = (env.OAUTH_DEEPLINK_SCHEME as string | undefined)?.trim() || "argos";

        // GitHub reported an error (e.g. user denied) — relay it back to the app.
        if (error) {
          return redirectToApp(scheme, { state, error });
        }

        if (!code || !state) {
          return renderStatus("Missing authorization code or state.", 400);
        }

        const clientId = env.GITHUB_CLIENT_ID as string | undefined;
        const clientSecret = env.GITHUB_CLIENT_SECRET as string | undefined;

        if (!clientId || !clientSecret) {
          console.error("[auth/github/callback] GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not configured");
          return redirectToApp(scheme, { state, error: "server_misconfigured" });
        }

        try {
          const { accessToken } = await exchangeCodeForToken({
            code,
            clientId,
            clientSecret,
            redirectUri: DEFAULT_REDIRECT_URI,
          });
          return redirectToApp(scheme, { state, token: accessToken });
        } catch (err) {
          const message = err instanceof GitHubOAuthError ? err.message : "token_exchange_failed";
          console.error("[auth/github/callback] token exchange failed:", message);
          return redirectToApp(scheme, { state, error: message });
        }
      },
    },
  },
});

/** Build a `argos://auth/callback?...` redirect Response. */
function redirectToApp(scheme: string, params: Record<string, string | null | undefined>): Response {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null) search.set(key, value);
  }
  const target = `${scheme}://auth/callback?${search.toString()}`;
  const body = fallbackPage(target);
  return new Response(body, {
    status: 302,
    headers: {
      Location: target,
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** Minimal HTML shown if the browser does not follow the protocol redirect. */
function fallbackPage(target: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Returning to Argos…</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1020;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0}
.box{text-align:center;max-width:420px;padding:2rem}
a{color:#22d3ee;font-weight:600}</style></head>
<body><div class="box"><h2>Returning to Argos…</h2>
<p>If you are not redirected automatically, <a href="${target}">click here to continue</a>.</p></div>
<script>location.href=${JSON.stringify(target)}</script></body></html>`;
}

/** Plain status page for non-redirect errors. */
function renderStatus(message: string, status: number): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Argos — Authorization</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1020;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0}</style>
</head><body><p>${message}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
