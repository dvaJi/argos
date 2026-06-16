import { describe, expect, it, vi } from "vitest";

describe("initAppStores", () => {
  it("only initializes cheap startup stores and connects workload tracking", async () => {
    vi.resetModules();

    const callOrder: string[] = [];
    const startupWorkloadStore = {
      connect: vi.fn<(...args: any[]) => any>(() => {
        callOrder.push("workloadConnect");
      }),
    };
    const uiSettingsStore = {
      loadSettings: vi.fn<(...args: any[]) => any>(async () => {
        callOrder.push("loadSettings");
      }),
    };
    const providerStore = {
      initialize: vi.fn<(...args: any[]) => any>(async () => {
        callOrder.push("providerInitialize");
      }),
    };
    vi.doMock("@/stores/uiSettingsStore", () => ({
      useUiSettingsStore: () => uiSettingsStore,
    }));
    vi.doMock("@/stores/providerStore", () => ({
      useProviderStore: () => providerStore,
    }));
    vi.doMock("@/stores/startupWorkloadStore", () => ({
      useStartupWorkloadStore: () => startupWorkloadStore,
    }));
    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => ({}),
    }));
    vi.doMock("@/stores/ollamaStore", () => ({
      useOllamaStore: () => ({}),
    }));
    vi.doMock("@/stores/mcp", () => ({
      useMcpStore: () => ({}),
    }));
    vi.doMock("@/lib/ipcSubscription", () => ({
      createIpcSubscriptionScope: () => ({
        on: vi.fn<(...args: any[]) => any>(),
        cleanup: vi.fn<(...args: any[]) => any>(),
      }),
    }));
    vi.doMock("@/events", () => ({
      DEEPLINK_EVENTS: {
        MCP_INSTALL: "mcp-install",
      },
    }));

    const { initAppStores } = await import("@/lib/storeInitializer");

    await initAppStores();

    expect(callOrder).toEqual(["workloadConnect", "loadSettings", "providerInitialize"]);
    expect(startupWorkloadStore.connect).toHaveBeenCalledTimes(1);
  });
});
