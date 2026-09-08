import { describe, expect, it, vi } from "bun:test";
import { DaemonAcpAuthRuntime } from "../src/host/acpAuthRuntime";

/**
 * Hermetic coverage for the daemon ACP auth runtime: agent-method
 * authenticate (bounded, backgrounded), terminal-method PTY flow (argv,
 * output streaming incl. chunking, exit handling, cancel, handle release),
 * single-flight reservation, and setup-failure recovery.
 */

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

const createHarness = (options?: {
  authMethods?: Array<Record<string, unknown>>;
  authenticateImpl?: () => Promise<unknown>;
  spawnThrows?: Error;
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
  const killArgs: Array<string | undefined> = [];
  let resolveExit: ((code: number) => void) | null = null;
  const exited = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });
  let dataHandler: ((data: Uint8Array) => void) | null = null;

  const deps = {
    eventPublisher,
    getProcessManager: async () => processManager,
    resolveLaunchSpec: vi.fn(async () => ({ command: "mcode", args: ["acp"], env: { SPEC_VAR: "1" } })),
    ptyFactory: (opts: { onData: (data: Uint8Array) => void }) => {
      dataHandler = opts.onData;
      return {
        write: (data: string | Uint8Array) => {
          terminalWrites.push(typeof data === "string" ? data : new TextDecoder().decode(data));
        },
        kill: (signal?: string) => killArgs.push(signal),
        close: vi.fn(() => undefined),
      };
    },
    spawnPty: vi.fn((argv: string[], o: { env: Record<string, string | undefined> }) => {
      if (options?.spawnThrows) throw options.spawnThrows;
      spawned.push({ argv, env: o.env });
      return { exited };
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
    killArgs,
    emitExit: (code: number) => resolveExit?.(code),
    emitData: (text: string) => dataHandler?.(encoder.encode(text)),
  };
};

describe("DaemonAcpAuthRuntime", () => {
  it("authenticates agent methods in the background and reports ready via events", async () => {
    const harness = createHarness();
    const result = await harness.auth.start({ agentId: "my-agent", methodId: "agent-login" });

    expect(result.mode).toBe("agent");
    expect(result.runId).toBeNull();
    await waitFor(() => expect(harness.published.map((entry) => entry.state)).toContain("ready"));
    expect(harness.authenticate).toHaveBeenCalled();
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
    await waitFor(() => expect(harness.published.map((entry) => entry.state)).toContain("error"));
    expect(harness.published.at(-1)?.error).toContain("bad credentials");
  });

  it("reserves the agent synchronously so concurrent starts cannot double-launch", async () => {
    const harness = createHarness({ authenticateImpl: () => new Promise(() => {}) });
    const first = harness.auth.start({ agentId: "my-agent", methodId: "agent-login" });
    // The reservation is installed synchronously: the immediate second start
    // must reject even before the first flow finished.
    await expect(harness.auth.start({ agentId: "my-agent", methodId: "agent-login" })).rejects.toThrow(
      "already running",
    );

    harness.auth.cancel({ agentId: "my-agent" });
    await first;
    await waitFor(() => expect(harness.published.map((entry) => entry.state)).toContain("cancelled"));
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

    harness.emitExit(0);
    await waitFor(() => expect(harness.published.map((entry) => entry.state)).toContain("ready"));
    expect(harness.release).toHaveBeenCalledWith("my-agent");
    const last = harness.published.at(-1)!;
    expect(last.exitCode).toBe(0);
    expect(last.error).toBeNull();
  });

  it("streams PTY output through events", async () => {
    const harness = createHarness({
      authMethods: [{ id: "term-1", name: "Terminal Login", type: "terminal", args: ["--login"] }],
    });
    await harness.auth.start({ agentId: "my-agent", methodId: "term-1" });

    harness.emitData("open https://example.com/device");
    await waitFor(() => {
      const outputs = harness.published.filter((entry) => typeof entry.output === "string");
      expect(outputs.length).toBeGreaterThan(0);
    });
    const outputEvent = harness.published.find((entry) => typeof entry.output === "string");
    expect(outputEvent?.output).toContain("https://example.com/device");
  });

  it("chunks oversized PTY buffers instead of dropping the remainder", async () => {
    const harness = createHarness({
      authMethods: [{ id: "term-1", name: "Terminal Login", type: "terminal", args: ["--login"] }],
    });
    await harness.auth.start({ agentId: "my-agent", methodId: "term-1" });

    // 64KB + 1 byte: two output events, nothing dropped.
    harness.emitData("a".repeat(64 * 1024 + 1));
    await waitFor(() => {
      const outputs = harness.published.filter((entry) => typeof entry.output === "string");
      expect(outputs.length).toBe(2);
    });
    const total = harness.published
      .filter((entry) => typeof entry.output === "string")
      .reduce((sum, entry) => sum + (entry.output as string).length, 0);
    expect(total).toBe(64 * 1024 + 1);
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

  it("force-kills and reports cancelled terminal runs", async () => {
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
    expect(harness.killArgs).toContain(process.platform === "win32" ? undefined : "SIGKILL");
  });

  it("releases the run when PTY setup fails so the agent stays retryable", async () => {
    const harness = createHarness({
      authMethods: [{ id: "term-1", name: "Terminal Login", type: "terminal", args: ["--login"] }],
      spawnThrows: new Error("cwd missing"),
    });

    await expect(harness.auth.start({ agentId: "my-agent", methodId: "term-1" })).rejects.toThrow(
      "Terminal authentication could not start",
    );
    await waitFor(() => expect(harness.published.map((entry) => entry.state)).toContain("error"));

    // The reservation is released: a retry is accepted.
    const retry = harness.auth.start({ agentId: "my-agent", methodId: "term-1" });
    await expect(retry).rejects.toThrow("Terminal authentication could not start");
  });

  it("rejects unknown method ids", async () => {
    const harness = createHarness();
    await expect(harness.auth.start({ agentId: "my-agent", methodId: "nope" })).rejects.toThrow("did not advertise");
  });
});
