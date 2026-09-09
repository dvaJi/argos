import { describe, expect, it, vi } from "bun:test";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";

/** Route surface for the managed toolchains service. */

const createToolchainsStub = () => ({
  list: vi.fn(async () => [
    {
      tool: "node",
      source: "managed",
      explicit: false,
      path: "/tools/node/v24.18.0/node.exe",
      version: "v24.18.0",
      error: null,
      pin: "v24.18.0",
      install: null,
    },
    {
      tool: "uv",
      source: "unconfigured",
      explicit: false,
      path: null,
      version: null,
      error: null,
      pin: "0.9.18",
      install: null,
    },
    {
      tool: "ripgrep",
      source: "unconfigured",
      explicit: false,
      path: null,
      version: null,
      error: null,
      pin: null,
      install: null,
    },
  ]),
  status: vi.fn(async (tool: string) => ({
    tool,
    source: "unconfigured",
    explicit: false,
    path: null,
    version: null,
    error: null,
    pin: tool === "ripgrep" ? null : "x",
    install: null,
  })),
  setSource: vi.fn(async (tool: string, source: string, customPath?: string) => ({
    tool,
    source,
    explicit: true,
    path: customPath ?? null,
    version: null,
    error: null,
    pin: null,
    install: null,
  })),
  removeSource: vi.fn(async (tool: string) => ({
    tool,
    source: "unconfigured",
    explicit: false,
    path: null,
    version: null,
    error: null,
    pin: null,
    install: null,
  })),
  install: vi.fn((_tool: string) => ({ started: true })),
  cancelInstall: vi.fn((_tool: string) => {}),
});

const createDispatcher = (toolchains?: ReturnType<typeof createToolchainsStub>) =>
  createDaemonDispatcher(
    {
      getDefaultModel: vi.fn(() => ({ providerId: "provider-1", modelId: "model-1" })),
    } as any,
    { publish: vi.fn() } as any,
    {} as any,
    {} as any,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    "unknown",
    undefined,
    undefined,
    undefined,
    undefined,
    toolchains as any,
  );

describe("toolchains routes", () => {
  it("lists toolchain status", async () => {
    const toolchains = createToolchainsStub();
    const dispatcher = createDispatcher(toolchains);

    await expect(dispatcher("toolchains.list", {})).resolves.toEqual({
      tools: await toolchains.list(),
    });
    expect(toolchains.list).toHaveBeenCalled();
  });

  it("sets and removes explicit sources", async () => {
    const toolchains = createToolchainsStub();
    const dispatcher = createDispatcher(toolchains);

    await expect(
      dispatcher("toolchains.setSource", { tool: "node", source: "custom", path: "/opt/node/node" }),
    ).resolves.toEqual({
      status: {
        tool: "node",
        source: "custom",
        explicit: true,
        path: "/opt/node/node",
        version: null,
        error: null,
        pin: null,
        install: null,
      },
    });
    expect(toolchains.setSource).toHaveBeenCalledWith("node", "custom", "/opt/node/node");

    await expect(dispatcher("toolchains.removeSource", { tool: "uv" })).resolves.toEqual({
      status: {
        tool: "uv",
        source: "unconfigured",
        explicit: false,
        path: null,
        version: null,
        error: null,
        pin: null,
        install: null,
      },
    });
  });

  it("rejects a custom source without a path", async () => {
    const dispatcher = createDispatcher(createToolchainsStub());
    await expect(dispatcher("toolchains.setSource", { tool: "node", source: "custom" })).rejects.toThrow();
  });

  it("starts and cancels installs", async () => {
    const toolchains = createToolchainsStub();
    const dispatcher = createDispatcher(toolchains);

    await expect(dispatcher("toolchains.install", { tool: "uv" })).resolves.toMatchObject({ started: true });
    expect(toolchains.install).toHaveBeenCalledWith("uv");

    await expect(dispatcher("toolchains.cancelInstall", { tool: "uv" })).resolves.toMatchObject({ cancelled: true });
    expect(toolchains.cancelInstall).toHaveBeenCalledWith("uv");
  });

  it("throws a clear error when the service is unavailable", async () => {
    const dispatcher = createDispatcher(undefined);
    await expect(dispatcher("toolchains.list", {})).rejects.toThrow("Toolchain service is not available");
  });
});
