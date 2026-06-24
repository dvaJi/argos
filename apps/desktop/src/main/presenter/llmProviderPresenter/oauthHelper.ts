import { BrowserWindow } from "electron";
import { eventBus, SendTarget } from "@/eventbus";
import { CONFIG_EVENTS } from "@/events";

export interface OAuthConfig {
  authUrl: string;
  redirectUri: string;
  clientId: string;
  scope: string;
  responseType: string;
}

export class OAuthHelper {
  private authWindow: BrowserWindow | null = null;

  constructor(private config: OAuthConfig) {}

  /**
   * Start the OAuth login flow
   */
  async startLogin(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Send the login-started event
      eventBus.send(CONFIG_EVENTS.OAUTH_LOGIN_START, SendTarget.ALL_WINDOWS);

      // Create the authorization window
      this.authWindow = new BrowserWindow({
        width: 400,
        height: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        autoHideMenuBar: true,
        title: "Sign in to GitHub Copilot",
      });

      // Build the authorization URL
      const authUrl = this.buildAuthUrl();

      // Load the authorization page
      this.authWindow.loadURL(authUrl);
      this.authWindow.show();

      // Listen for URL changes
      this.authWindow.webContents.on("will-redirect", (_event, navigationUrl) => {
        this.handleCallback(navigationUrl, resolve, reject);
      });

      this.authWindow.webContents.on("did-navigate", (_event, navigationUrl) => {
        this.handleCallback(navigationUrl, resolve, reject);
      });

      // Handle window close
      this.authWindow.on("closed", () => {
        this.authWindow = null;
        if (!resolve) {
          reject(new Error("User cancelled the login"));
        }
      });

      // Handle load errors
      this.authWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        console.error("OAuth page load failed:", errorCode, errorDescription);
        this.closeAuthWindow();
        reject(new Error(`Failed to load authorization page: ${errorDescription}`));
      });
    });
  }

  /**
   * Build the authorization URL
   */
  private buildAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: this.config.responseType,
      scope: this.config.scope,
    });

    return `${this.config.authUrl}?${params.toString()}`;
  }

  /**
   * Handle the callback
   */
  private handleCallback(url: string, resolve: (value: string) => void, reject: (reason?: Error) => void): void {
    if (url.startsWith(this.config.redirectUri)) {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get("code");
        const error = urlObj.searchParams.get("error");

        if (error) {
          console.error("OAuth error:", error);
          eventBus.send(CONFIG_EVENTS.OAUTH_LOGIN_ERROR, SendTarget.ALL_WINDOWS, error);
          reject(new Error(`OAuth authorization failed: ${error}`));
        } else if (code) {
          console.log("OAuth success, received authorization code");
          eventBus.send(CONFIG_EVENTS.OAUTH_LOGIN_SUCCESS, SendTarget.ALL_WINDOWS, code);
          resolve(code);
        } else {
          reject(new Error("Did not receive authorization code"));
        }
      } catch (error) {
        console.error("Error parsing callback URL:", error);
        reject(new Error("Failed to parse callback URL"));
      }

      this.closeAuthWindow();
    }
  }

  /**
   * Close the authorization window
   */
  private closeAuthWindow(): void {
    if (this.authWindow && !this.authWindow.isDestroyed()) {
      this.authWindow.close();
      this.authWindow = null;
    }
  }
}

// GitHub Copilot OAuth configuration
export const GITHUB_COPILOT_OAUTH_CONFIG: OAuthConfig = {
  authUrl: "https://github.com/login/oauth/authorize",
  redirectUri: process.env.VITE_GITHUB_REDIRECT_URI || "https://argos.aipurrjects.xyz/auth/github/callback",
  clientId: process.env.VITE_GITHUB_CLIENT_ID || "",
  scope: "read:user read:org",
  responseType: "code",
};
