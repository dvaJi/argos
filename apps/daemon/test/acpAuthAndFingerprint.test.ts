import { describe, it, expect, vi } from "bun:test";
import { isAuthRequiredError, clientSupportsTerminalAuth } from "@argos/acp-runtime/protocol/acpCapabilities";
import { fingerprintMessage, fingerprintMessages } from "@argos/acp-runtime/session/acpMessageFingerprint";
import { runAcpDebugAction } from "@argos/acp-runtime";

describe("isAuthRequiredError", () => {
  it("detects the ACP authentication-required error code", () => {
    expect(isAuthRequiredError({ code: -32042, message: "auth required" })).toBe(true);
  });

  it("detects a custom auth error code", () => {
    expect(isAuthRequiredError({ code: -32800, message: "unauthorized" })).toBe(true);
  });

  it("detects auth from an error message", () => {
    expect(isAuthRequiredError(new Error("session requires authentication"))).toBe(true);
    expect(isAuthRequiredError("Login required to continue")).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isAuthRequiredError({ code: -32602, message: "internal error" })).toBe(false);
    expect(isAuthRequiredError(new Error("something failed"))).toBe(false);
    expect(isAuthRequiredError(null)).toBe(false);
  });
});

describe("clientSupportsTerminalAuth", () => {
  it("is true when a terminal auth method is advertised", () => {
    expect(clientSupportsTerminalAuth([{ type: "terminal" }])).toBe(true);
  });

  it("is false when only env_var or agent methods are advertised", () => {
    expect(clientSupportsTerminalAuth([{ type: "env_var" }])).toBe(false);
    expect(clientSupportsTerminalAuth([])).toBe(false);
    expect(clientSupportsTerminalAuth(undefined)).toBe(false);
  });
});

