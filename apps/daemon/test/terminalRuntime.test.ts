import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DaemonTerminalRuntime } from "../src/terminal/daemonTerminalRuntime";
import {
  terminalAttachRoute,
  terminalCreateRoute,
  terminalListRoute,
  terminalKillRoute,
} from "@argos/shared-contracts/routes";

interface PublishedEvent {
  name: string;
  payload: Record<string, unknown>;
}

function createFakePublisher() {
  const published: PublishedEvent[] = [];
  return {
    published,
    publish(name: string, payload: unknown) {
      published.push({ name, payload: payload as Record<string, unknown> });
    },
    subscribe(_name: string, _handler: (payload: unknown) => void) {
      return () => undefined;
    },
  };
}

function decodeChunks(events: PublishedEvent[]): string {
  return events
    .map((event) => {
      const payload = event.payload as Record<string, unknown>;
      return Buffer.from(payload.data as string, "base64").toString("utf8");
    })
    .join("");
}

function outputEvents(published: PublishedEvent[], terminalId: string) {
  return published.filter((event) => event.name === "terminal.output" && event.payload.terminalId === terminalId);
}

async function waitFor(
  poll: () => boolean,
  { timeoutMs = 20000, label }: { timeoutMs?: number; label: string },
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (poll()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function platformShell(): { shell: string; args: string[] } {
  if (process.platform === "win32") {
    return { shell: join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe"), args: [] };
  }
  return { shell: process.env.SHELL && process.env.SHELL.includes("sh") ? process.env.SHELL : "/bin/bash", args: [] };
}

function lineEnd(): string {
  return process.platform === "win32" ? "\r\n" : "\n";
}

async function createRuntime(options?: { scrollbackLimitBytes?: number }) {
  const publisher = createFakePublisher();
  const runtime = new DaemonTerminalRuntime(publisher as never, options);
  const shell = platformShell();
  const created = await runtime.create({
    cwd: tmpdir(),
    shell: shell.shell,
    cols: 80,
    rows: 24,
  });
  return { publisher, runtime, terminalId: created.terminalId };
}

describe("DaemonTerminalRuntime", () => {
  test("streams shell output and input roundtrips with increasing seq", async () => {
    const { publisher, runtime, terminalId } = await createRuntime();
    try {
      const marker = `argos-pty-marker-${Date.now()}`;
      runtime.sendInput(terminalId, `echo ${marker}${lineEnd()}`);

      const events = () => outputEvents(publisher.published, terminalId);
      await waitFor(() => decodeChunks(events()).includes(marker), { label: "marker in terminal output" });

      const seqs = events().map((event) => event.payload.seq as number);
      expect(seqs.length).toBeGreaterThan(0);
      for (let i = 1; i < seqs.length; i += 1) {
        expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
      }

      const dispatchCreate = terminalCreateRoute.output.parse(
        // Route contract accepts the runtime result shape.
        { terminalId, shell: "shell", cwd: tmpdir(), cols: 80, rows: 24 },
      );
      expect(dispatchCreate.terminalId).toBe(terminalId);
    } finally {
      runtime.shutdown();
    }
  }, 30000);

  test("attach replays scrollback including prior output", async () => {
    const { publisher, runtime, terminalId } = await createRuntime();
    try {
      const marker = `attach-replay-${Date.now()}`;
      runtime.sendInput(terminalId, `echo ${marker}${lineEnd()}`);
      const events = () => outputEvents(publisher.published, terminalId);
      await waitFor(() => decodeChunks(events()).includes(marker), { label: "marker before attach" });

      const lastSeq = Math.max(...events().map((event) => event.payload.seq as number));
      const attached = runtime.attach(terminalId);
      const decoded = Buffer.from(attached.buffer, "base64").toString("utf8");

      expect(decoded).toContain(marker);
      expect(attached.seq).toBeGreaterThanOrEqual(lastSeq);
      expect(attached.exitStatus).toBeNull();
    } finally {
      runtime.shutdown();
    }
  }, 30000);

  test("scrollback is trimmed to the configured byte limit on char boundaries", async () => {
    const limit = 128;
    const { runtime, terminalId } = await createRuntime({ scrollbackLimitBytes: limit });
    try {
      const longLine = "x".repeat(600);
      runtime.sendInput(terminalId, `echo ${longLine}${lineEnd()}`);
      await waitFor(
        () => {
          const decoded = Buffer.from(runtime.attach(terminalId).buffer, "base64");
          return decoded.length >= limit;
        },
        { label: "scrollback to fill" },
      );

      const decoded = Buffer.from(runtime.attach(terminalId).buffer, "base64");
      expect(decoded.length).toBeLessThanOrEqual(limit);
    } finally {
      runtime.shutdown();
    }
  }, 30000);

  test("kill terminates the session, publishes terminal.exit, and disposes the session", async () => {
    const { publisher, runtime, terminalId } = await createRuntime();
    try {
      runtime.kill(terminalId);

      await waitFor(
        () =>
          publisher.published.some(
            (event) => event.name === "terminal.exit" && event.payload.terminalId === terminalId,
          ),
        { label: "terminal.exit event" },
      );

      const exit = publisher.published.find((event) => event.name === "terminal.exit");
      expect(exit).toBeDefined();
      // User-killed sessions are disposed once the process is gone: no
      // scrollback retention and nothing for terminal.list to resurrect
      // after a client reload.
      expect(runtime.list().find((entry) => entry.terminalId === terminalId)).toBeUndefined();
    } finally {
      runtime.shutdown();
    }
  }, 30000);

  test("naturally exited sessions linger until a client kill disposes them", async () => {
    const { runtime, terminalId } = await createRuntime();
    // Simulate the shell exiting on its own (not via kill).
    const sessions = (runtime as unknown as { sessions: Map<string, { proc: { kill(): void } }> }).sessions;
    sessions.get(terminalId)?.proc.kill();
    await waitFor(() => runtime.list().find((entry) => entry.terminalId === terminalId)?.exitStatus != null, {
      label: "exit status",
    });

    // Natural exit keeps the session (restartable across reloads)...
    expect(runtime.list().find((entry) => entry.terminalId === terminalId)).toBeDefined();
    // ...until the client closes the tab, which disposes it.
    runtime.kill(terminalId);
    expect(runtime.list().find((entry) => entry.terminalId === terminalId)).toBeUndefined();
    runtime.shutdown();
  }, 30000);

  test("rejects unknown terminal ids and invalid cwd", async () => {
    const publisher = createFakePublisher();
    const runtime = new DaemonTerminalRuntime(publisher as never);
    expect(() => runtime.sendInput("term_does_not_exist", "x")).toThrow("Unknown terminal");

    await expect(runtime.create({ cwd: join(tmpdir(), "argos-missing-dir-xyz") })).rejects.toThrow("not a directory");
    runtime.shutdown();
  });

  test("attach flushes pending output so the replay buffer is fully covered by its seq", async () => {
    const { publisher, runtime, terminalId } = await createRuntime();
    try {
      // Attach immediately after sending input, racing the ~16ms coalescing
      // window: pending bytes must either be in the buffer (covered by seq)
      // or not — never both.
      for (let round = 0; round < 4; round += 1) {
        const marker = `attach-flush-${round}-${Date.now()}`;
        runtime.sendInput(terminalId, `echo ${marker}${lineEnd()}`);

        const attached = runtime.attach(terminalId);
        await waitFor(() => decodeChunks(outputEvents(publisher.published, terminalId)).includes(marker), {
          label: `marker round ${round}`,
        });

        const covered = decodeChunks(
          outputEvents(publisher.published, terminalId).filter(
            (event) => (event.payload.seq as number) <= attached.seq,
          ),
        );
        const decodedBuffer = Buffer.from(attached.buffer, "base64").toString("utf8");
        expect(decodedBuffer).toBe(covered);
      }
    } finally {
      runtime.shutdown();
    }
  }, 30000);

  test("resize on a live terminal updates without error", async () => {
    const { runtime, terminalId } = await createRuntime();
    try {
      expect(() => runtime.resize(terminalId, 120, 40)).not.toThrow();
    } finally {
      runtime.shutdown();
    }
  }, 30000);
});

describe("terminal route contracts", () => {
  test("create fills dimension defaults and validates bounds", () => {
    const parsed = terminalCreateRoute.input.parse({ cwd: tmpdir() });
    expect(parsed.cols).toBe(80);
    expect(parsed.rows).toBe(24);

    expect(() => terminalCreateRoute.input.parse({ cwd: tmpdir(), cols: 1 })).toThrow();
    expect(() => terminalCreateRoute.input.parse({ cwd: tmpdir(), rows: 9999 })).toThrow();
  });

  test("dispatcher wires terminal routes to the runtime through the catalog contracts", async () => {
    const { createDaemonDispatcher } = await import("../src/dispatch/daemonDispatcher");
    const publisher = createFakePublisher();
    const runtime = new DaemonTerminalRuntime(publisher as never);
    // Positional params before `terminalRuntime` are unused by terminal routes.
    const dispatch = (createDaemonDispatcher as any)({}, ...Array(17).fill(undefined), runtime);

    try {
      const created = (await dispatch(terminalCreateRoute.name, { cwd: tmpdir(), shell: platformShell().shell })) as {
        terminalId: string;
        cols: number;
      };
      expect(created.terminalId).toMatch(/^term_/);
      expect(created.cols).toBe(80);

      const listed = (await dispatch(terminalListRoute.name, {})) as { terminals: Array<{ terminalId: string }> };
      expect(listed.terminals.map((entry) => entry.terminalId)).toContain(created.terminalId);

      const attached = (await dispatch(terminalAttachRoute.name, { terminalId: created.terminalId })) as {
        seq: number;
        buffer: string;
      };
      expect(attached.seq).toBe(0);
      expect(attached.buffer).toBe("");

      await dispatch(terminalKillRoute.name, { terminalId: created.terminalId });
      await waitFor(() => publisher.published.some((event) => event.name === "terminal.exit"), {
        label: "exit event via dispatcher",
      });
    } finally {
      runtime.shutdown();
    }
  }, 30000);
});
