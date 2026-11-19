import { describe, it, expect, vi } from "vitest";
import { AcpSessionManager } from "@argos/acp-runtime/session/acpSessionManager";

vi.mock("electron", () => ({
  app: {
    on: vi.fn<(...args: any[]) => any>(),
  },
}));

describe("AcpSessionManager createSession error handling", () => {
  const agent = { id: "agent1", name: "Agent 1" };

  it("throws explicit shutdown error when process manager is shutting down", async () => {
    const manager = Object.create(AcpSessionManager.prototype) as any;
    manager.processManager = {
      getConnection: vi
        .fn<(...args: any[]) => any>()
        .mockRejectedValue(new Error("[ACP] Process manager is shutting down, refusing to spawn new process")),
    };

    await expect(manager.createSession("conv1", agent as any, {} as any, "/tmp")).rejects.toThrow(
      "[ACP] Cannot create session: process manager is shutting down",
    );
  });

  it("rethrows non-shutdown getConnection errors", async () => {
    const manager = Object.create(AcpSessionManager.prototype) as any;
    manager.processManager = {
      getConnection: vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("boom")),
    };

    await expect(manager.createSession("conv1", agent as any, {} as any, "/tmp")).rejects.toThrow("boom");
  });

  it("preserves the original session initialization error when unbind fails", async () => {
    const manager = Object.create(AcpSessionManager.prototype) as any;
    const initError = new Error("init failed");
    manager.processManager = {
      getConnection: vi.fn<(...args: any[]) => any>().mockResolvedValue({}),
      bindProcess: vi.fn<(...args: any[]) => any>(),
      unbindProcess: vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("cleanup failed")),
    };
    manager.initializeSession = vi.fn<(...args: any[]) => any>().mockRejectedValue(initError);

    await expect(manager.createSession("conv1", agent as any, {} as any, "/tmp")).rejects.toThrow("init failed");
    expect(manager.processManager.unbindProcess).toHaveBeenCalledWith("agent1", "conv1");
  });

  it("continues newSession fallback when persisted-session detach throws", async () => {
    const manager = Object.create(AcpSessionManager.prototype) as any;
    const throwingDetach = vi.fn<(...args: any[]) => any>(() => {
      throw new Error("detach failed");
    });
    const normalDetach = vi.fn<(...args: any[]) => any>();
    const elicitationDetach = vi.fn<(...args: any[]) => any>();
    manager.processManager = {
      registerSessionWorkdir: vi.fn<(...args: any[]) => any>(),
      registerSessionListener: vi.fn<(...args: any[]) => any>().mockReturnValue(throwingDetach),
      registerPermissionResolver: vi.fn<(...args: any[]) => any>().mockReturnValue(normalDetach),
      registerElicitationResolver: vi.fn<(...args: any[]) => any>().mockReturnValue(elicitationDetach),
      clearSession: vi.fn<(...args: any[]) => any>(),
    };
    manager.sessionPersistence = {
      getSessionData: vi.fn<(...args: any[]) => any>().mockResolvedValue({ sessionId: "persisted-session" }),
    };
    manager.resolveMcpServersForAgent = vi.fn<(...args: any[]) => any>().mockResolvedValue([]);

    const request = vi.fn(async (method: string, _params: any) => {
      if (method === "session/load") throw new Error("load failed");
      if (method === "session/new") return { sessionId: "new-session" };
      return {};
    });
    const handle = {
      supportsLoadSession: true,
      connection: { agent: { request } },
    };

    const session = await manager.initializeSession(handle, "conv1", agent as any, "/tmp", {
      onSessionUpdate: vi.fn<(...args: any[]) => any>(),
      onPermission: vi.fn<(...args: any[]) => any>(),
      onElicitation: vi.fn<(...args: any[]) => any>(),
    });

    expect(throwingDetach).toHaveBeenCalledTimes(1);
    expect(normalDetach).toHaveBeenCalledTimes(1);
    expect(elicitationDetach).toHaveBeenCalledTimes(1);
    expect(manager.processManager.clearSession).toHaveBeenCalledWith("persisted-session");
    expect(request).toHaveBeenCalledWith("session/new", {
      cwd: "/tmp",
      mcpServers: [],
    });
    expect(session.sessionId).toBe("new-session");
  });
});

