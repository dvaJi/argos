import { describe, it, expect, vi } from "vitest";
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
    await provider.invalidateCredentials("tokens");

    expect(files.get("mcp-oauth:remote-mcp:tokens")).toBeNull();
  });
});
