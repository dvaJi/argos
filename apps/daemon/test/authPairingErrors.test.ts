import { describe, expect, test, vi } from "vitest";
import { handlePair } from "../src/transport/auth-routes";

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
