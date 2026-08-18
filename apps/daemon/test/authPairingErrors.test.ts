import { describe, expect, test, vi } from "bun:test";
import { handlePair, handleRevokeSession } from "../src/transport/auth-routes";
import { authorize } from "../src/transport/auth";

describe("pairing token errors", () => {
  test.each([
    ["expired", "pairing_expired"],
    ["consumed", "pairing_consumed"],
    ["invalid", "pairing_invalid"],
  ] as const)("returns %s tokens with stable %s code", async (status, expectedCode) => {
    const repo = {
      consumePairingTokenWithStatus: vi.fn(() => status),
      createSession: vi.fn(),
    };

    const response = await handlePair(
      new Request("http://daemon.test/api/v1/pair", { method: "POST", body: JSON.stringify({ token: "test" }) }),
      repo as any,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: expectedCode }) }),
    );
  });
});

describe("browser pairing sessions", () => {
  test("creates an HTTP-only browser cookie and invalidates the session on revoke", async () => {
    const repo = {
      consumePairingTokenWithStatus: vi.fn(() => "accepted"),
      createSession: vi.fn(() => ({ sessionId: "browser-session", secret: "browser-secret" })),
      revokeSession: vi.fn(() => true),
    };

    const response = await handlePair(
      new Request("https://daemon.test/api/v1/pair", {
        method: "POST",
        headers: { "user-agent": "Argos browser test" },
        body: JSON.stringify({ token: "one-time", kind: "browser" }),
      }),
      repo as any,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(
      /^argos_session=browser-secret; HttpOnly; SameSite=Lax; Path=\/; Max-Age=/,
    );
    await expect(response.json()).resolves.toEqual({ ok: true, sessionId: "browser-session" });

    expect(await handleRevokeSession(repo as any, "browser-session").json()).toEqual({ ok: true });
    expect(repo.revokeSession).toHaveBeenCalledWith("browser-session");
  });

  test("pairs, reloads with its cookie, revokes, and re-pairs with a fresh session", async () => {
    const activeSessions = new Map<string, string>();
    let sessionNumber = 0;
    const repo = {
      consumePairingTokenWithStatus: vi.fn(() => "accepted"),
      createSession: vi.fn(() => {
        sessionNumber += 1;
        const sessionId = `browser-session-${sessionNumber}`;
        const secret = `browser-secret-${sessionNumber}`;
        activeSessions.set(secret, sessionId);
        return { sessionId, secret };
      }),
      revokeSession: vi.fn((sessionId: string) => {
        for (const [secret, activeSessionId] of activeSessions) {
          if (activeSessionId === sessionId) activeSessions.delete(secret);
        }
        return true;
      }),
      verifySession: vi.fn((secret: string) => {
        const sessionId = activeSessions.get(secret);
        return sessionId ? { sessionId, kind: "browser" as const } : null;
      }),
    };
    const pair = async (token: string) =>
      handlePair(
        new Request("https://daemon.test/api/v1/pair", {
          method: "POST",
          body: JSON.stringify({ token, kind: "browser" }),
        }),
        repo as any,
      );
    const authorizeReload = (secret: string) =>
      authorize(new Request("https://daemon.test/", { headers: { cookie: `argos_session=${secret}` } }), {
        exposureMode: "network-accessible",
        verifySession: async (candidate) => repo.verifySession(candidate),
      });

    const firstPair = await pair("first-one-time-token");
    const firstCookie = firstPair.headers.get("set-cookie")!;
    expect(firstCookie).toContain("argos_session=browser-secret-1");
    await expect(authorizeReload("browser-secret-1")).resolves.toMatchObject({
      ok: true,
      context: { sessionId: "browser-session-1", credentialKind: "browser-session" },
    });

    await handleRevokeSession(repo as any, "browser-session-1");
    await expect(authorizeReload("browser-secret-1")).resolves.toMatchObject({ ok: false, code: "unauthorized" });

    const secondPair = await pair("second-one-time-token");
    const secondCookie = secondPair.headers.get("set-cookie")!;
    expect(secondCookie).toContain("argos_session=browser-secret-2");
    await expect(authorizeReload("browser-secret-2")).resolves.toMatchObject({
      ok: true,
      context: { sessionId: "browser-session-2", credentialKind: "browser-session" },
    });
  });
});
