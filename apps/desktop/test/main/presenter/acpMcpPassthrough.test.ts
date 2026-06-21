import { describe, it, expect, vi } from "vitest";
import type * as schema from "@agentclientprotocol/sdk";
import { convertMcpConfigToAcpFormat } from "../../../src/main/presenter/llmProviderPresenter/acp/mcpConfigConverter";
import { filterMcpServersByTransportSupport } from "../../../src/main/presenter/llmProviderPresenter/acp/mcpTransportFilter";
import { AcpSessionManager } from "../../../src/main/presenter/llmProviderPresenter/acp/acpSessionManager";

vi.mock("electron", () => ({
  app: {
    on: vi.fn<(...args: any[]) => any>(),
    getPath: vi.fn<(...args: any[]) => any>(() => "/tmp"),
    getVersion: vi.fn<(...args: any[]) => any>(() => "0.0.0-test"),
  },
}));

const acpAgentRequest = (handlers: Record<string, (params: any) => any>) =>
  vi.fn(async (method: string, params: any) => handlers[method]?.(params));

const callsFor = (mock: { mock: { calls: any[][] } }, method: string) => mock.mock.calls.filter((c) => c[0] === method);

describe("ACP MCP passthrough helpers", () => {
  it("converts stdio MCP config to ACP format", () => {
    const server = convertMcpConfigToAcpFormat("test", {
      type: "stdio",
      command: "node",
      args: ["server.js"],
      env: { FOO: "bar", NUM: 1 },
      descriptions: "desc",
      icons: "🧪",
      autoApprove: [],
      enabled: true,
    });

    expect(server && "type" in server).toBe(false);
    expect(server).toMatchObject({
      name: "test",
      command: "node",
      args: ["server.js"],
      env: [
        { name: "FOO", value: "bar" },
        { name: "NUM", value: "1" },
      ],
    });
  });

  it("filters http/sse MCP servers by agent transport capabilities", () => {
    const servers: schema.McpServer[] = [
      { name: "stdio", command: "node", args: [], env: [] },
      { type: "http", name: "http", url: "http://localhost", headers: [] },
      { type: "sse", name: "sse", url: "http://localhost/sse", headers: [] },
    ];

    expect(filterMcpServersByTransportSupport(servers, { http: false, sse: false })).toEqual([
      { name: "stdio", command: "node", args: [], env: [] },
    ]);

    expect(filterMcpServersByTransportSupport(servers, { http: true, sse: false })).toEqual([
      { name: "stdio", command: "node", args: [], env: [] },
      { type: "http", name: "http", url: "http://localhost", headers: [] },
    ]);
  });
});

describe("AcpSessionManager MCP server injection", () => {
  it("passes only compatible selected MCP servers to newSession", async () => {
    const configPresenter = {
      getAgentMcpSelections: vi.fn<(...args: any[]) => any>().mockResolvedValue(["stdio-1", "http-1"]),
      getMcpServers: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        "stdio-1": {
          type: "stdio",
          command: "node",
          args: ["server.js"],
          env: {},
          descriptions: "",
          icons: "",
          autoApprove: [],
          enabled: true,
        },
        "http-1": {
          type: "http",
          command: "",
          args: [],
          env: {},
          descriptions: "",
          icons: "",
          autoApprove: [],
          enabled: true,
          baseUrl: "http://localhost",
          customHeaders: { Authorization: "Bearer test" },
        },
      }),
    };

    const manager = new AcpSessionManager({
      providerId: "acp",
      processManager: {} as any,
      sessionPersistence: {
        getSessionData: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
      } as any,
      configPresenter: configPresenter as any,
    });

    const request = acpAgentRequest({ "session/new": async () => ({ sessionId: "s1" }) });
    const handle = {
      connection: { agent: { request } },
      availableModes: [],
      currentModeId: null,
      mcpCapabilities: { http: false, sse: false },
    } as any;

    await (manager as any).initializeSession(handle, "conv1", { id: "agent1", name: "Agent 1" }, "/tmp");

    expect(request).toHaveBeenCalledWith("session/new", {
      cwd: "/tmp",
      mcpServers: [{ name: "stdio-1", command: "node", args: ["server.js"], env: [] }],
    });
  });
});

