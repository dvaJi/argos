/**
 * Stateless GitHub OAuth code exchange helper.
 *
 * Runs on the Cloudflare Worker (server-side) so the client secret never
 * reaches the desktop binary. The desktop app is handed the resulting
 * access token via the `argos://` deep link.
 */

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

export interface ExchangeResult {
  accessToken: string;
}

export interface ExchangeInput {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GitHubOAuthError extends Error {
  constructor(
    message: string,
    readonly status: number = 500,
  ) {
    super(message);
    this.name = "GitHubOAuthError";
  }
}

/**
 * Exchange a GitHub authorization code for an access token.
 * Throws `GitHubOAuthError` on any failure.
 */
export async function exchangeCodeForToken(input: ExchangeInput): Promise<ExchangeResult> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Argos-Landing/1.0",
    },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new GitHubOAuthError(`Token exchange failed: ${response.status} ${response.statusText}`, response.status);
  }

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (data.error) {
    throw new GitHubOAuthError(data.error_description || data.error, 400);
  }

  if (!data.access_token) {
    throw new GitHubOAuthError("No access token received from GitHub", 502);
  }

  return { accessToken: data.access_token };
}
