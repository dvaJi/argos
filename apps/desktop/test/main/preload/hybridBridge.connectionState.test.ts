import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HybridBridge, WebSocketBridgeAdapter } from "../../../src/preload/hybridBridge";
import { CONNECTION_STATE_DEFAULT, type ConnectionState } from "@shared/contracts/connection";

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

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }
}

let originalWebSocket: typeof WebSocket;
const noopBridge = {
  invoke: vi.fn<() => Promise<unknown>>(),
  on: vi.fn<() => () => void>(() => () => {}),
} as any;

let currentMockWs: MockWebSocket | null = null;

function passthroughWebSocketFactory(this: unknown, url: string): MockWebSocket {
  currentMockWs = new MockWebSocket(url);
  return currentMockWs;
}

beforeEach(() => {
  originalWebSocket = globalThis.WebSocket;
  currentMockWs = null;
  (globalThis as any).WebSocket = passthroughWebSocketFactory;
});

afterEach(() => {
  (globalThis as any).WebSocket = originalWebSocket;
});

async function openRemoteSession(): Promise<{
  bridge: HybridBridge;
  adapter: WebSocketBridgeAdapter;
  mock: MockWebSocket;
}> {
  const bridge = new HybridBridge(noopBridge);
  const adapter = new WebSocketBridgeAdapter("ws://test:1/api/v1/events");
  const connectPromise = (async () => {
    bridge.setWsBridge(adapter, "remote");
    await adapter.connect();
  })();
  if (!currentMockWs) throw new Error("Mock socket not created");
  currentMockWs.simulateOpen();
  await connectPromise;
  return { bridge, adapter, mock: currentMockWs };
}

describe("HybridBridge connection state", () => {
  it("starts in the default local state", () => {
    const bridge = new HybridBridge(noopBridge);
    expect(bridge.getConnectionState()).toEqual(CONNECTION_STATE_DEFAULT);
  });

  it("notifies listeners on state changes", () => {
    const bridge = new HybridBridge(noopBridge);
    const states: ConnectionState[] = [];
    bridge.onConnectionStateChange((state) => states.push(state));

    bridge.setWsBridge(null);
    expect(states.at(-1)).toEqual({
      mode: "local",
      url: null,
      connected: false,
      lastError: null,
    });
  });

  it("setWsBridge(adapter) marks the state as remote and forwards open", async () => {
    const { bridge } = await openRemoteSession();
    const state = bridge.getConnectionState();
    expect(state.mode).toBe("remote");
    expect(state.url).toBe("ws://test:1/api/v1/events");
    expect(state.connected).toBe(true);
    expect(state.lastError).toBeNull();
  });

  it("setWsBridge(null) after a remote session resets to local", async () => {
    const { bridge } = await openRemoteSession();
    bridge.setWsBridge(null);
    expect(bridge.getConnectionState().mode).toBe("local");
    expect(bridge.getConnectionState().url).toBeNull();
  });

  it("a WebSocket close before disconnect schedules a reconnect; disconnect cancels it", async () => {
    vi.useFakeTimers();
    try {
      const { mock, adapter, bridge } = await openRemoteSession();
      expect(bridge.getConnectionState().connected).toBe(true);

      // First instance closes. The adapter should schedule a reconnect 3s later.
      const firstMock = mock;
      firstMock.simulateClose();
      expect(bridge.getConnectionState().connected).toBe(false);

      // Disconnect the adapter before the reconnect timer fires.
      adapter.disconnect();
      await vi.advanceTimersByTimeAsync(10_000);

      // No new mock socket should have been constructed after the disconnect.
      // (currentMockWs is the latest; it should still be the first one we made.)
      expect(currentMockWs).toBe(firstMock);
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes daemon-owned invokes through the WebSocket bridge once attached", async () => {
    const ipcInvoke = vi.fn(() => Promise.resolve({ from: "ipc" }));
    const wsInvoke = vi.fn(() => Promise.resolve({ from: "ws" }));
    const bridge = new HybridBridge({
      invoke: ipcInvoke,
      on: vi.fn(() => () => {}),
    } as any);

    bridge.setWsBridge(
      {
        connect: vi.fn(() => Promise.resolve()),
        disconnect: vi.fn(),
        getUrl: () => "ws://test:1/api/v1/events",
        isConnected: () => false,
        setConnectionStateSink: vi.fn(),
        invoke: wsInvoke,
        on: vi.fn(() => () => {}),
      } as any,
      "local",
    );

    await bridge.invoke("chat.sendMessage" as any, {} as any);

    expect(wsInvoke).toHaveBeenCalledTimes(1);
    expect(ipcInvoke).not.toHaveBeenCalled();
  });

  it("rejects daemon-owned invokes when no daemon bridge is available", async () => {
    const bridge = new HybridBridge(noopBridge);
    await expect(bridge.invoke("chat.sendMessage" as any, {} as any)).rejects.toThrow("Daemon bridge is not available");
  });
});
