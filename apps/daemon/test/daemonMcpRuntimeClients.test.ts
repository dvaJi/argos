import { beforeEach, describe, expect, it, mock, vi } from "bun:test";

const runtimeMocks = {
  getRunningClients: vi.fn<() => Promise<any[]>>(),
};

mock.module("@argos/mcp-runtime", () => ({
  ServerManager: class {},
  ToolManager: class {
    getRunningClients = runtimeMocks.getRunningClients;
  },
}));

const { DaemonMcpRuntime } = await import("../src/host/daemonMcpRuntime");

const createRuntimeClient = (serverName: string) => {
  const client: Record<string, any> = {
    serverName,
    serverConfig: {
      icons: "server-icon",
      description: "Test server",
    },
    isServerRunning: vi.fn(() => true),
    listTools: vi.fn(async () => [
      {
        name: "echo",
        description: "Echo input",
        inputSchema: {
          properties: {
            value: { type: "string" },
          },
          required: ["value"],
        },
      },
    ]),
    listPrompts: vi.fn(async () => [
      {
        name: "summarize",
        description: "Summarize text",
        arguments: [],
      },
    ]),
    listResources: vi.fn(async () => [{ uri: "file:///notes.md", name: "Notes" }]),
  };
  client.runtimeCycle = client;
  return client;
};

describe("DaemonMcpRuntime client summaries", () => {
  beforeEach(() => {
    runtimeMocks.getRunningClients.mockReset();
  });

  it("projects live runtime clients to JSON-serializable route DTOs", async () => {
    runtimeMocks.getRunningClients.mockResolvedValue([createRuntimeClient("manual-server")]);
    const configPresenter = {
      getMcpEnabled: vi.fn(async () => true),
      getMcpServers: vi.fn(async () => ({ "manual-server": { enabled: true } })),
    };
    const runtime = new DaemonMcpRuntime(configPresenter as never, {} as never);

    const clients = await runtime.getClients();

    expect(() => JSON.stringify(clients)).not.toThrow();
    expect(clients).toEqual([
      {
        name: "manual-server",
        icon: "server-icon",
        isRunning: true,
        tools: [
          {
            type: "function",
            function: {
              name: "echo",
              description: "Echo input",
              parameters: {
                type: "object",
                properties: {
                  value: { type: "string", description: "Params of value" },
                },
                required: ["value"],
              },
            },
            server: {
              name: "manual-server",
              icons: "server-icon",
              description: "Test server",
            },
          },
        ],
        prompts: [
          {
            id: "summarize",
            name: "summarize",
            content: "Summarize text",
            description: "Summarize text",
            arguments: [],
            client: { name: "manual-server", icon: "server-icon" },
          },
        ],
        resources: [{ uri: "file:///notes.md", name: "Notes" }],
      },
    ]);
  });

  it("keeps only plugin-owned clients while global MCP is disabled", async () => {
    runtimeMocks.getRunningClients.mockResolvedValue([
      createRuntimeClient("manual-server"),
      createRuntimeClient("plugin-server"),
    ]);
    const configPresenter = {
      getMcpEnabled: vi.fn(async () => false),
      getMcpServers: vi.fn(async () => ({
        "manual-server": { enabled: true },
        "plugin-server": { enabled: true, source: "plugin", sourceId: "plugin-1" },
      })),
    };
    const runtime = new DaemonMcpRuntime(configPresenter as never, {} as never);

    await expect(runtime.getClients()).resolves.toMatchObject([{ name: "plugin-server" }]);
  });
});
