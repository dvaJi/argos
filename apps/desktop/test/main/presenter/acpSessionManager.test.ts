import { describe, it, expect, vi } from "vitest";
import { AcpSessionManager } from "../../../src/main/presenter/llmProviderPresenter/acp";

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
    manager.processManager = {
      registerSessionWorkdir: vi.fn<(...args: any[]) => any>(),
      registerSessionListener: vi.fn<(...args: any[]) => any>().mockReturnValue(throwingDetach),
      registerPermissionResolver: vi.fn<(...args: any[]) => any>().mockReturnValue(normalDetach),
      clearSession: vi.fn<(...args: any[]) => any>(),
    };
    manager.sessionPersistence = {
      getSessionData: vi.fn<(...args: any[]) => any>().mockResolvedValue({ sessionId: "persisted-session" }),
    };
    manager.resolveMcpServersForAgent = vi.fn<(...args: any[]) => any>().mockResolvedValue([]);

    const handle = {
      supportsLoadSession: true,
      connection: {
        loadSession: vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("load failed")),
        newSession: vi.fn<(...args: any[]) => any>().mockResolvedValue({ sessionId: "new-session" }),
      },
    };

    const session = await manager.initializeSession(handle, "conv1", agent as any, "/tmp", {
      onSessionUpdate: vi.fn<(...args: any[]) => any>(),
      onPermission: vi.fn<(...args: any[]) => any>(),
    });

    expect(throwingDetach).toHaveBeenCalledTimes(1);
    expect(normalDetach).toHaveBeenCalledTimes(1);
    expect(manager.processManager.clearSession).toHaveBeenCalledWith("persisted-session");
    expect(handle.connection.newSession).toHaveBeenCalledWith({
      cwd: "/tmp",
      mcpServers: [],
    });
    expect(session.sessionId).toBe("new-session");
  });
});