describe("AcpSessionManager configOptions persistence", () => {
  function createManager(requestImpl: (method: string, params: any) => Promise<any>, persisted: any = null) {
    const manager = Object.create(AcpSessionManager.prototype) as any;
    manager.processManager = {
      registerSessionWorkdir: vi.fn<(...args: any[]) => any>(),
      registerSessionListener: vi.fn<(...args: any[]) => any>().mockReturnValue(vi.fn()),
      registerPermissionResolver: vi.fn<(...args: any[]) => any>().mockReturnValue(vi.fn()),
      registerElicitationResolver: vi.fn<(...args: any[]) => any>().mockReturnValue(vi.fn()),
      clearSession: vi.fn<(...args: any[]) => any>(),
      appendDebugEvent: vi.fn(),
    };
    manager.sessionPersistence = {
      getSessionData: vi.fn<(...args: any[]) => any>().mockResolvedValue(persisted),
      mergeMetadata: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    manager.resolveMcpServersForAgent = vi.fn<(...args: any[]) => any>().mockResolvedValue([]);
    const request = vi.fn(requestImpl);
    const handle = {
      supportsLoadSession: true,
      connection: { agent: { request } },
    };
    return { manager, request, handle };
  }

  const hooks = {
    onSessionUpdate: vi.fn(),
    onPermission: vi.fn(),
    onElicitation: vi.fn(),
  };

  it("sends remembered configOptions on session/new", async () => {
    const remembered = [{ id: "model", type: "select", category: "model", currentValue: "opus", options: [] }];
    const persisted = { sessionId: "gone", metadata: { configOptions: remembered } };
    const { manager, request, handle } = createManager(async (method: string) => {
      if (method === "session/load") throw new Error("load failed");
      if (method === "session/new") return { sessionId: "new-1", configOptions: remembered };
      return {};
    }, persisted);

    const session = await manager.initializeSession(handle, "conv1", { id: "agent1" } as any, "/tmp", hooks);

    expect(request).toHaveBeenCalledWith("session/new", expect.objectContaining({ configOptions: remembered }));
    expect(session.configState.options?.[0]?.currentValue).toBe("opus");
  });

  it("retries session/new without configOptions when the agent rejects them", async () => {
    const remembered = [{ id: "model", type: "select", category: "model", currentValue: "gone", options: [] }];
    const persisted = { sessionId: "gone", metadata: { configOptions: remembered } };
    const { manager, request, handle } = createManager(async (method: string) => {
      if (method === "session/load") throw new Error("load failed");
      return { sessionId: "new-1" };
    }, persisted);
    // Every session/new with options fails strict validation.
    request.mockImplementation(async (method: string, params: any) => {
      if (method === "session/load") throw new Error("load failed");
      if (method === "session/new") {
        if (params.configOptions) {
          const rejection = new Error("Invalid params") as Error & { code?: number };
          rejection.code = -32602;
          throw rejection;
        }
        return { sessionId: "new-1" };
      }
      return {};
    });

    const session = await manager.initializeSession(handle, "conv1", { id: "agent1" } as any, "/tmp", hooks);

    expect(session.sessionId).toBe("new-1");
    const newCalls = request.mock.calls.filter(([method]) => method === "session/new");
    expect(newCalls).toHaveLength(2);
    expect((newCalls[0]![1] as Record<string, unknown>).configOptions).toBeDefined();
    expect((newCalls[1]![1] as Record<string, unknown>).configOptions).toBeUndefined();
  });

  it("persists fresh configOptions from a successful new-session response", async () => {
    const { manager, handle } = createManager(async (method: string) => {
      if (method === "session/load") throw new Error("load failed");
      return {
        sessionId: "new-1",
        configOptions: [{ id: "model", type: "select", category: "model", currentValue: "sonnet", options: [] }],
      };
    });

    await manager.initializeSession(handle, "conv1", { id: "agent1" } as any, "/tmp", hooks);
  });
});
