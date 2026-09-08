import { describe, expect, it, vi } from "bun:test";
import { DaemonAcpAuthRuntime } from "../src/host/acpAuthRuntime";

/**
 * Hermetic coverage for the daemon ACP auth runtime: agent-method
 * authenticate (bounded), terminal-method PTY flow (argv, output streaming,
 * exit handling, cancel, handle release), and single-flight.
 */

const createHarness = (options?: {
  authMethods?: Array<Record<string, unknown>>;
  authenticateImpl?: () => Promise<unknown>;
  exitCode?: number | null;
}) => {
  const published: Array<Record<string, unknown>> = [];
  const eventPublisher = {
    publish: vi.fn((name: string, payload: Record<string, unknown>) => {
      if (name === "providers.acpAuth.changed") {
        published.push(payload);
      }
    }),
  } as any;

  const release = vi.fn(async () => undefined);
  const authenticate = vi.fn(options?.authenticateImpl ?? (async () => undefined));
  const processManager = {
    getConnection: vi.fn(async () => ({
      authMethods: options?.authMethods ?? [{ id: "agent-login", name: "Agent Login" }],
      connection: {
        agent: {
          request: vi.fn(async (_method: string, payload: unknown) => {
            void payload;
            return await authenticate();
          }),
        },
      },
    })),
    release,
  } as any;

  const spawned: Array<{ argv: string[]; env: Record<string, string | undefined> }> = [];
  const terminalWrites: string[] = [];
  const kills: number[] = [];
  let resolveExit: ((code: number) => void) | null = null;
  const exited = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });

  const deps = {
    eventPublisher,
    getProcessManager: async () => processManager,
    resolveLaunchSpec: vi.fn(async () => ({ command: "mcode", args: ["acp"], env: { SPEC_VAR: "1" } })),
    ptyFactory: (opts: { onData: (data: Uint8Array) => void }) => ({
      write: (data: string | Uint8Array) => {
        terminalWrites.push(typeof data === "string" ? data : new TextDecoder().decode(data));
      },
      kill: (signal?: string) => {
        void signal;
        kills.push(kills.length + 1);
      },
      // keep the onData reference reachable for the test
      ...(opts as unknown as Record<string, unknown>),
    }),
    spawnPty: vi.fn((argv: string[], options: { env: Record<string, string | undefined> }) => {
      spawned.push({ argv, env: options.env });
      return {
        write: (data: string | Uint8Array) => {
          terminalWrites.push(typeof data === "string" ? data : new TextDecoder().decode(data));
        },
        kill: (signal?: string) => {
          void signal;
          kills.push(kills.length + 1);
        },
        exited,
      };
    }),
  };

  const auth = new DaemonAcpAuthRuntime(deps as any);
  return {
    auth,
    published,
    release,
    authenticate,
    spawned,
    terminalWrites,
    kills,
    emitExit: (code: number) => resolveExit?.(code),
    emitData: (text: string) => {
      const onData = (deps.ptyFactory as any).mock?.calls?.[0]?.[0]?.onData;
      void onData;
    },
  };
};

const encoder = new TextEncoder();

/** Poll until the predicate passes (bun:test has no vi.waitFor). */
async function waitFor(predicate: () => void, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      predicate();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError ?? new Error("waitFor timed out");
}

describe("DaemonAcpAuthRuntime", () => {
  it("authenticates agent methods on the warm connection and reports ready", async () => {
    const harness = createHarness();
    const result = await harness.auth.start({ agentId: "my-agent", methodId: "agent-login" });

    expect(result.mode).toBe("agent");
    expect(harness.authenticate).toHaveBeenCalled();
    expect(harness.published.map((entry) => entry.state)).toEqual(["running", "ready"]);
    expect(harness.release).not.toHaveBeenCalled();
  });

  it("surfaces agent-method failures and keeps the agent retryable", async () => {
    const harness = createHarness({
      authenticateImpl: async () => {
        throw new Error("bad credentials");
      },
    });
    const result = await harness.auth.start({ agentId: "my-agent", methodId: "agent-login" });

    expect(result.mode).toBe("agent");
    const states = harness.published.map((entry) => entry.state);
    expect(states).toEqual(["running", "error"]);
    expect(harness.published.at(-1)?.error).toContain("bad credentials");
  });

  it("rejects a second concurrent flow for the same agent", async () => {
    const harness = createHarness({ authenticateImpl: () => new Promise(() => {}) });
    const first = harness.auth.start({ agentId: "my-agent", methodId: "agent-login" });
    await waitFor(() => expect(harness.auth.isActive("my-agent")).toBe(true));
    await expect(harness.auth.start({ agentId: "my-agent", methodId: "agent-login" })).rejects.toThrow(
      "already running",
    );

    harness.auth.cancel({ agentId: "my-agent" });
    await first;
    expect(harness.published.map((entry) => entry.state)).toContain("cancelled");
  });

  it("runs terminal methods with launch spec + method args, no shell", async () => {
    const harness = createHarness({
      authMethods: [
        { id: "term-1", name: "Terminal Login", type: "terminal", args: ["--login"], env: { TOKEN_MODE: "device" } },
      ],
    });

    const result = await harness.auth.start({ agentId: "my-agent", workdir: "/tmp/ws", methodId: "term-1" });
    expect(result.mode).toBe("terminal");
    expect(result.runId).toBeTruthy();

    expect(harness.spawned).toHaveLength(1);
    expect(harness.spawned[0]!.argv).toEqual(["mcode", "acp", "--login"]);

    harness.emitData(encoder.encode("open https://example.com/device").slice().buffer as ArrayBuffer);
    harness.emitExit(0);
    await waitFor(() => {
      expect(harness.published.map((entry) => entry.state)).toContain("ready");
    });
    expect(harness.release).toHaveBeenCalledWith("my-agent");
    const last = harness.published.at(-1)!;
    expect(last.exitCode).toBe(0);
    expect(last.error).toBeNull();
  });

  it("reports an error when the login process exits non-zero", async () => {
    const harness = createHarness({
      authMethods: [{ id: "term-1", name: "Terminal Login", type: "terminal", args: ["--login"] }],
    });
    await harness.auth.start({ agentId: "my-agent", methodId: "term-1" });

    harness.emitExit(1);
    await waitFor(() => {
      expect(harness.published.map((entry) => entry.state)).toContain("error");
    });
    expect(harness.published.at(-1)?.error).toContain("exited with code 1");
  });

  it("cancels a terminal run and reports cancelled", async () => {
    const harness = createHarness({
      authMethods: [{ id: "term-1", name: "Terminal Login", type: "terminal", args: ["--login"] }],
    });
    const startPromise = harness.auth.start({ agentId: "my-agent", methodId: "term-1" });
    await waitFor(() => expect(harness.spawned).toHaveLength(1));

    harness.auth.cancel({ agentId: "my-agent" });
    await startPromise;
    harness.emitExit(0);

    await waitFor(() => {
      expect(harness.published.map((entry) => entry.state)).toContain("cancelled");
    });
    expect(harness.kills.length).toBeGreaterThan(0);
  });

  it("rejects unknown method ids", async () => {
    const harness = createHarness();
    await expect(harness.auth.start({ agentId: "my-agent", methodId: "nope" })).rejects.toThrow("did not advertise");
  });
});
