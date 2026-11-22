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
  let serverUp = true;
  const client = {
    serverName: "testbed",
    serverConfig: {},
    isServerRunning: () => connected,
    connect: vi.fn(async () => {
      if (!serverUp) throw new Error("ECONNREFUSED");
      connected = true;
    }),
    listTools: vi.fn(async () => [{ name: "echo", description: "Echo", inputSchema: { type: "object" } }]),
    callTool: vi.fn(async () => ({ content: [{ type: "text", text: "echo: hi" }] })),
  };
  const serverManager = {
    getRunningClients: async () => (connected ? [client] : []),
    reconnectDroppedClients: vi.fn(async () => {
      if (connected) return false;
      return client.connect().then(
        () => true,
        () => false,
      );
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
    /** The server process dies: the client is dropped and cannot reconnect. */
    kill: () => {
      connected = false;
      serverUp = false;
    },
    /** The server process is back; the client is still dropped. */
    revive: () => {
      serverUp = true;
    },
  };
}

const echoCall = { id: "tc-1", type: "function", function: { name: "echo", arguments: '{"text":"hi"}' } } as never;

describe("ToolManager after a server drops", () => {
  const names = async (manager: ToolManager) =>
    (await manager.getAllToolDefinitions()).map((tool) => tool.function.name);

  it("a rebuild brings a dropped server back once it is reachable", async () => {
    const { manager, emit, kill, revive } = setup();
    expect(await names(manager)).toEqual(["echo"]);

    kill();
    emit("mcp:client-list-updated");
    expect(await names(manager)).toEqual([]); // still down: tools are gone for now

    revive();
    emit("mcp:client-list-updated");
    expect(await names(manager)).toEqual(["echo"]); // the next rebuild reconnects it
  });

  it("a call to a tool missing from the map reconnects its server and retries", async () => {
    const { manager, client, emit, kill, revive } = setup();
    kill();
    emit("mcp:client-list-updated");
    expect(await names(manager)).toEqual([]);

    revive(); // server is back, but the cached map still lacks echo
    const result = await manager.callTool(echoCall);
    expect(result.isError).toBeFalsy();
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });

  it("refreshes the map when a server's status changes", async () => {
    const { manager, emit, kill, revive, client } = setup();
    kill();
    expect(await names(manager)).toEqual([]);

    revive();
    await client.connect(); // a lazy reconnect elsewhere broadcasts "running"
    emit("mcp:server-status-changed");
    expect(await names(manager)).toEqual(["echo"]);
  });
});
