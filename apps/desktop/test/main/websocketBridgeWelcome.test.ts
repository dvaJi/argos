import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketBridge } from "@argos/client-sdk";

class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor() {
    sockets.push(this);
  }
}

const sockets: MockWebSocket[] = [];

describe("WebSocketBridge event readiness", () => {
  afterEach(() => {
    sockets.length = 0;
    vi.unstubAllGlobals();
  });

  it("waits for and validates the daemon welcome before reporting event readiness", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const bridge = new WebSocketBridge("ws://daemon.test/api/v1/events", "session-token");
    const connected = bridge.connect();
    const socket = sockets[0];

    socket.onopen?.();
    await connected;

    const ready = bridge.waitForWelcome();
    socket.onmessage?.({
      data: JSON.stringify({
        type: "welcome",
        environmentId: "environment-1",
        serverVersion: "0.2.0",
        protocolVersion: 1,
        eventTransport: { ready: true, protocol: "argos-v1" },
      }),
    });

    await expect(ready).resolves.toEqual({
      environmentId: "environment-1",
      serverVersion: "0.2.0",
      protocolVersion: 1,
      eventTransport: { ready: true, protocol: "argos-v1" },
    });
  });

  it("rejects pending route and welcome operations immediately when the session is revoked", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const bridge = new WebSocketBridge("ws://daemon.test/api/v1/events", "session-token");
    const connected = bridge.connect();
    const socket = sockets[0];
    socket.onopen?.();
    await connected;

    const route = bridge.invoke("connection.describeEnvironment", {
      protocolVersion: 1,
      runtimeKind: "electron",
    });
    const welcome = bridge.waitForWelcome();
    socket.onclose?.({ code: 4001 });

    await expect(route).rejects.toThrow("Remote session revoked");
    await expect(welcome).rejects.toThrow("Remote session revoked");
  });
});
