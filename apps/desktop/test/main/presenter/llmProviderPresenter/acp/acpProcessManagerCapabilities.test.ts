import { EventEmitter } from "events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

const sdkMock = vi.hoisted(() => ({
  initializeResponse: {
    protocolVersion: 1,
    agentInfo: { name: "Agent One", version: "1.0.0" },
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: {
        image: true,
        audio: true,
        embeddedContext: true,
      },
      sessionCapabilities: {
        list: {},
        resume: {},
        close: {},
        fork: {},
      },
      mcpCapabilities: {
        http: true,
      },
    },
    authMethods: [{ id: "terminal", name: "Terminal", type: "terminal" }],
  },
}));

vi.mock("@agentclientprotocol/sdk", () => {
  const connection = {
    closed: new Promise<void>(() => {}),
    agent: {
      request: vi.fn<(...args: any[]) => any>(async () => sdkMock.initializeResponse),
      notify: vi.fn<(...args: any[]) => any>(async () => undefined),
    },
  };
  const app = {
    onRequest: vi.fn<(...args: any[]) => any>(() => app),
    onNotification: vi.fn<(...args: any[]) => any>(() => app),
    connect: vi.fn<(...args: any[]) => any>(() => connection),
  };
  return {
    PROTOCOL_VERSION: 1,
    methods: {
      agent: {
        initialize: "initialize",
        session: {
          new: "session/new",
          load: "session/load",
          resume: "session/resume",
          close: "session/close",
          fork: "session/fork",
          setMode: "session/set_mode",
          setConfigOption: "session/set_config_option",
          prompt: "session/prompt",
          cancel: "session/cancel",
        },
      },
      client: {
        session: { requestPermission: "session/request_permission", update: "session/update" },
        fs: { readTextFile: "fs/read_text_file", writeTextFile: "fs/write_text_file" },
        terminal: {
          create: "terminal/create",
          output: "terminal/output",
          release: "terminal/release",
          waitForExit: "terminal/wait_for_exit",
          kill: "terminal/kill",
        },
      },
    },
    client: () => app,
  };
});

vi.mock("electron", () => ({
  app: {
    getVersion: vi.fn<(...args: any[]) => any>(() => "0.0.0-test"),
    getPath: vi.fn<(...args: any[]) => any>(() => "/tmp"),
  },
}));

vi.mock("@/eventbus", () => ({
  eventBus: {
    sendToRenderer: vi.fn<(...args: any[]) => any>(),
  },
  SendTarget: {
    ALL_WINDOWS: "ALL_WINDOWS",
  },
}));

vi.mock("@/routes/publishArgosEvent", () => ({
  publishArgosEvent: vi.fn<(...args: any[]) => any>(),
}));

class MockChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  pid = 1234;
  killed = false;
  exitCode = null;
  signalCode = null;
  kill = vi.fn<(...args: any[]) => any>(() => true);
}

describe("AcpProcessManager initialized capabilities", () => {
  it("carries initialize capabilities into the ready process handle", async () => {
    const { AcpProcessManager } = await import("@/presenter/llmProviderPresenter/acp/acpProcessManager");
    const manager = new AcpProcessManager({
      providerId: "acp",
      resolveLaunchSpec: vi.fn<(...args: any[]) => any>(),
    });
    const child = new MockChild();
    vi.spyOn<(...args: any[]) => any>(manager as any, "spawnAgentProcess").mockResolvedValue(child);

    const handle = await (manager as any).spawnProcessOnce(
      {
        id: "agent-1",
        name: "Agent One",
        command: "agent",
      },
      "/tmp/workspace",
      {
        agentId: "agent-1",
        source: "manual",
        distributionType: "manual",
        command: "agent",
        args: [],
        env: {},
      },
      "manual:agent",
    );

    expect(handle.promptCapabilities).toEqual({
      image: true,
      audio: true,
      embeddedContext: true,
    });
    expect(handle.sessionCapabilities).toEqual({
      list: {},
      resume: {},
      close: {},
      fork: {},
    });
    expect(handle.supportsLoadSession).toBe(true);
    expect(handle.supportsSessionList).toBe(true);
    expect(handle.supportsSessionResume).toBe(true);
    expect(handle.supportsSessionClose).toBe(true);
    expect(handle.supportsSessionFork).toBe(true);
    expect(handle.authMethods).toEqual([{ id: "terminal", name: "Terminal", type: "terminal" }]);
    expect(handle.capabilitySnapshot?.supports).toEqual({
      loadSession: true,
      sessionList: true,
      sessionResume: true,
      sessionClose: true,
      sessionFork: true,
    });
  });
});
