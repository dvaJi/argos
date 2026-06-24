import { BrowserWindow, shell } from "electron";
import { presenter } from ".";
import * as http from "http";
import { URL } from "url";
import { createGitHubCopilotOAuth, GitHubCopilotOAuth } from "./githubCopilotOAuth";
import { getGlobalGitHubCopilotDeviceFlow } from "./githubCopilotDeviceFlow";
import { eventBus } from "@/eventbus";

export interface OAuthConfig {
  authUrl: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  scope: string;
  responseType: string;
}

/** A pending traditional-flow login, resolved when the `argos://auth/callback` deep link arrives. */
interface PendingGitHubAuth {
  providerId: string;
  resolve: (token: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/** Payload delivered by the `argos://auth/callback` deep link. */
export interface GitHubAuthCallbackPayload {
  token?: string;
  state?: string;
  error?: string;
}

const GITHUB_OAUTH_TIMEOUT_MS = 300000; // 5 minutes

export class OAuthPresenter {
  private authWindow: BrowserWindow | null = null;
  private callbackServer: http.Server | null = null;
  private callbackPort = 3000;
  /** Pending traditional OAuth logins, keyed by the CSRF `state` nonce. */
  private pendingGitHubAuths = new Map<string, PendingGitHubAuth>();

  /**
   * Validate GitHub access token
   */
  private async validateGitHubAccessToken(token: string): Promise<boolean> {
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

  /**
   * Start GitHub Copilot Device Flow login process (recommended)
   */
  async startGitHubCopilotDeviceFlowLogin(providerId: string): Promise<boolean> {
    try {
      const provider = presenter.configPresenter.getProviderById(providerId);
      const githubDeviceFlow = getGlobalGitHubCopilotDeviceFlow(provider?.copilotClientId);

      // First check the existing authentication state
      if (provider && provider.apiKey) {
        const existingToken = await githubDeviceFlow.checkExistingAuth(provider.apiKey);
        if (existingToken) {
          return true;
        }
      }

      // Start the Device Flow login
      const accessToken = await githubDeviceFlow.startDeviceFlow();

      // Validate token
      console.log("Validating access token...");
      const isValid = await this.validateGitHubAccessToken(accessToken);
      if (!isValid) {
        throw new Error("Obtained access token is invalid");
      }

      // Save the access token to the provider configuration
      if (provider) {
        provider.apiKey = accessToken;
        presenter.configPresenter.setProviderById(providerId, provider);
        console.log("[GitHub Copilot] Device Flow login completed successfully");

        // Emit a provider-updated event so the renderer refreshes the UI
        eventBus.emit("providerUpdated", { providerId });
      } else {
        throw new Error(`Provider ${providerId} not found`);
      }

      return true;
    } catch (error) {
      console.error("[GitHub Copilot] Device Flow login failed:", error);
      return false;
    }
  }

  /**
   * Start GitHub Copilot OAuth login process (traditional method).
   *
   * Opens the system browser to GitHub's authorize page. GitHub redirects to
   * the landing page relay (`argos.aipurrjects.xyz/auth/github/callback`),
   * which exchanges the code for a token server-side and redirects back to
   * `argos://auth/callback`. That deep link resolves the pending promise via
   * {@link completeGitHubAuthFromDeepLink}. The client secret never lives in
   * the desktop binary.
   */
  async startGitHubCopilotLogin(providerId: string): Promise<boolean> {
    try {
      console.log("[GitHub Copilot][OAuth] Starting OAuth login for provider:", providerId);

      const provider = presenter.configPresenter.getProviderById(providerId);
      const githubOAuth = createGitHubCopilotOAuth(provider?.copilotClientId);
      const state = GitHubCopilotOAuth.generateState();
      const authUrl = githubOAuth.buildAuthUrl(state);

      // Wait for the relay deep link to deliver the token.
      const accessToken = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingGitHubAuths.delete(state);
          reject(new Error("Authorization timeout"));
        }, GITHUB_OAUTH_TIMEOUT_MS);
        this.pendingGitHubAuths.set(state, { providerId, resolve, reject, timer });

        console.log("[GitHub Copilot][OAuth] Opening system browser for authorization…");
        void shell.openExternal(authUrl);
      });

      // Validate token
      const isValid = await githubOAuth.validateToken(accessToken);
      if (!isValid) {
        throw new Error("The obtained access token is invalid");
      }

      // Save the access token to the provider configuration
      if (provider) {
        provider.apiKey = accessToken;
        presenter.configPresenter.setProviderById(providerId, provider);
        console.log("[GitHub Copilot][OAuth] Login completed successfully for provider:", providerId);
        eventBus.emit("providerUpdated", { providerId });
      } else {
        throw new Error(`Provider ${providerId} not found`);
      }

      return true;
    } catch (error) {
      console.error("[GitHub Copilot][OAuth] Login failed:", error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Complete a traditional OAuth login from the `argos://auth/callback` deep link.
   *
   * Called by the DeeplinkPresenter when the landing page relay redirects back
   * with the access token (or an error). Matches the pending `state` nonce for
   * CSRF protection.
   */
  completeGitHubAuthFromDeepLink(payload: GitHubAuthCallbackPayload): void {
    const state = payload.state;
    if (!state) {
      console.warn("[GitHub Copilot][OAuth] Deep-link callback missing state");
      return;
    }
    const pending = this.pendingGitHubAuths.get(state);
    if (!pending) {
      console.warn("[GitHub Copilot][OAuth] No pending auth for state (expired, already used, or unknown)");
      return;
    }
    this.pendingGitHubAuths.delete(state);
    clearTimeout(pending.timer);

    if (payload.error) {
      pending.reject(new Error(`GitHub authorization failed: ${payload.error}`));
    } else if (payload.token) {
      pending.resolve(payload.token);
    } else {
      pending.reject(new Error("No access token received from callback"));
    }
  }

  /**
   * Start OAuth login flow (generic method)
   */
  async startOAuthLogin(providerId: string, config: OAuthConfig): Promise<boolean> {
    try {
      // Start callback server
      await this.startCallbackServer();

      // Start OAuth login
      const authCode = await this.startOAuthFlow(config);

      // Stop callback server
      this.stopCallbackServer();

      // Exchange the authorization code for an access token
      const accessToken = await this.exchangeCodeForToken(authCode, config);

      // Save access token to provider configuration
      const provider = presenter.configPresenter.getProviderById(providerId);
      if (provider) {
        provider.apiKey = accessToken;
        presenter.configPresenter.setProviderById(providerId, provider);
      }

      return true;
    } catch (error) {
      console.error("OAuth login failed:", error);
      this.stopCallbackServer();

      return false;
    }
  }

  /**
   * Start callback server
   */
  private async startCallbackServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.callbackServer = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:${this.callbackPort}`);

        console.log("Callback server received request:", url.href);

        // Set CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (url.pathname === "/auth/callback") {
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          if (code) {
            // Success page
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <title>Authorization Successful</title>
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                  .success { color: #28a745; }
                </style>
              </head>
              <body>
                <h1 class="success">✅ Authorization Successful</h1>
                <p>You have successfully authorized GitHub Copilot access.</p>
                <p>You can close this window now.</p>
                <script>
                  // Auto close window after 3 seconds
                  setTimeout(() => {
                    window.close();
                  }, 3000);
                </script>
              </body>
              </html>
            `);

            // Trigger callback handling
            this.handleServerCallback(code, null);
          } else if (error) {
            // Error page
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <title>Authorization Failed</title>
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                  .error { color: #dc3545; }
                </style>
              </head>
              <body>
                <h1 class="error">❌ Authorization Failed</h1>
                <p>An error occurred during authorization: ${error}</p>
                <p>You can close this window and try again.</p>
              </body>
              </html>
            `);

            this.handleServerCallback(null, error);
          } else {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Invalid callback request");
          }
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
        }
      });

      this.callbackServer.listen(this.callbackPort, "localhost", () => {
        console.log(`OAuth callback server started on http://localhost:${this.callbackPort}`);
        resolve();
      });