describe("fingerprintMessage", () => {
  it("is stable for identical messages", () => {
    const a = fingerprintMessage({ role: "user", content: "hello" });
    const b = fingerprintMessage({ role: "user", content: "hello" });
    expect(a).toBe(b);
  });

  it("differs by role", () => {
    const user = fingerprintMessage({ role: "user", content: "hello" });
    const assistant = fingerprintMessage({ role: "assistant", content: "hello" });
    expect(user).not.toBe(assistant);
  });

  it("differs by structured block content but not volatile ordering of keys", () => {
    const withImage = fingerprintMessage({
      role: "user",
      blocks: [{ type: "image", data: "abc", mimeType: "image/png" }],
    });
    const sameImage = fingerprintMessage({
      role: "user",
      blocks: [{ mimeType: "image/png", type: "image", data: "abc" }],
    });
    expect(withImage).toBe(sameImage);

    const otherImage = fingerprintMessage({
      role: "user",
      blocks: [{ type: "image", data: "different", mimeType: "image/png" }],
    });
    expect(withImage).not.toBe(otherImage);
  });

  it("fingerprintMessages produces one entry per message", () => {
    const result = fingerprintMessages([
      { role: "user", content: "a" },
      { role: "user", content: "b" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).not.toBe(result[1]);
  });
});

describe("runAcpDebugAction authenticate/logout", () => {
  function makeAgentRequest(handler: (method: string, body: unknown) => unknown) {
    return {
      request: vi.fn<(method: string, body?: unknown) => Promise<unknown>>(async (method, body) =>
        handler(method, body),
      ),
      notify: vi.fn<(method: string, body?: unknown) => Promise<void>>(async () => undefined),
    };
  }

  function baseDeps(overrides: Record<string, unknown> = {}) {
    return {
      request: { agentId: "agent1", action: "initialize" as const },
      provider: { id: "acp" },
      getAcpAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([{ id: "agent1", name: "Agent 1" }]),
      processManager: {
        getDebugEvents: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
        registerSessionWorkdir: vi.fn<(...args: any[]) => any>(),
        registerSessionListener: vi.fn<(...args: any[]) => any>().mockReturnValue(() => {}),
        registerPermissionResolver: vi.fn<(...args: any[]) => any>().mockReturnValue(() => {}),
        clearSession: vi.fn<(...args: any[]) => any>(),
        getConnection: vi.fn<(...args: any[]) => any>(),
      },
      sessionManager: { resolveMcpServersForAgent: vi.fn<(...args: any[]) => any>().mockResolvedValue([]) },
      toConnectionRef: (h: unknown) => h,
      ...overrides,
    };
  }

  it("authenticate succeeds when methodId is provided", async () => {
    const authResponse = { status: "ok" };
    const deps = baseDeps({
      processManager: {
        getDebugEvents: vi.fn().mockReturnValue([]),
        registerSessionWorkdir: vi.fn(),
        registerSessionListener: vi.fn().mockReturnValue(() => {}),
        registerPermissionResolver: vi.fn().mockReturnValue(() => {}),
        clearSession: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({
          agentId: "agent1",
          workdir: "/tmp/w",
          status: "ready",
          authMethods: [{ id: "env1", type: "env_var" }],
          connection: { agent: makeAgentRequest((method) => (method === "agent/authenticate" ? authResponse : {})) },
        }),
      },
    });
    const result = await runAcpDebugAction({
      ...deps,
      request: { agentId: "agent1", action: "authenticate", payload: { methodId: "env1" } },
    } as any);
    expect(result.status).toBe("ok");
  });

  it("authenticate fails when methodId is missing", async () => {
    const deps = baseDeps({
      processManager: {
        getDebugEvents: vi.fn().mockReturnValue([]),
        registerSessionWorkdir: vi.fn(),
        registerSessionListener: vi.fn().mockReturnValue(() => {}),
        registerPermissionResolver: vi.fn().mockReturnValue(() => {}),
        clearSession: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({
          agentId: "agent1",
          workdir: "/tmp/w",
          status: "ready",
          authMethods: [],
          connection: { agent: makeAgentRequest(() => ({})) },
        }),
      },
    });
    const result = await runAcpDebugAction({
      ...deps,
      request: { agentId: "agent1", action: "authenticate", payload: {} },
    } as any);
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/methodId/i);
  });

  it("logout fails when agent lacks auth.logout capability", async () => {
    const deps = baseDeps({
      processManager: {
        getDebugEvents: vi.fn().mockReturnValue([]),
        registerSessionWorkdir: vi.fn(),
        registerSessionListener: vi.fn().mockReturnValue(() => {}),
        registerPermissionResolver: vi.fn().mockReturnValue(() => {}),
        clearSession: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({
          agentId: "agent1",
          workdir: "/tmp/w",
          status: "ready",
          supportsAuthLogout: false,
          authMethods: [],
          connection: { agent: makeAgentRequest(() => ({})) },
        }),
      },
    });
    const result = await runAcpDebugAction({
      ...deps,
      request: { agentId: "agent1", action: "logout" },
    } as any);
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/auth\.logout/i);
  });

  it("logout succeeds when auth.logout is supported", async () => {
    const logoutResponse = { status: "ok" };
    const deps = baseDeps({
      processManager: {
        getDebugEvents: vi.fn().mockReturnValue([]),
        registerSessionWorkdir: vi.fn(),
        registerSessionListener: vi.fn().mockReturnValue(() => {}),
        registerPermissionResolver: vi.fn().mockReturnValue(() => {}),
        clearSession: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({
          agentId: "agent1",
          workdir: "/tmp/w",
          status: "ready",
          supportsAuthLogout: true,
          authMethods: [{ id: "env1", type: "env_var" }],
          connection: { agent: makeAgentRequest((method) => (method === "agent/logout" ? logoutResponse : {})) },
        }),
      },
    });
    const result = await runAcpDebugAction({
      ...deps,
      request: { agentId: "agent1", action: "logout" },
    } as any);
    expect(result.status).toBe("ok");
  });
});
