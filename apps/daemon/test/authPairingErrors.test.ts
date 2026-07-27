import { describe, expect, test, vi } from "vitest";
import { handlePair, handleRevokeSession } from "../src/transport/auth-routes";

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
});
