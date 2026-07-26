import { describe, expect, it } from "vitest";
import { authorize } from "../src/transport/auth";

describe("WebSocket bearer subprotocol authentication", () => {
  it("accepts the SDK bearer subprotocol without a URL token", async () => {
    const request = new Request("http://192.168.1.20:9527/api/v1/events", {
      headers: { "sec-websocket-protocol": "argos-v1, argos-bearer.session-secret" },
    });
    const result = await authorize(request, {
      exposureMode: "network-accessible",
      verifySession: async (secret) =>
        secret === "session-secret" ? { sessionId: "session-1", kind: "bearer-session" } : null,
    });

    expect(result).toEqual({
      ok: true,
      context: {
        credentialKind: "bearer-session",
        sessionId: "session-1",
        exposureMode: "network-accessible",
        isLoopback: false,
      },
    });
  });
});
