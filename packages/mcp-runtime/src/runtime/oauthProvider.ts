import { createServer, type Server } from "node:http";
import type { OAuthClientProvider } from "@modelcontextprotocol/client";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/client";
import type { McpHostServices } from "../host/ports";

export interface ArgosOAuthOptions {
  serverName: string;
  services: McpHostServices;
  /** Callback timeout for the browser authorization step. */
  timeoutMs?: number;
}

export type OAuthInvalidationScope = "all" | "client" | "tokens" | "verifier" | "state" | "discovery";

const CALLBACK_TIMEOUT_MS = 5 * 60_000;
const LOOPBACK_HOST = "127.0.0.1";

const callbackUrlFor = (port: number): string => `http://${LOOPBACK_HOST}:${port}/callback`;

/** Asks the OS for a currently free loopback port. */
export async function findFreeLoopbackPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, LOOPBACK_HOST, () => {
      const address = probe.address();
      const port = address && typeof address === "object" ? address.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error("Could not allocate a loopback port"))));
    });
  });
}

/**
 * Loopback HTTP server that captures the OAuth authorization response
 * (`?code=...&state=...` or `?error=...`) on 127.0.0.1.
 *
 * The callback is buffered as soon as it arrives, so a browser that redirects
 * before `waitForCode()` is called is not lost.
 */
