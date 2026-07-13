import { describe, it, expect, vi } from "vitest";
import { HybridBridge } from "../../../src/preload/hybridBridge";
import { CONNECTION_STATE_DEFAULT, type ConnectionState } from "@argos/shared-contracts/connection";
const noopBridge = {
  invoke: vi.fn<() => Promise<unknown>>(),
  on: vi.fn<() => () => void>(() => () => {}),
} as any;

async function openRemoteSession(): Promise<{
  bridge: HybridBridge;
  wsBridge: {
    getUrl: () => string;
    isConnected: () => boolean;
    onConnectionStateChange: (listener: (state: ConnectionState) => void) => () => void;
    close: () => void;
  };
  emitState: (state: ConnectionState) => void;
}> {
  const bridge = new HybridBridge(noopBridge);
  let listener: ((state: ConnectionState) => void) | null = null;
  const wsBridge = {
    getUrl: () => "ws://test:1/api/v1/events",
    isConnected: () => true,
    onConnectionStateChange: (nextListener: (state: ConnectionState) => void) => {
      listener = nextListener;
      nextListener({
        mode: "remote",
        url: "ws://test:1/api/v1/events",
        connected: true,
        lastError: null,
      });
      return () => {
        listener = null;
      };
    },
    close: vi.fn(),
  };
  bridge.setWsBridge(wsBridge as any, "remote");
  return {
    bridge,
    wsBridge,
    emitState: (state: ConnectionState) => {
      listener?.(state);
    },
  };
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

  it("updates connection state from ws bridge notifications", async () => {
    const { bridge, emitState } = await openRemoteSession();
    emitState({
      mode: "remote",
      url: "ws://test:1/api/v1/events",
      connected: false,
      lastError: "WebSocket connection failed",
    });
    expect(bridge.getConnectionState()).toMatchObject({
      mode: "remote",
      url: "ws://test:1/api/v1/events",
      connected: false,
      lastError: "WebSocket connection failed",
    });
  });

  it("routes daemon-owned invokes through the WebSocket bridge once connected", async () => {
    const ipcInvoke = vi.fn(() => Promise.resolve({ from: "ipc" }));
    const wsInvoke = vi.fn(() => Promise.resolve({ from: "ws" }));
    const bridge = new HybridBridge({
      invoke: ipcInvoke,
      on: vi.fn(() => () => {}),
    } as any);

    bridge.setWsBridge(
      {
        connect: vi.fn(() => Promise.resolve()),
        close: vi.fn(),
        getUrl: () => "ws://test:1/api/v1/events",
        isConnected: () => true,
        onConnectionStateChange: vi.fn(() => () => {}),
        invoke: wsInvoke,
        on: vi.fn(() => () => {}),
      } as any,
      "local",
    );

    await bridge.invoke("chat.sendMessage" as any, {} as any);

    expect(wsInvoke).toHaveBeenCalledTimes(1);
    expect(ipcInvoke).not.toHaveBeenCalled();
  });

  it("waits for the initial daemon connection before invoking a route", async () => {
    const wsInvoke = vi.fn(() => Promise.resolve({ from: "ws" }));
    let connected = false;
    let finishConnection: (() => void) | undefined;
    const bridge = new HybridBridge(noopBridge);
    bridge.setWsBridge(
      {
        close: vi.fn(),
        getUrl: () => "ws://test:1/api/v1/events",
        isConnected: () => connected,
        onConnectionStateChange: vi.fn(() => () => {}),
        invoke: wsInvoke,
        on: vi.fn(() => () => {}),
      } as any,
      "local",
    );
    bridge.setPendingBridgeConnection(
      new Promise<void>((resolve) => {
        finishConnection = () => {
          connected = true;
          resolve();
        };
      }) as any,
    );

    const invoke = bridge.invoke("chat.sendMessage" as any, {} as any);
    expect(wsInvoke).not.toHaveBeenCalled();
    finishConnection?.();
    await invoke;

    expect(wsInvoke).toHaveBeenCalledTimes(1);
  });

  it("rejects daemon-owned invokes when no daemon bridge is available", async () => {
    const bridge = new HybridBridge(noopBridge);
    await expect(bridge.invoke("chat.sendMessage" as any, {} as any)).rejects.toThrow("Daemon bridge is not connected");
  });
});
