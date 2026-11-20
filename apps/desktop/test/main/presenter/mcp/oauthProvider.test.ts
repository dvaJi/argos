import { describe, it, expect } from "vitest";
import { ArgosOAuthClientProvider, LoopbackCallbackServer } from "@argos/mcp-runtime/runtime/oauthProvider";

describe("LoopbackCallbackServer", () => {
  it("captures the authorization callback and exposes the redirect URL", async () => {
    const server = new LoopbackCallbackServer();
    const redirectUrl = await server.start(10_000);

    expect(redirectUrl.startsWith("http://127.0.0.1:")).toBe(true);
    expect(redirectUrl.endsWith("/callback")).toBe(true);

    const waited = server.waitForCode(10_000);
    const callbackUrl = new URL(redirectUrl);
    callbackUrl.searchParams.set("code", "abc123");
    callbackUrl.searchParams.set("state", "st-1");
    const response = await fetch(callbackUrl);
    expect(response.status).toBe(200);

    const code = (await waited).searchParams.get("code");
    expect(code).toBe("abc123");
    await server.stop();
  });

  it("buffers a callback that arrives before waitForCode is called", async () => {
    const server = new LoopbackCallbackServer();
    const redirectUrl = await server.start(10_000);
    const callbackUrl = new URL(redirectUrl);
    callbackUrl.searchParams.set("code", "early");
    await fetch(callbackUrl);

    const received = await server.waitForCode();
    expect(received.searchParams.get("code")).toBe("early");
    await server.stop();
  });

  it("rejects waitForCode after the timeout when no callback arrives", async () => {
    const server = new LoopbackCallbackServer();
    await server.start(500);

    await expect(server.waitForCode(200)).rejects.toThrow("Timed out waiting");
    await server.stop();
  });
});

describe("ArgosOAuthClientProvider storage", () => {
  const fakeServices = () => {
    const files = new Map<string, unknown>();
    return {
      services: {
        readJsonFile: async (key: string) => files.get(key) ?? null,
        writeJsonFile: async (key: string, value: unknown) => {
          files.set(key, value);
        },
      },
      files,
    };
  };

  it("persists tokens, client information and code verifier under per-server keys", async () => {
    const { services, files } = fakeServices();
    const provider = new ArgosOAuthClientProvider({
      serverName: "remote-mcp",
      services,
    });

    await provider.saveTokens({ access_token: "at", token_type: "Bearer" } as never);
    await provider.saveClientInformation({ client_id: "cid" } as never);
    await provider.saveCodeVerifier("pke-verifier");

    expect(files.has("mcp-oauth:remote-mcp:tokens")).toBe(true);
    expect(files.has("mcp-oauth:remote-mcp:client")).toBe(true);
    expect(files.has("mcp-oauth:remote-mcp:verifier")).toBe(true);
    expect((await provider.tokens())?.access_token).toBe("at");
    expect(await provider.codeVerifier()).toBe("pke-verifier");
    expect(await provider.clientInformation()).toEqual({ client_id: "cid" });
  });

  it("invalidates stored credentials by scope", async () => {
    const { services, files } = fakeServices();
    const provider = new ArgosOAuthClientProvider({ serverName: "remote-mcp", services });

    await provider.saveTokens({ access_token: "at" } as never);
    await provider.saveClientInformation({ client_id: "cid" } as never);
    await provider.invalidateCredentials("tokens");

    expect(files.get("mcp-oauth:remote-mcp:tokens")).toBeNull();
    expect(files.get("mcp-oauth:remote-mcp:client")).toEqual({ client_id: "cid" });
  });

  it("sign-out ('all') clears every stored key", async () => {
    const { services, files } = fakeServices();
    const provider = new ArgosOAuthClientProvider({ serverName: "remote-mcp", services });
    await provider.prepare();
    await provider.saveTokens({ access_token: "at" } as never);
    await provider.saveClientInformation({ client_id: "cid" } as never);
    await provider.saveCodeVerifier("v");

    await provider.invalidateCredentials("all");

    expect(await provider.tokens()).toBeUndefined();
    expect(await provider.clientInformation()).toBeUndefined();
    expect(files.get("mcp-oauth:remote-mcp:verifier")).toBeNull();
    expect(files.get("mcp-oauth:remote-mcp:redirect")).toBeNull();
  });
});

describe("ArgosOAuthClientProvider redirect + callback", () => {
  const memoryServices = () => {
    const files = new Map<string, unknown>();
    return {
      readJsonFile: async (key: string) => files.get(key) ?? null,
      writeJsonFile: async (key: string, value: unknown) => {
        files.set(key, value);
      },
    };
  };

  it("exposes a stable, concrete redirect URI once prepared", async () => {
    const services = memoryServices();
    const provider = new ArgosOAuthClientProvider({ serverName: "remote-mcp", services });
    expect(provider.redirectUrl).toBeUndefined();
    await provider.prepare();

    const redirectUrl = String(provider.redirectUrl);
    expect(redirectUrl).toMatch(/^http:\/\/127\.0\.0\.1:[1-9]\d*\/callback$/);
    expect(provider.clientMetadata.redirect_uris).toEqual([redirectUrl]);

    // A new provider for the same server reuses the persisted port.
    const again = new ArgosOAuthClientProvider({ serverName: "remote-mcp", services });
    await again.prepare();
    expect(String(again.redirectUrl)).toBe(redirectUrl);
  });

  it("ignores a stored registration pinned to another redirect URI", async () => {
    const provider = new ArgosOAuthClientProvider({ serverName: "remote-mcp", services: memoryServices() });
    await provider.prepare();
    await provider.saveClientInformation({ client_id: "old", redirect_uris: ["http://127.0.0.1:1/callback"] } as never);
    expect(await provider.clientInformation()).toBeUndefined();
  });

  it("refuses to open a second browser flow while non-interactive", async () => {
    let opened = 0;
    const provider = new ArgosOAuthClientProvider({
      serverName: "remote-mcp",
      services: { ...memoryServices(), openExternal: async () => void (opened += 1) },
    });
    await provider.prepare();
    provider.setInteractive(false);

    await expect(provider.redirectToAuthorization(new URL("https://auth.example/authorize"))).rejects.toThrow(
      "rejected the credentials",
    );
    expect(opened).toBe(0);
    provider.setInteractive(true);
  });

  it("listens on the registered port and validates state and errors", async () => {
    const provider = new ArgosOAuthClientProvider({
      serverName: "remote-mcp",
      services: { ...memoryServices(), openExternal: async () => undefined },
      timeoutMs: 10_000,
    });
    await provider.prepare();
    const state = await provider.state();
    await provider.redirectToAuthorization(new URL("https://auth.example/authorize"));

    const callback = new URL(String(provider.redirectUrl));
    callback.searchParams.set("code", "abc");
    callback.searchParams.set("state", state);
    await fetch(callback);
    const received = await provider.waitForAuthorization();
    expect(provider.validateCallback(received).get("code")).toBe("abc");

    await provider.state();
    expect(() => provider.validateCallback(new URL("http://x/callback?code=c&state=wrong"))).toThrow("state mismatch");
    expect(() => provider.validateCallback(new URL("http://x/callback?error=access_denied"))).toThrow("access_denied");
    await provider.stopAuthorization();
  });
});