export class LoopbackCallbackServer {
  private server: Server | null = null;
  private port = 0;
  private callback: Promise<URL> | null = null;
  private resolveCallback: ((url: URL) => void) | null = null;
  private rejectCallback: ((error: Error) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  get callbackUrl(): string {
    return callbackUrlFor(this.port);
  }

  /**
   * Starts (or restarts) the listener and resolves with the redirect URL to
   * advertise. `port` 0 picks a random free port; a fixed port must match the
   * redirect URI registered with the authorization server.
   */
  async start(timeoutMs = CALLBACK_TIMEOUT_MS, port = 0): Promise<string> {
    await this.stop();
    this.callback = new Promise<URL>((resolve, reject) => {
      this.resolveCallback = resolve;
      this.rejectCallback = reject;
    });
    // Avoid unhandled rejections when nobody ends up waiting.
    this.callback.catch(() => undefined);

    await new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`);
        if (url.pathname !== "/callback") {
          res.writeHead(404).end();
          return;
        }
        const failed = url.searchParams.has("error");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          failed
            ? "<html><body><h3>Authorization failed.</h3><p>You can close this window and return to Argos.</p></body></html>"
            : "<html><body><h3>Authorization received.</h3><p>You can close this window and return to Argos.</p></body></html>",
        );
        this.settle(url);
      });
      server.once("error", (error) => reject(error instanceof Error ? error : new Error(String(error))));
      server.listen(port, LOOPBACK_HOST, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          this.port = address.port;
          this.server = server;
          this.timer = setTimeout(() => {
            this.fail(new Error("Timed out waiting for the OAuth authorization callback"));
          }, timeoutMs);
          resolve();
        } else {
          server.close();
          reject(new Error("Loopback callback server failed to report its port"));
        }
      });
    });
    return this.callbackUrl;
  }

  /** Waits for the authorization callback (or the timeout). */
  waitForCode(timeoutMs?: number): Promise<URL> {
    if (!this.callback) {
      return Promise.reject(new Error("OAuth callback listener is not running"));
    }
    if (timeoutMs !== undefined) {
      this.clearTimer();
      this.timer = setTimeout(() => {
        this.fail(new Error("Timed out waiting for the OAuth authorization callback"));
      }, timeoutMs);
    }
    return this.callback;
  }

  async stop(): Promise<void> {
    this.clearTimer();
    this.rejectCallback?.(new Error("OAuth authorization was cancelled"));
    this.resolveCallback = null;
    this.rejectCallback = null;
    await this.closeServer();
  }

  private settle(url: URL): void {
    const resolve = this.resolveCallback;
    this.resolveCallback = null;
    this.rejectCallback = null;
    this.clearTimer();
    void this.closeServer();
    resolve?.(url);
  }

  private fail(error: Error): void {
    const reject = this.rejectCallback;
    this.resolveCallback = null;
    this.rejectCallback = null;
    this.clearTimer();
    void this.closeServer();
    reject?.(error);
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
 *
 * The loopback port is chosen once per server and persisted, so the
 * `redirect_uris` sent at dynamic client registration and the `redirect_uri`
 * of every later authorization request stay identical. Call `prepare()` before
 * handing the provider to a transport.
 */
export class ArgosOAuthClientProvider implements OAuthClientProvider {
  private readonly callbackServer = new LoopbackCallbackServer();
  private redirectPort: number | null = null;
  private expectedState: string | null = null;
  // False while reconnecting with freshly exchanged tokens: a server that
  // still answers 401 must not open a second browser tab.
  private interactive = true;
  private readonly storageKey: string;

  constructor(private readonly options: ArgosOAuthOptions) {
    this.storageKey = `mcp-oauth:${options.serverName}`;
  }

  private key(suffix: "client" | "tokens" | "verifier" | "redirect"): string {
    return `${this.storageKey}:${suffix}`;
  }

  private async read(suffix: "client" | "tokens" | "verifier" | "redirect"): Promise<unknown> {
    return (await this.options.services.readJsonFile?.(this.key(suffix))) ?? undefined;
  }

  private async write(suffix: "client" | "tokens" | "verifier" | "redirect", value: unknown): Promise<void> {
    await this.options.services.writeJsonFile?.(this.key(suffix), value);
  }

  /**
   * Resolves the loopback redirect port (persisted per server, or freshly
   * allocated) so `redirectUrl` and `clientMetadata` are valid before the SDK
   * reads them for registration and the authorization URL.
   */
  async prepare(): Promise<void> {
    if (this.redirectPort) return;
    const stored = (await this.read("redirect")) as { port?: unknown } | undefined;
    const storedPort = typeof stored?.port === "number" && stored.port > 0 ? stored.port : null;
    if (storedPort) {
      this.redirectPort = storedPort;
      return;
    }
    this.redirectPort = await findFreeLoopbackPort();
    await this.write("redirect", { port: this.redirectPort });
  }

  get redirectUrl(): string | URL | undefined {
    return this.redirectPort ? callbackUrlFor(this.redirectPort) : undefined;
  }

  get clientMetadata(): OAuthClientMetadata {
    const redirectUrl = this.redirectUrl;
    return {
      client_name: "Argos",
      client_uri: "https://argos.local",
      redirect_uris: redirectUrl ? [String(redirectUrl)] : [],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  async state(): Promise<string> {
    const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.expectedState = random;
    return random;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const stored = (await this.read("client")) as OAuthClientInformationMixed | undefined;
    if (!stored) return undefined;
    // A registration pinned to a different redirect URI cannot complete the
    // current flow: drop it so the SDK registers again.
    const registered = (stored as { redirect_uris?: unknown }).redirect_uris;
    const redirectUrl = this.redirectUrl;
    if (Array.isArray(registered) && registered.length > 0 && redirectUrl && !registered.includes(String(redirectUrl))) {
      return undefined;
    }
    return stored;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    await this.write("client", clientInformation);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.read("tokens")) as OAuthTokens | undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.write("tokens", tokens);
  }

  /**
   * The SDK invokes this at the redirect step: start the loopback listener on
   * the registered port, then hand the URL to the system browser.
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (!this.interactive) {
      throw new Error(
        `${this.options.serverName} rejected the credentials from the completed authorization; sign out and try again`,
      );
    }
    if (!this.redirectPort) {
      await this.prepare();
    }
    try {
      await this.callbackServer.start(this.options.timeoutMs ?? CALLBACK_TIMEOUT_MS, this.redirectPort ?? 0);
    } catch (error) {
      // The registered port is taken: forget it (and the registration pinned
      // to it) so the next attempt allocates a fresh port and re-registers.
      this.redirectPort = null;
      await this.write("redirect", null);
      await this.write("client", null);
      throw new Error(
        `OAuth callback port is unavailable for ${this.options.serverName}; retry the connection. (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
    if (this.options.services.openExternal) {
      await this.options.services.openExternal(authorizationUrl.href);
    } else {
      console.info(`[MCP] Open this URL to authorize: ${authorizationUrl.href}`);
    }
  }

  /** Toggle whether `redirectToAuthorization` may open the browser. */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
  }

  waitForAuthorization(timeoutMs?: number): Promise<URL> {
    return this.callbackServer.waitForCode(timeoutMs);
  }

  /**
   * Validates the authorization callback (error response, `state` match) and
   * returns the params to pass to the transport's `finishAuth`.
   */
  validateCallback(callbackUrl: URL): URLSearchParams {
    const params = callbackUrl.searchParams;
    const expected = this.expectedState;
    this.expectedState = null;
    const error = params.get("error");
    if (error) {
      const description = params.get("error_description");
      throw new Error(`OAuth authorization failed: ${error}${description ? ` (${description})` : ""}`);
    }
    if (expected && params.get("state") !== expected) {
      throw new Error("OAuth authorization callback state mismatch");
    }
    if (!params.get("code")) {
      throw new Error("OAuth authorization callback did not include a code");
    }
    return params;
  }

  async stopAuthorization(): Promise<void> {
    await this.callbackServer.stop();
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.write("verifier", codeVerifier);
  }

  async codeVerifier(): Promise<string> {
    const stored = await this.read("verifier");
    if (typeof stored !== "string" || !stored) {
      throw new Error("No OAuth code verifier saved for this server");
    }
    return stored;
  }

  async invalidateCredentials(scope: OAuthInvalidationScope = "all"): Promise<void> {
    switch (scope) {
      case "all":
        await this.write("tokens", null);
        await this.write("client", null);
        await this.write("verifier", null);
        await this.write("redirect", null);
        this.redirectPort = null;
        this.expectedState = null;
        return;
      case "client":
        await this.write("client", null);
        return;
      case "tokens":
        await this.write("tokens", null);
        return;
      case "verifier":
        await this.write("verifier", null);
        return;
      case "state":
        this.expectedState = null;
        return;
      case "discovery":
        // Discovery metadata is not cached by this provider.
        return;
    }
  }
}
