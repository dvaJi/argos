import { createBridge } from "@argos/client-sdk/ipc-bridge";
import { ARGOS_EVENT_CHANNEL, ARGOS_ROUTE_INVOKE_CHANNEL } from "@shared/contracts/channels";
import { afterEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBridge", () => {
  it("invokes typed routes through the shared IPC channel", async () => {
    const ipcRenderer = {
      invoke: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        version: 1,
        values: {
          fontSizeLevel: 2,
        },
      }),
      on: vi.fn<(...args: any[]) => any>(),
      removeListener: vi.fn<(...args: any[]) => any>(),
    };

    const bridge = createBridge(ipcRenderer);
    const result = await bridge.invoke("settings.getSnapshot", {
      keys: ["fontSizeLevel"],
    });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(ARGOS_ROUTE_INVOKE_CHANNEL, "settings.getSnapshot", {
      keys: ["fontSizeLevel"],
    });
    expect(result).toEqual({
      version: 1,
      values: {
        fontSizeLevel: 2,
      },
    });
  });

  it("validates typed event payloads before calling listeners", () => {
    let registeredListener: ((event: unknown, payload: unknown) => void) | undefined;

    const ipcRenderer = {
      invoke: vi.fn<(...args: any[]) => any>(),
      on: vi.fn<(...args: any[]) => any>((_channel: string, listener: (event: unknown, payload: unknown) => void) => {
        registeredListener = listener;
      }),
      removeListener: vi.fn<(...args: any[]) => any>(),
    };

    const bridge = createBridge(ipcRenderer);
    const listener = vi.fn<(...args: any[]) => any>();
    const unsubscribe = bridge.on("settings.changed", listener);

    expect(ipcRenderer.on).toHaveBeenCalledWith(ARGOS_EVENT_CHANNEL, expect.any(Function));

    registeredListener?.(
      {},
      {
        name: "settings.changed",
        payload: {
          changedKeys: ["fontSizeLevel"],
          version: 1,
          values: {
            fontSizeLevel: 3,
          },
        },
      },
    );

    expect(listener).toHaveBeenCalledWith({
      changedKeys: ["fontSizeLevel"],
      version: 1,
      values: {
        fontSizeLevel: 3,
      },
    });

    unsubscribe();

    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(ARGOS_EVENT_CHANNEL, expect.any(Function));
  });

  it("shares a single IPC listener across multiple typed event subscriptions", () => {
    let registeredListener: ((event: unknown, payload: unknown) => void) | undefined;

    const ipcRenderer = {
      invoke: vi.fn<(...args: any[]) => any>(),
      on: vi.fn<(...args: any[]) => any>((_channel: string, listener: (event: unknown, payload: unknown) => void) => {
        registeredListener = listener;
      }),
      removeListener: vi.fn<(...args: any[]) => any>(),
    };

    const bridge = createBridge(ipcRenderer);
    const firstListener = vi.fn<(...args: any[]) => any>();
    const secondListener = vi.fn<(...args: any[]) => any>();

    const unsubscribeFirst = bridge.on("settings.changed", firstListener);
    const unsubscribeSecond = bridge.on("settings.changed", secondListener);

    expect(ipcRenderer.on).toHaveBeenCalledTimes(1);

    registeredListener?.(
      {},
      {
        name: "settings.changed",
        payload: {
          changedKeys: ["fontSizeLevel"],
          version: 1,
          values: {
            fontSizeLevel: 3,
          },
        },
      },
    );

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    expect(ipcRenderer.removeListener).not.toHaveBeenCalled();

    unsubscribeSecond();
    expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(ARGOS_EVENT_CHANNEL, expect.any(Function));
  });

  it("continues dispatching when one event listener throws", () => {
    let registeredListener: ((event: unknown, payload: unknown) => void) | undefined;
    const consoleErrorSpy = vi.spyOn<(...args: any[]) => any>(console, "error").mockImplementation(() => {});

    const ipcRenderer = {
      invoke: vi.fn<(...args: any[]) => any>(),
      on: vi.fn<(...args: any[]) => any>((_channel: string, listener: (event: unknown, payload: unknown) => void) => {
        registeredListener = listener;
      }),
      removeListener: vi.fn<(...args: any[]) => any>(),
    };

    const bridge = createBridge(ipcRenderer);
    const failingListener = vi.fn<(...args: any[]) => any>(() => {
      throw new Error("listener failed");
    });
    const succeedingListener = vi.fn<(...args: any[]) => any>();

    bridge.on("settings.changed", failingListener);
    bridge.on("settings.changed", succeedingListener);

    registeredListener?.(
      {},
      {
        name: "settings.changed",
        payload: {
          changedKeys: ["fontSizeLevel"],
          version: 1,
          values: {
            fontSizeLevel: 3,
          },
        },
      },
    );

    expect(failingListener).toHaveBeenCalledTimes(1);
    expect(succeedingListener).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ArgosBridge] Event listener failed for settings.changed:",
      expect.any(Error),
    );
  });

  it("rejects invalid route responses", async () => {
    const ipcRenderer = {
      invoke: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        stopped: "yes",
      }),
      on: vi.fn<(...args: any[]) => any>(),
      removeListener: vi.fn<(...args: any[]) => any>(),
    };

    const bridge = createBridge(ipcRenderer);

    await expect(
      bridge.invoke("chat.stopStream", {
        sessionId: "session-1",
      }),
    ).rejects.toThrow();
  });
});
