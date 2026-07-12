import { describe, expect, it, vi } from "vitest";
import { createDesktopAcpPorts } from "../../../../../src/main/presenter/llmProviderPresenter/acp/desktopPorts";

const appMock = vi.hoisted(() => ({
  getPath: vi.fn<(...args: any[]) => any>(),
  getVersion: vi.fn<(...args: any[]) => any>(),
  getAppPath: vi.fn<(...args: any[]) => any>(),
  on: vi.fn<(...args: any[]) => any>(),
}));

const runtimeHelperMock = vi.hoisted(() => ({
  initializeRuntimes: vi.fn<(...args: any[]) => any>(),
  expandPath: vi.fn<(...args: any[]) => any>(),
  replaceWithRuntimeCommand: vi.fn<(...args: any[]) => any>(),
  prependBundledRuntimeToEnv: vi.fn<(...args: any[]) => any>(),
}));

const eventBusMock = vi.hoisted(() => ({
  sendToRenderer: vi.fn<(...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
}));

const publishArgosEventMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>());
const shouldRejectAcpTextReadMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>());
const buildBinaryReadGuidanceMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>());

vi.mock("electron", () => ({
  app: appMock,
}));

vi.mock("#/eventbus", () => ({
  eventBus: eventBusMock,
  SendTarget: {
    ALL_WINDOWS: "ALL_WINDOWS",
  },
}));

vi.mock("#/routes/publishArgosEvent", () => ({
  publishArgosEvent: publishArgosEventMock,
}));

vi.mock("#/lib/runtimeHelper", () => ({
  RuntimeHelper: {
    getInstance: vi.fn(() => runtimeHelperMock),
  },
}));

vi.mock("#/lib/binaryReadGuard", () => ({
  shouldRejectAcpTextRead: shouldRejectAcpTextReadMock,
  buildBinaryReadGuidance: buildBinaryReadGuidanceMock,
}));

describe("createDesktopAcpPorts", () => {
  it("bridges Electron runtime, event, lifecycle, and fs helpers", async () => {
    const beforeQuitHandler = vi.fn();
    appMock.getPath.mockImplementation((key: string) => `/tmp/${key}`);
    appMock.getVersion.mockReturnValue("9.9.9");
    appMock.getAppPath.mockReturnValue("/app/root");
    appMock.on.mockImplementation((eventName: string, handler: () => void) => {
      if (eventName === "before-quit") {
        beforeQuitHandler.mockImplementation(handler);
      }
    });
    runtimeHelperMock.initializeRuntimes.mockReturnValue(undefined);
    runtimeHelperMock.expandPath.mockImplementation((target: string) => `expanded:${target}`);
    runtimeHelperMock.replaceWithRuntimeCommand.mockImplementation((command: string) => `runtime:${command}`);
    runtimeHelperMock.prependBundledRuntimeToEnv.mockImplementation((env: Record<string, string>) => ({
      ...env,
      PATH: "/runtime/bin",
    }));
    shouldRejectAcpTextReadMock.mockResolvedValue({ reject: true, reason: "binary" });
    buildBinaryReadGuidanceMock.mockReturnValue("guidance");

    const ports = createDesktopAcpPorts();

    expect(ports.paths.tempDir()).toBe("/tmp/temp");
    expect(ports.paths.homeDir()).toBe("/tmp/home");
    expect(ports.paths.userDataDir()).toBe("/tmp/userData");
    expect(ports.paths.appVersion()).toBe("9.9.9");
    expect(ports.paths.appPath()).toBe("/app/root");

    expect(ports.runtime.initializeRuntimes()).toBeUndefined();
    expect(ports.runtime.expandPath("~/.argos")).toBe("expanded:~/.argos");
    expect(ports.runtime.resolveCommand("node", true, true)).toBe("runtime:node");
    expect(ports.runtime.buildSpawnEnv({ PATH: "/usr/bin" })).toEqual({ PATH: "/runtime/bin" });

    ports.events.broadcast("config.agents.changed", { agentIds: ["agent-1"] } as any);
    ports.events.broadcastToAll("config.agents.changed", { agentIds: ["agent-1"] } as any);
    ports.events.publish("config.agents.changed", { agentIds: ["agent-1"] } as any);

    expect(eventBusMock.sendToRenderer).toHaveBeenCalledWith("config.agents.changed", "ALL_WINDOWS", {
      agentIds: ["agent-1"],
    });
    expect(eventBusMock.send).toHaveBeenCalledWith("config.agents.changed", "ALL_WINDOWS", {
      agentIds: ["agent-1"],
    });
    expect(publishArgosEventMock).toHaveBeenCalledWith("config.agents.changed", { agentIds: ["agent-1"] });

    ports.fs.shouldRejectAcpTextRead("/tmp/file.txt");
    ports.fs.buildBinaryReadGuidance("/tmp/file.txt", "text/plain", "acp");
    expect(shouldRejectAcpTextReadMock).toHaveBeenCalledWith("/tmp/file.txt");
    expect(buildBinaryReadGuidanceMock).toHaveBeenCalledWith("/tmp/file.txt", "text/plain", "acp");

    ports.lifecycle.onBeforeQuit(beforeQuitHandler);
    expect(appMock.on).toHaveBeenCalledWith("before-quit", expect.any(Function));
    expect(beforeQuitHandler).not.toHaveBeenCalled();
  });
});
