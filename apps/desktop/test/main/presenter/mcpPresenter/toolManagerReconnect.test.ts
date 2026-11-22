import { describe, expect, it, vi } from "vitest";
import { ToolManager } from "@argos/mcp-runtime/runtime/toolManager";
import { createMcpTestPorts } from "./mcpTestPorts";

/**
 * A server whose transport dropped stays registered in ServerManager, so no
 * client-list event fires. The tool map must not lose its tools for good.
 */
function setup() {
  const listeners = new Map<string, Array<() => void>>();
  const ports = createMcpTestPorts();
  ports.events.subscribe = ((channel: string, listener: () => void) => {
    listeners.set(channel, [...(listeners.get(channel) ?? []), listener]);
    return () => {};
  }) as never;
  const emit = (channel: string) => listeners.get(channel)?.forEach((listener) => listener());

  let connected = true;
  const client = {
    serverName: "testbed",
    serverConfig: {},
    isServerRunning: () => connected,
    connect: vi.fn(async () => {
      connected = true;
    }),
    listTools: vi.fn(async () => [{ name: "echo", description: "Echo", inputSchema: { type: "object" } }]),
    callTool: vi.fn(async () => ({ content: [{ type: "text", text: "echo: hi" }] })),
  };
  const serverManager = {
    getRunningClients: async () => (connected ? [client] : []),
    reconnectDroppedClients: vi.fn(async () => {
      if (connected) return false;
      await client.connect();
      return true;
    }),
    clearServerLastError: () => {},
    setServerLastError: () => {},
  };
  const configPresenter = {
    getMcpServers: async () => ({ testbed: { type: "http", enabled: true, autoApprove: ["all"] } }),
    getAcpAgents: async () => [],
  };
  const manager = new ToolManager(configPresenter as never, serverManager as never, ports);
  return {
    manager,
    client,
    serverManager,
    emit,
    drop: () => {
      connected = false;
    },
  };
}

const echoCall = { id: "tc-1", type: "function", function: { name: "echo", arguments: '{"text":"hi"}' } } as never;

describe("ToolManager after a server drops", () => {
  it("reconnects a dropped server when its tool is missing from a rebuilt map", async () => {
    const { manager, client, serverManager, emit, drop } = setup();
    expect((await manager.getAllToolDefinitions()).map((tool) => tool.function.name)).toEqual(["echo"]);

    // Session error drops the transport; another server's update rebuilds the map without it.
    drop();
    emit("mcp:client-list-updated");
    expect(await manager.getAllToolDefinitions()).toEqual([]);

    const result = await manager.callTool(echoCall);
    expect(serverManager.reconnectDroppedClients).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeFalsy();
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });

  it("refreshes the map when a server's status changes", async () => {
    const { manager, emit, drop, client } = setup();
    drop();
    expect(await manager.getAllToolDefinitions()).toEqual([]);

    await client.connect(); // e.g. a lazy reconnect elsewhere broadcasts "running"
    emit("mcp:server-status-changed");
    expect((await manager.getAllToolDefinitions()).map((tool) => tool.function.name)).toEqual(["echo"]);
  });
});
