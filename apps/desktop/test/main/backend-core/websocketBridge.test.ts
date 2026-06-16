import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketBridge } from "@argos/client-sdk/websocket-bridge";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sentMessages: string[] = [];
  private closeRequested = false;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      if (!this.closeRequested) {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.(new Event("open"));
      }
    }, 0);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.closeRequested = true;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  simulateMessage(data: string): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  simulateError(): void {
    this.onerror?.(new Event("error"));
  }
}

let originalWebSocket: typeof WebSocket;

beforeEach(() => {
  originalWebSocket = globalThis.WebSocket;
  (globalThis as any).WebSocket = MockWebSocket;
});

afterEach(() => {
  (globalThis as any).WebSocket = originalWebSocket;
});

describe("WebSocketBridge", () => {
  it("creates instance with url", () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");
    expect(bridge).toBeDefined();
    bridge.close();
  });

  it("creates instance with token", () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events", "my-token");
    expect(bridge).toBeDefined();
    bridge.close();
  });

  it("connects to WebSocket server", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");
    await bridge.connect();
    bridge.close();
  });

  it("includes token in URL when provided", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events", "test-token");
    await bridge.connect();
    expect(bridge).toBeDefined();
    bridge.close();
  });

  it("sends subscribe message on first listener", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");
    await bridge.connect();

    const handler = vi.fn<(...args: any[]) => any>();
    bridge.on("chat.stream.updated", handler);

    const ws = (bridge as any).ws;
    const lastMessage = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(lastMessage.type).toBe("subscribe");
    expect(lastMessage.events).toContain("chat.stream.updated");

    bridge.close();
  });

  it("removes listener and resubscribes", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");
    await bridge.connect();

    const handler1 = vi.fn<(...args: any[]) => any>();
    const handler2 = vi.fn<(...args: any[]) => any>();
    const unsub1 = bridge.on("chat.stream.updated", handler1);
    bridge.on("chat.stream.updated", handler2);

    unsub1();

    const ws = (bridge as any).ws;
    const lastMessage = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(lastMessage.type).toBe("subscribe");
    expect(lastMessage.events).toContain("chat.stream.updated");

    bridge.close();
  });

  it("dispatches events to listeners", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");
    await bridge.connect();

    const handler = vi.fn<(...args: any[]) => any>();
    bridge.on("sessions.updated", handler);

    const ws = (bridge as any).ws;

    const msg = JSON.stringify({
      type: "event",
      name: "sessions.updated",
      payload: { sessionIds: ["s1"], reason: "created" },
    });

    ws.onmessage({ data: msg });

    expect(handler).toHaveBeenCalledTimes(1);

    bridge.close();
  });

  it("dispatches to wildcard listeners", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");
    await bridge.connect();

    const handler = vi.fn<(...args: any[]) => any>();
    bridge.on("*", handler);

    const ws = (bridge as any).ws;
    ws.simulateMessage(
      JSON.stringify({
        type: "event",
        name: "chat.stream.updated",
        payload: { sessionId: "test", content: "hello" },
      }),
    );

    expect(handler).not.toHaveBeenCalled();

    bridge.close();
  });

  it("ignores malformed messages", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");
    await bridge.connect();

    const handler = vi.fn<(...args: any[]) => any>();
    bridge.on("chat.stream.updated", handler);

    const ws = (bridge as any).ws;
    ws.simulateMessage("not json");
    ws.simulateMessage("{}");
    ws.simulateMessage(JSON.stringify({ type: "unknown" }));

    expect(handler).not.toHaveBeenCalled();

    bridge.close();
  });

  it("queues messages when not connected", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");

    const handler = vi.fn<(...args: any[]) => any>();
    bridge.on("chat.stream.updated", handler);

    expect((bridge as any).pendingMessages.length).toBeGreaterThan(0);

    bridge.close();
  });

  it("flushes pending messages on connect", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");

    bridge.on("chat.stream.updated", vi.fn<(...args: any[]) => any>());
    const pendingCount = (bridge as any).pendingMessages.length;
    expect(pendingCount).toBeGreaterThan(0);

    await bridge.connect();

    expect((bridge as any).pendingMessages.length).toBe(0);

    bridge.close();
  });

  it("close stops reconnect attempts", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");
    await bridge.connect();
    bridge.close();

    expect((bridge as any).closed).toBe(true);
    expect((bridge as any).reconnectTimer).toBeNull();
  });

  it("resubscribes all events on reconnect", async () => {
    const bridge = new WebSocketBridge("ws://localhost:9527/api/v1/events");
    await bridge.connect();

    bridge.on("chat.stream.updated", vi.fn<(...args: any[]) => any>());
    bridge.on("sessions.updated", vi.fn<(...args: any[]) => any>());

    const ws = (bridge as any).ws;
    const subscribeMessages = ws.sentMessages
      .map((m: string) => JSON.parse(m))
      .filter((m: any) => m.type === "subscribe");

    expect(subscribeMessages.length).toBeGreaterThanOrEqual(1);
    const lastSubscribe = subscribeMessages[subscribeMessages.length - 1];
    expect(lastSubscribe.events).toContain("chat.stream.updated");
    expect(lastSubscribe.events).toContain("sessions.updated");

    bridge.close();
  });
});
