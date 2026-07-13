import { describe, it, expect, vi } from "vitest";
import { runAcpDebugAction } from "@argos/acp-runtime";

function makeAgentRequest(handler: (method: string, body: unknown) => unknown) {
  return {
    request: vi.fn<(method: string, body?: unknown) => Promise<unknown>>(async (method, body) => handler(method, body)),
    notify: vi.fn<(method: string, body?: unknown) => Promise<void>>(async () => undefined),
  };
}

function baseDeps(overrides: Record<string, unknown> = {}) {
  const registerSessionWorkdir = vi.fn<(...args: any[]) => any>();
  const clearSession = vi.fn<(...args: any[]) => any>();
  const handle = {
    agentId: "agent1",
    workdir: "/tmp/debug-workdir",
    status: "ready",
    supportsLoadSession: true,
    supportsSessionClose: true,
    authMethods: [{ id: "env1", type: "env_var" }],
    connection: {
      agent: makeAgentRequest((method: string, body: any) => {
        if (method === "session/load") return { sessionId: body?.sessionId, loaded: true };
        if (method === "session/close") return { ok: true };
        return {};
      }),
    },
  };
  return {
    request: { agentId: "agent1", action: "noop" as const },
    provider: { id: "acp" },
    getAcpAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([{ id: "agent1", name: "Agent 1" }]),
    processManager: {
      getDebugEvents: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      registerSessionWorkdir,
      clearSession,
      registerSessionListener: vi.fn<(...args: any[]) => any>().mockReturnValue(() => {}),
      registerPermissionResolver: vi.fn<(...args: any[]) => any>().mockReturnValue(() => {}),
      getConnection: vi.fn<(...args: any[]) => any>().mockResolvedValue(handle),
    },
    sessionManager: { resolveMcpServersForAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue([]) },
    sessionPersistence: {
      saveSessionData: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      getSessionData: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    },
    sqlitePresenter: { createConversation: vi.fn<(...args: any[]) => any>().mockResolvedValue("conv-auto") },
    toConnectionRef: (h: unknown) => h,
    ...overrides,
  };
}

describe("runAcpDebugAction session import/detach/closeRemote", () => {
  it("sessionImport loads the remote session, registers workdir, and persists the link", async () => {
    const deps = baseDeps();
    const result = await runAcpDebugAction({
      ...deps,
      request: {
        agentId: "agent1",
        action: "sessionImport",
        payload: { sessionId: "remote-1", conversationId: "conv-1" },
      },
    } as any);

    expect(result.status).toBe("ok");
    expect(result.sessionId).toBe("remote-1");
    expect(deps.processManager.registerSessionWorkdir).toHaveBeenCalledWith("remote-1", "/tmp/debug-workdir", "conv-1");
    expect(deps.sessionPersistence.saveSessionData).toHaveBeenCalledWith(
      "conv-1",
      "agent1",
      "remote-1",
      "/tmp/debug-workdir",
      "idle",
      expect.objectContaining({ source: "session/import" }),
    );
    const loadCall = deps.processManager.getConnection.mock.results[0]?.value;
    expect(loadCall).toBeDefined();
  });

  it("sessionImport auto-creates a conversation when conversationId is omitted", async () => {
    const deps = baseDeps();
    const result = await runAcpDebugAction({
      ...deps,
      request: { agentId: "agent1", action: "sessionImport", payload: { sessionId: "remote-2" } },
    } as any);

    expect(result.status).toBe("ok");
    expect(deps.sqlitePresenter.createConversation).toHaveBeenCalledTimes(1);
    expect(deps.sessionPersistence.saveSessionData).toHaveBeenCalledWith(
      "conv-auto",
      "agent1",
      "remote-2",
      "/tmp/debug-workdir",
      "idle",
      expect.objectContaining({ source: "session/import" }),
    );
  });

  it("sessionDetach clears the local link without issuing a remote close", async () => {
    const deps = baseDeps();
    const result = await runAcpDebugAction({
      ...deps,
      request: { agentId: "agent1", action: "sessionDetach", payload: { sessionId: "remote-1" } },
    } as any);

    expect(result.status).toBe("ok");
    expect(deps.processManager.clearSession).toHaveBeenCalledWith("remote-1");
    const handle = await deps.processManager.getConnection();
    expect(handle.connection.agent.request).not.toHaveBeenCalled();
  });

  it("sessionCloseRemote issues a remote session/close and clears the local link", async () => {
    const deps = baseDeps();
    const result = await runAcpDebugAction({
      ...deps,
      request: { agentId: "agent1", action: "sessionCloseRemote", payload: { sessionId: "remote-1" } },
    } as any);

    expect(result.status).toBe("ok");
    const handle = await deps.processManager.getConnection();
    expect(handle.connection.agent.request).toHaveBeenCalledWith("session/close", { sessionId: "remote-1" });
    expect(deps.processManager.clearSession).toHaveBeenCalledWith("remote-1");
  });

  it("sessionImport fails when the agent lacks loadSession capability", async () => {
    const deps = baseDeps();
    deps.processManager.getConnection.mockResolvedValueOnce({
      agentId: "agent1",
      workdir: "/tmp/debug-workdir",
      status: "ready",
      supportsLoadSession: false,
      connection: { agent: makeAgentRequest(() => ({})) },
    });
    const result = await runAcpDebugAction({
      ...deps,
      request: {
        agentId: "agent1",
        action: "sessionImport",
        payload: { sessionId: "remote-1", conversationId: "conv-1" },
      },
    } as any);
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/loadSession/i);
  });

  it("sessionImport persists replay metadata with fingerprints for dedup", async () => {
    const deps = baseDeps();
    const result = await runAcpDebugAction({
      ...deps,
      request: {
        agentId: "agent1",
        action: "sessionImport",
        payload: { sessionId: "remote-1", conversationId: "conv-1" },
      },
    } as any);

    expect(result.status).toBe("ok");
    const saveCall = deps.sessionPersistence.saveSessionData.mock.calls.find((c: any[]) => c[0] === "conv-1");
    expect(saveCall).toBeDefined();
    const metadata = saveCall![5];
    expect(metadata.replay).toBeDefined();
    expect(metadata.replay.notificationCount).toBe(0);
    expect(Array.isArray(metadata.replay.fingerprints)).toBe(true);
  });
});
