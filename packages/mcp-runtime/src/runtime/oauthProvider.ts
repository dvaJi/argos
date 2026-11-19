import { createServer, type Server } from "node:http";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { McpHostServices } from "../host/ports";

export interface ArgosOAuthOptions {
  serverName: string;
  services: McpHostServices;
  /** Callback timeout for the browser authorization step. */
  timeoutMs?: number;
}

const CALLBACK_TIMEOUT_MS = 5 * 60_000;

/**
 * Loopback HTTP server that captures the OAuth authorization response
 * (`?code=...&state=...`) on 127.0.0.1 and resolves the waiter.
 */
export class LoopbackCallbackServer {
  private server: Server | null = null;
  private port = 0;
  private resolveCallback: ((url: URL) => void) | null = null;
  private rejectCallback: ((error: Error) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  get callbackUrl(): string {
    return `http://127.0.0.1:${this.port}/callback`;
  }

  /** Starts (or restarts) the listener and resolves with the redirect URL to advertise. */
  start(timeoutMs = CALLBACK_TIMEOUT_MS): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/callback") {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h3>Authorization received.</h3><p>You can close this window and return to Argos.</p></body></html>",
        );
        const resolveCallback = this.resolveCallback;
        this.resolveCallback = null;
        this.clearTimer();
        void this.closeServer();
        resolveCallback?.(url);
      });
      server.on("error", (error) => {
        this.clearTimer();
        this.rejectCallback?.(error instanceof Error ? error : new Error(String(error)));
        this.rejectCallback = null;
        reject(error);
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          this.port = address.port;
          this.server = server;
          this.rejectCallback = (error) => reject(error);
          this.timer = setTimeout(() => {
            void this.closeServer();
            const rejectCallback = this.rejectCallback;
            this.rejectCallback = null;
            rejectCallback?.(new Error("Timed out waiting for the OAuth authorization callback"));
          }, timeoutMs);
          resolve(this.callbackUrl);
        } else {
          reject(new Error("Loopback callback server failed to report its port"));
        }
      });
    });
  }

  /** Waits for the authorization callback (or the timeout). */
  waitForCode(timeoutMs = CALLBACK_TIMEOUT_MS): Promise<URL> {
    return new Promise<URL>((resolve, reject) => {
      this.resolveCallback = resolve;
      this.rejectCallback = reject;
      this.timer = setTimeout(() => {
        this.resolveCallback = null;
        this.rejectCallback = null;
        reject(new Error("Timed out waiting for the OAuth authorization callback"));
      }, timeoutMs);
    });
  }

  async stop(): Promise<void> {
    this.clearTimer();
    this.resolveCallback = null;
    this.rejectCallback = null;
    await this.closeServer();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async closeServer(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/**
 * OAuth client provider for remote MCP servers. Implements the SDK's
 * `OAuthClientProvider` on top of host services: tokens/client/verifier state
 * persist via `readJsonFile`/`writeJsonFile`, and the authorization step opens
 * the system browser with a loopback redirect catching the response.
 */
export class ArgosOAuthClientProvider implements OAuthClientProvider {
  private readonly callbackServer = new LoopbackCallbackServer();
  private redirectUrlValue: string | null = null;
  private readonly storageKey: string;

  constructor(private readonly options: ArgosOAuthOptions) {
    this.storageKey = `mcp-oauth:${options.serverName}`;
  }

  get redirectUrl(): string | URL | undefined {
    return this.redirectUrlValue ?? undefined;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Argos",
      client_uri: "https://argos.local",
      redirect_uris: [this.callbackServer.callbackUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  async state(): Promise<string> {
    return `${this.options.serverName}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return ((await this.options.services.readJsonFile?.(`${this.storageKey}:client`)) ??
      undefined) as OAuthClientInformationMixed | undefined;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    await this.options.services.writeJsonFile?.(`${this.storageKey}:client`, clientInformation);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return ((await this.options.services.readJsonFile?.(`${this.storageKey}:tokens`)) ??
      undefined) as OAuthTokens | undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.options.services.writeJsonFile?.(`${this.storageKey}:tokens`, tokens);
  }

  /**
   * The SDK invokes this at the redirect step: start the loopback listener,
   * hand the URL to the system browser, and expose the wait handle.
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.redirectUrlValue = await this.callbackServer.start(this.options.timeoutMs ?? CALLBACK_TIMEOUT_MS);
    if (this.options.services.openExternal) {
      await this.options.services.openExternal(authorizationUrl.href);
    } else {
      console.info(`[MCP] Open this URL to authorize: ${authorizationUrl.href}`);
    }
  }

  waitForAuthorization(timeoutMs?: number): Promise<URL> {
    return this.callbackServer.waitForCode(timeoutMs ?? this.options.timeoutMs ?? CALLBACK_TIMEOUT_MS);
  }

  async stopAuthorization(): Promise<void> {
    await this.callbackServer.stop();
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.options.services.writeJsonFile?.(`${this.storageKey}:verifier`, codeVerifier);
  }

  async codeVerifier(): Promise<string> {
    const stored = await this.options.services.readJsonFile?.(`${this.storageKey}:verifier`);
    if (typeof stored !== "string" || !stored) {
      throw new Error("No OAuth code verifier saved for this server");
    }
    return stored;
  }

  async invalidateCredentials(scope?: "all" | "client" | "tokens" | "verifier" | "state" | "discovery"): Promise<void> {
    const scopeKey = scope === "all" || scope === undefined ? "" : `:${scope}`;
    await this.options.services.writeJsonFile?.(`${this.storageKey}${scopeKey}`, null);
  }
}