      this.callbackServer.on("error", (error) => {
        console.error("Callback server error:", error);
        reject(error);
      });
    });
  }

  /**
   * Stop callback server
   */
  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
      console.log("OAuth callback server stopped");
    }
  }

  // Callback handling resolve and reject functions
  private callbackResolve: ((value: string) => void) | null = null;
  private callbackReject: ((reason?: Error) => void) | null = null;

  /**
   * Handle server callback
   */
  private handleServerCallback(code: string | null, error: string | null): void {
    if (error) {
      console.error("OAuth server callback error:", error);
      this.callbackReject?.(new Error(`OAuth authorization failed: ${error}`));
    } else if (code) {
      console.log("OAuth server callback success, received authorization code");
      this.callbackResolve?.(code);
    }

    // Clean up callback functions
    this.callbackResolve = null;
    this.callbackReject = null;
  }

  /**
   * Start OAuth flow
   */
  private async startOAuthFlow(config: OAuthConfig): Promise<string> {
    return new Promise((resolve, reject) => {
      // Save callback functions
      this.callbackResolve = resolve;
      this.callbackReject = reject;

      // Create authorization window
      this.authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        autoHideMenuBar: true,
        title: "GitHub Authorization Login",
      });

      // Build authorization URL
      const authUrl = this.buildAuthUrl(config);
      console.log("Opening OAuth URL:", authUrl);

      // Load authorization page
      this.authWindow.loadURL(authUrl);
      this.authWindow.show();

      // Handle window close
      this.authWindow.on("closed", () => {
        this.authWindow = null;
        if (this.callbackReject) {
          this.callbackReject(new Error("User cancelled login"));
          this.callbackReject = null;
          this.callbackResolve = null;
        }
      });

      // Handle loading errors
      this.authWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        console.error("OAuth page load failed:", errorCode, errorDescription);
        this.closeAuthWindow();
        if (this.callbackReject) {
          this.callbackReject(new Error(`Failed to load authorization page: ${errorDescription}`));
          this.callbackReject = null;
          this.callbackResolve = null;
        }
      });

      // Monitor page navigation to check if callback page is reached
      this.authWindow.webContents.on("did-navigate", (_event, navigationUrl) => {
        console.log("OAuth window navigated to:", navigationUrl);
        // If navigated to our callback page, authorization flow is complete
        if (navigationUrl.includes("argos.aipurrjects.xyz/auth/github/callback")) {
          // Close authorization window as callback server handles remaining logic
          setTimeout(() => {
            this.closeAuthWindow();
          }, 2000); // Close after 2 seconds to let user see success page
        }
      });
    });
  }

  /**
   * Build authorization URL
   */
  private buildAuthUrl(config: OAuthConfig): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: config.responseType,
      scope: config.scope,
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(code: string, config: OAuthConfig): Promise<string> {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Argos/1.0.0",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret || process.env.GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      throw new Error(`Token exchange error: ${data.error_description || data.error}`);
    }

    return data.access_token;
  }

  /**
   * Close authorization window
   */
  private closeAuthWindow(): void {
    if (this.authWindow && !this.authWindow.isDestroyed()) {
      this.authWindow.close();
      this.authWindow = null;
    }
  }
}
