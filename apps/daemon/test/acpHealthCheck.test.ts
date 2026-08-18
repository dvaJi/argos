import { describe, expect, it, vi } from "bun:test";
import { runAcpDebugAction } from "@argos/acp-runtime";

function createDeps(options: { closeSupported?: boolean; sessionError?: Error } = {}) {
  const clearSession = vi.fn();
  const debugEvents: Array<Record<string, unknown>> = [];
  let resolveSession: ((value: { sessionId: string }) => void) | undefined;
  const sessionResponse = new Promise<{ sessionId: string }>((resolve) => {
    resolveSession = resolve;
  });
  const request = vi.fn(async (method: string) => {
    if (method === "session/new") {
      if (options.sessionError) throw options.sessionError;
      return await sessionResponse;
    }
    if (method === "session/close") return { ok: true };
    return {};
  });
  const processManager = {
    getDebugEvents: vi.fn(() => debugEvents),
    appendDebugEvent: vi.fn((agentId: string, entry: Record<string, unknown>) => {
      const record = { ...entry, id: `event-${debugEvents.length + 1}`, agentId, timestamp: Date.now() };
      debugEvents.push(record);
      return record;
    }),
    registerSessionWorkdir: vi.fn(),
    registerSessionListener: vi.fn(() => () => {}),
    registerPermissionResolver: vi.fn(() => () => {}),
    clearSession,
    getConnection: vi.fn().mockResolvedValue({
      agentId: "agent1",
      workdir: "/tmp/project",
      status: "ready",
      supportsSessionClose: options.closeSupported ?? true,
      connection: { agent: { request, notify: vi.fn() } },
    }),
  };
  const deps = {
    request: { agentId: "agent1", action: "healthCheck" as const, workdir: "/tmp/project" },
    provider: { id: "acp" },
    getAcpAgents: vi.fn().mockResolvedValue([{ id: "agent1", name: "Agent 1" }]),
    processManager,
    sessionManager: { resolveMcpServersForAgent: vi.fn().mockResolvedValue([]) },
    toConnectionRef: (handle: unknown) => handle,
  };

  return { deps, processManager, request, clearSession, resolveSession, debugEvents };
}

describe("ACP operational health check", () => {
  it("creates and closes a probe session without sending a prompt", async () => {
    const fixture = createDeps();
    const pending = runAcpDebugAction(fixture.deps as never);
    fixture.resolveSession?.({ sessionId: "probe-1" });

    const result = await pending;

    expect(result.status).toBe("ok");
    expect(result.sessionId).toBeUndefined();
    expect(fixture.request).toHaveBeenCalledWith("session/new", {
      cwd: "/tmp/project",
      mcpServers: [],
    });
    expect(fixture.request).toHaveBeenCalledWith("session/close", { sessionId: "probe-1" });
    expect(fixture.request).not.toHaveBeenCalledWith("session/prompt", expect.anything());
    expect(fixture.clearSession).toHaveBeenCalledWith("probe-1");
  });

  it("reports wrapper startup failure instead of readiness", async () => {
    const fixture = createDeps({ sessionError: new Error("pi executable was not found") });

    const result = await runAcpDebugAction(fixture.deps as never);

    expect(result.status).toBe("error");
    expect(result.error).toContain("pi executable was not found");
    expect(fixture.clearSession).not.toHaveBeenCalled();
  });

  it("shares one in-flight probe for concurrent checks of the same target", async () => {
    const fixture = createDeps({ closeSupported: false });

    const first = runAcpDebugAction(fixture.deps as never);
    const second = runAcpDebugAction(fixture.deps as never);
    fixture.resolveSession?.({ sessionId: "probe-2" });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(secondResult);
    expect(fixture.processManager.getConnection).toHaveBeenCalledTimes(1);
    expect(fixture.request).toHaveBeenCalledTimes(1);
    expect(fixture.clearSession).toHaveBeenCalledWith("probe-2");
  });
});