describe("AcpSessionManager loadSession fallback behavior", () => {
  const createBaseConfigPresenter = () =>
    ({
      getAgentMcpSelections: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      getMcpServers: vi.fn<(...args: any[]) => any>().mockResolvedValue({}),
    }) as any;
  const createProcessManager = () =>
    ({
      registerSessionWorkdir: vi.fn<(...args: any[]) => any>(),
      registerSessionListener: vi.fn<(...args: any[]) => any>().mockReturnValue(vi.fn<(...args: any[]) => any>()),
      registerPermissionResolver: vi.fn<(...args: any[]) => any>().mockReturnValue(vi.fn<(...args: any[]) => any>()),
      clearSession: vi.fn<(...args: any[]) => any>(),
    }) as any;
  const createSessionHooks = () => ({
    onSessionUpdate: vi.fn<(...args: any[]) => any>(),
    onPermission: vi.fn<(...args: any[]) => any>(),
  });
  const createWarmupConfigState = () => ({
    source: "configOptions" as const,
    options: [
      {
        id: "model",
        label: "Model",
        type: "select" as const,
        category: "model",
        currentValue: "gpt-5",
        options: [
          { value: "gpt-5", label: "gpt-5" },
          { value: "gpt-5-mini", label: "gpt-5-mini" },
        ],
      },
    ],
  });

  it("prefers loadSession when agent supports it and persisted session exists", async () => {
    const manager = new AcpSessionManager({
      providerId: "acp",
      processManager: createProcessManager(),
      sessionPersistence: {
        getSessionData: vi.fn<(...args: any[]) => any>().mockResolvedValue({ sessionId: "persisted-1" }),
      } as any,
      configPresenter: createBaseConfigPresenter(),
    });

    const warmupConfigState = createWarmupConfigState();
    const request = acpAgentRequest({
      "session/load": async () => ({}),
      "session/new": async () => ({ sessionId: "new-1" }),
    });
    const handle = {
      supportsLoadSession: true,
      configState: warmupConfigState,
      connection: { agent: { request } },
      availableModes: [],
      currentModeId: null,
      mcpCapabilities: {},
    } as any;

    const result = await (manager as any).initializeSession(
      handle,
      "conv-load",
      { id: "agent1", name: "Agent 1" },
      "/tmp",
      createSessionHooks(),
    );

    expect(request).toHaveBeenCalledWith("session/load", {
      cwd: "/tmp",
      mcpServers: [],
      sessionId: "persisted-1",
    });
    expect(callsFor(request, "session/new")).toHaveLength(0);
    expect(result.sessionId).toBe("persisted-1");
    expect(result.configState).toEqual(warmupConfigState);
  });

  it("falls back to newSession when loadSession fails", async () => {
    const manager = new AcpSessionManager({
      providerId: "acp",
      processManager: createProcessManager(),
      sessionPersistence: {
        getSessionData: vi.fn<(...args: any[]) => any>().mockResolvedValue({ sessionId: "persisted-2" }),
      } as any,
      configPresenter: createBaseConfigPresenter(),
    });

    const request = acpAgentRequest({
      "session/load": async () => {
        throw new Error("session not found");
      },
      "session/new": async () => ({ sessionId: "new-2" }),
    });
    const handle = {
      supportsLoadSession: true,
      connection: { agent: { request } },
      availableModes: [],
      currentModeId: null,
      mcpCapabilities: {},
    } as any;

    const result = await (manager as any).initializeSession(
      handle,
      "conv-fallback",
      { id: "agent1", name: "Agent 1" },
      "/tmp",
      createSessionHooks(),
    );

    expect(callsFor(request, "session/load")).toHaveLength(1);
    expect(callsFor(request, "session/new")).toHaveLength(1);
    expect(result.sessionId).toBe("new-2");
  });

  it("uses newSession when loadSession is not supported", async () => {
    const manager = new AcpSessionManager({
      providerId: "acp",
      processManager: {} as any,
      sessionPersistence: {
        getSessionData: vi.fn<(...args: any[]) => any>().mockResolvedValue({ sessionId: "persisted-3" }),
      } as any,
      configPresenter: createBaseConfigPresenter(),
    });

    const request = acpAgentRequest({
      "session/load": async () => ({}),
      "session/new": async () => ({ sessionId: "new-3" }),
    });
    const handle = {
      supportsLoadSession: false,
      connection: { agent: { request } },
      availableModes: [],
      currentModeId: null,
      mcpCapabilities: {},
    } as any;

    const result = await (manager as any).initializeSession(
      handle,
      "conv-new",
      { id: "agent1", name: "Agent 1" },
      "/tmp",
    );

    expect(callsFor(request, "session/load")).toHaveLength(0);
    expect(callsFor(request, "session/new")).toHaveLength(1);
    expect(result.sessionId).toBe("new-3");
  });

  it("keeps warmup config when newSession returns no config payload", async () => {
    const manager = new AcpSessionManager({
      providerId: "acp",
      processManager: {} as any,
      sessionPersistence: {
        getSessionData: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
      } as any,
      configPresenter: createBaseConfigPresenter(),
    });

    const warmupConfigState = createWarmupConfigState();
    const request = acpAgentRequest({
      "session/load": async () => ({}),
      "session/new": async () => ({ sessionId: "new-4" }),
    });
    const handle = {
      supportsLoadSession: false,
      configState: warmupConfigState,
      connection: { agent: { request } },
      availableModes: [],
      currentModeId: null,
      mcpCapabilities: {},
    } as any;

    const result = await (manager as any).initializeSession(
      handle,
      "conv-warmup-config",
      { id: "agent1", name: "Agent 1" },
      "/tmp",
    );

    expect(callsFor(request, "session/new")).toHaveLength(1);
    expect(result.sessionId).toBe("new-4");
    expect(result.configState).toEqual(warmupConfigState);
  });
});
