import { describe, expect, it, vi } from "vitest";

// Short-circuit the import chain: daemonRouteProxy pulls in the sidecar/electron graph.
vi.mock("#/routes/daemonRouteProxy", () => ({
  invokeDaemonRoute: vi.fn(),
}));

import { DaemonMirrorStore } from "../../../../src/main/presenter/configPresenter/daemonMirrorStores";

type TestData = Record<string, unknown>;

const neverHydrate = () => new Promise<TestData>(() => {});

describe("DaemonMirrorStore", () => {
  it("returns the defaultValue for missing keys (StoreLike contract)", () => {
    const store = new DaemonMirrorStore<TestData>({
      name: "test",
      defaults: {},
      hydrate: neverHydrate,
    });

    // Regression for the MCP startup crash: McpConfHelper.getMcpServers() read
    // `get("mcpServers", defaults)` pre-hydration and crashed on undefined.
    const defaults = { mcpServers: { demo: { type: "stdio" } } };
    expect(store.get("mcpServers", defaults)).toBe(defaults);
    expect(store.get("missing")).toBeUndefined();
  });

  it("has() reflects snapshot keys", () => {
    const store = new DaemonMirrorStore<TestData>({
      name: "test",
      defaults: { a: 1 },
      hydrate: neverHydrate,
    });

    expect(store.has("a")).toBe(true);
    expect(store.has("b")).toBe(false);
  });

  it("whenHydrated() awaits an in-flight hydration and updates the snapshot", async () => {
    let resolveHydrate: (data: TestData) => void = () => {};
    const store = new DaemonMirrorStore<TestData>({
      name: "test",
      defaults: {},
      hydrate: () =>
        new Promise<TestData>((resolve) => {
          resolveHydrate = resolve;
        }),
    });

    const refresh = store.refresh();
    const whenReady = store.whenHydrated();
    resolveHydrate({ mcpServers: { fromDaemon: true } });
    await Promise.all([refresh, whenReady]);

    expect(store.get("mcpServers", { fallback: true })).toEqual({ fromDaemon: true });
  });

  it("whenHydrated() does not re-hydrate while fresh", async () => {
    const hydrate = vi.fn(() => Promise.resolve<TestData>({ ready: true }));
    const store = new DaemonMirrorStore<TestData>({ name: "test", defaults: {}, hydrate });

    await store.whenHydrated();
    await store.whenHydrated();

    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it("resolves whenHydrated() even if hydration fails, keeping defaults readable", async () => {
    const store = new DaemonMirrorStore<TestData>({
      name: "test",
      defaults: { fallback: true },
      hydrate: () => Promise.reject(new Error("daemon down")),
    });

    await expect(store.whenHydrated()).resolves.toBeUndefined();
    expect(store.get("fallback", false)).toBe(true);
  });

  it("serves daemon data after hydration while get(default) still covers gaps", async () => {
    const store = new DaemonMirrorStore<TestData>({
      name: "mcp-settings",
      defaults: {},
      hydrate: () => Promise.resolve({ mcpEnabled: true }),
    });

    await store.whenHydrated();

    expect(store.get("mcpEnabled", false)).toBe(true);
    expect(store.get("mcpServers", { seeded: true })).toEqual({ seeded: true });
  });
});
