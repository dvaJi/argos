import { randomBytes } from "crypto";

export interface GitHubOAuthConfig {
  clientId: string;
  redirectUri: string;
  scope: string;
}

/**
 * GitHub Copilot OAuth helpers for the desktop client.
 *
 * The authorization-code → access-token exchange is performed **server-side**
 * by the landing page relay (`apps/landing` → `argos://auth/callback`), so the
 * desktop binary never holds the client secret. This class only builds the
 * authorize URL, generates the CSRF state, and validates the token once the
 * relay hands it back via the deep link.
 */
export class GitHubCopilotOAuth {
  constructor(private config: GitHubOAuthConfig) {}

  /** Generate a random opaque state token (CSRF protection). */
  static generateState(): string {
    return randomBytes(16).toString("hex");
  }

  /** Build the GitHub authorization URL for the system browser. */
  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      state,
      response_type: "code",
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /** Validate an access token against the GitHub API. */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "Argos/1.0.0",
        },
      });
      return response.ok;
    } catch (error) {
      console.error("Token validation failed:", error);
      return false;
    }
  }
}

/** Factory reading client_id + redirect_uri from env (secret no longer needed). */
export function createGitHubCopilotOAuth(clientIdOverride?: string): GitHubCopilotOAuth {
  const clientId = clientIdOverride?.trim() || process.env.VITE_GITHUB_CLIENT_ID;
  const redirectUri = process.env.VITE_GITHUB_REDIRECT_URI || "https://argos.aipurrjects.xyz/auth/github/callback";

  if (!clientId) {
    throw new Error(
      "GitHub Client ID is required. Please enter it in the Copilot settings input or set VITE_GITHUB_CLIENT_ID in .env.",
    );
  }

  return new GitHubCopilotOAuth({ clientId, redirectUri, scope: "read:user read:org" });
}
