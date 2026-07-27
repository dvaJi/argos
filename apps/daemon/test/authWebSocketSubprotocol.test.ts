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

  it("accepts the HTTP-only browser session cookie on a reconnect request", async () => {
    const verifySession = async (secret: string) =>
      secret === "browser-secret" ? { sessionId: "browser-session", kind: "browser" } : null;

    const result = await authorize(
      new Request("https://daemon.test/api/v1/events", {
        headers: { cookie: "theme=dark; argos_session=browser-secret" },
      }),
      {
        exposureMode: "network-accessible",
        verifySession,
      },
    );

    expect(result).toEqual({
      ok: true,
      context: {
        credentialKind: "browser-session",
        sessionId: "browser-session",
        exposureMode: "network-accessible",
        isLoopback: false,
      },
    });
  });

  it.each(["expired-secret", "revoked-secret"])("rejects an %s browser session cookie", async (secret) => {
    const result = await authorize(
      new Request("https://daemon.test/api/v1/events", {
        headers: { cookie: `argos_session=${secret}` },
      }),
      {
        exposureMode: "network-accessible",
        verifySession: async () => null,
      },
    );

    expect(result).toMatchObject({ ok: false, status: 401, code: "unauthorized" });
  });
});
