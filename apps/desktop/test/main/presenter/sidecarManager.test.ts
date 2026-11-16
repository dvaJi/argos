import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
};

const spawnMock = vi.hoisted(() => vi.fn());
const createServerMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn(() => true));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("node:net", () => ({
  createServer: createServerMock,
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}));

describe("startSidecar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    spawnMock.mockReset();
    createServerMock.mockReset();
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(true);
  });

  it("starts the daemon sidecar, waits for health, and stops cleanly", async () => {
    const child = new EventEmitter() as MockChildProcess;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
      return true;
    });

    spawnMock.mockReturnValue(child);
    createServerMock.mockReturnValue({
      unref: vi.fn(),
      once: vi.fn(),
      listen: (_options: unknown, callback: () => void) => callback(),
      address: () => ({ port: 4321 }),
      close: (callback: (error?: Error) => void) => callback(),
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "ok" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const onStatusChange = vi.fn();
    const onPortAssigned = vi.fn();

    const { startSidecar } = await import("../../../src/main/presenter/sidecarManager");

    const sidecarPromise = startSidecar({
      dataDir: "/tmp/argos-data",
      healthCheckIntervalMs: 5,
      healthCheckTimeoutMs: 100,
      onStatusChange,
      onPortAssigned,
    });

    child.stdout.emit("data", Buffer.from("Listening on http://127.0.0.1:4321\n"));

    const sidecar = await sidecarPromise;
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(onPortAssigned).toHaveBeenCalledWith(4321);
    expect(onStatusChange).toHaveBeenCalledWith("healthy");
    expect(sidecar.port).toBe(4321);
    expect(sidecar.isRunning()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4321/health", expect.any(Object));

    const stopPromise = sidecar.stop();
    child.emit("exit", 0);
    await stopPromise;

    expect(onStatusChange).toHaveBeenCalledWith("stopped");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(sidecar.isRunning()).toBe(false);
  });

  it("finds the daemon source entrypoint from a nested desktop cwd", async () => {
    const child = new EventEmitter() as MockChildProcess;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
      return true;
    });

    spawnMock.mockReturnValue(child);
    createServerMock.mockReturnValue({
      unref: vi.fn(),
      once: vi.fn(),
      listen: (_options: unknown, callback: () => void) => callback(),
      address: () => ({ port: 4321 }),
      close: (callback: (error?: Error) => void) => callback(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ status: "ok" }) })),
    );
    vi.spyOn(process, "cwd").mockReturnValue("/repo/apps/desktop/out/main");
    existsSyncMock.mockImplementation((candidate: string) => candidate.endsWith("/repo/apps/daemon/src/index.ts"));

    const { startSidecar } = await import("../../../src/main/presenter/sidecarManager/index");
    const sidecarPromise = startSidecar({
      dataDir: "/tmp/argos-data",
      healthCheckIntervalMs: 5,
      healthCheckTimeoutMs: 100,
    });

    child.stdout.emit("data", Buffer.from("Listening on http://127.0.0.1:4321\n"));
    const sidecar = await sidecarPromise;
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0]?.[1]?.[1]).toBe("/repo/apps/daemon/src/index.ts");
    expect(sidecar.port).toBe(4321);
  });

  it("whenHealthy resolves immediately once the sidecar is healthy", async () => {
    const child = new EventEmitter() as MockChildProcess;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
      return true;
    });

    spawnMock.mockReturnValue(child);
    createServerMock.mockReturnValue({
      unref: vi.fn(),
      once: vi.fn(),
      listen: (_options: unknown, callback: () => void) => callback(),
      address: () => ({ port: 4321 }),
      close: (callback: (error?: Error) => void) => callback(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ status: "ok" }) })),
    );

    const { startSidecar } = await import("../../../src/main/presenter/sidecarManager/index");
    const sidecarPromise = startSidecar({
      dataDir: "/tmp/argos-data",
      healthCheckIntervalMs: 5,
      healthCheckTimeoutMs: 100,
    });

    child.stdout.emit("data", Buffer.from("Listening on http://127.0.0.1:4321\n"));
    const sidecar = await sidecarPromise;
    await new Promise((resolve) => setTimeout(resolve, 25));

    await expect(sidecar.whenHealthy(100)).resolves.toBeUndefined();

    const stopPromise = sidecar.stop();
    child.emit("exit", 0);
    await stopPromise;
  });

  it("whenHealthy waits for the healthy transition during startup", async () => {
    const child = new EventEmitter() as MockChildProcess;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
      return true;
    });

    spawnMock.mockReturnValue(child);
    createServerMock.mockReturnValue({
      unref: vi.fn(),
      once: vi.fn(),
      listen: (_options: unknown, callback: () => void) => callback(),
      address: () => ({ port: 4321 }),
      close: (callback: (error?: Error) => void) => callback(),
    });
    let fetchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCount += 1;
        if (fetchCount < 3) {
          throw new Error("ECONNREFUSED");
        }
        return { ok: true, json: async () => ({ status: "ok" }) };
      }),
    );

    const { startSidecar } = await import("../../../src/main/presenter/sidecarManager/index");
    const sidecarPromise = startSidecar({
      dataDir: "/tmp/argos-data",
      healthCheckIntervalMs: 5,
      healthCheckTimeoutMs: 500,
    });

    // Reserve the wait before the daemon has answered any health check.
    const readinessPromise = sidecarPromise.then((sidecar) => sidecar.whenHealthy(400));

    child.stdout.emit("data", Buffer.from("Listening on http://127.0.0.1:4321\n"));
    const sidecar = await sidecarPromise;
    await expect(readinessPromise).resolves.toBeUndefined();

    const stopPromise = sidecar.stop();
    child.emit("exit", 0);
    await stopPromise;
  });

  it("whenHealthy rejects when the sidecar stops before becoming healthy", async () => {
    const child = new EventEmitter() as MockChildProcess;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
      return true;
    });

    spawnMock.mockReturnValue(child);
    createServerMock.mockReturnValue({
      unref: vi.fn(),
      once: vi.fn(),
      listen: (_options: unknown, callback: () => void) => callback(),
      address: () => ({ port: 4321 }),
      close: (callback: (error?: Error) => void) => callback(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const { startSidecar } = await import("../../../src/main/presenter/sidecarManager/index");
    const sidecar = await startSidecar({
      dataDir: "/tmp/argos-data",
      healthCheckIntervalMs: 5,
      healthCheckTimeoutMs: 10000,
    });

    const readinessPromise = sidecar.whenHealthy(9000);
    const stopPromise = sidecar.stop();

    await expect(readinessPromise).rejects.toThrow("Daemon stopped");
    child.emit("exit", 0);
    await stopPromise;
  });

  it("publishes the port only once the daemon is listening, before it is healthy", async () => {
    const child = new EventEmitter() as MockChildProcess;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
      return true;
    });

    spawnMock.mockReturnValue(child);
    createServerMock.mockReturnValue({
      unref: vi.fn(),
      once: vi.fn(),
      listen: (_options: unknown, callback: () => void) => callback(),
      address: () => ({ port: 4321 }),
      close: (callback: (error?: Error) => void) => callback(),
    });
    let ready = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ready
          ? { ok: true, json: async () => ({ status: "ok" }) }
          : { ok: false, json: async () => ({ status: "starting" }) },
      ),
    );

    const onPortAssigned = vi.fn();
    const onStatusChange = vi.fn();
    const { startSidecar } = await import("../../../src/main/presenter/sidecarManager/index");
    const sidecar = await startSidecar({
      dataDir: "/tmp/argos-data",
      healthCheckIntervalMs: 5,
      healthCheckTimeoutMs: 10000,
      onPortAssigned,
      onStatusChange,
    });

    // The port is reserved, but nothing is listening yet: do not announce it.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(onPortAssigned).not.toHaveBeenCalled();
    let listeningPort: number | null = null;
    const listeningPromise = sidecar.whenListening(1000).then((port) => {
      listeningPort = port;
    });
    await Promise.resolve();
    expect(listeningPort).toBeNull();

    child.stdout.emit("data", Buffer.from("[INFO] [daemon] Listening on http://127.0.0.1:4321\n"));
    await listeningPromise;
    expect(listeningPort).toBe(4321);
    expect(onPortAssigned).toHaveBeenCalledTimes(1);
    expect(onPortAssigned).toHaveBeenCalledWith(4321);
    expect(onStatusChange).not.toHaveBeenCalledWith("healthy");

    ready = true;
    await expect(sidecar.whenHealthy(1000)).resolves.toBeUndefined();
    expect(onPortAssigned).toHaveBeenCalledTimes(1);

    const stopPromise = sidecar.stop();
    child.emit("exit", 0);
    await stopPromise;
  });

  it("re-checks health after the daemon process restarts", async () => {
    const makeChild = () => {
      const next = new EventEmitter() as MockChildProcess;
      next.stdout = new EventEmitter();
      next.stderr = new EventEmitter();
      next.killed = false;
      next.kill = vi.fn(() => {
        next.killed = true;
        return true;
      });
      return next;
    };
    const first = makeChild();
    const second = makeChild();
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    createServerMock.mockReturnValue({
      unref: vi.fn(),
      once: vi.fn(),
      listen: (_options: unknown, callback: () => void) => callback(),
      address: () => ({ port: 4321 }),
      close: (callback: (error?: Error) => void) => callback(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ status: "ok" }) })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const onPortAssigned = vi.fn();
    const { startSidecar } = await import("../../../src/main/presenter/sidecarManager/index");
    const sidecar = await startSidecar({
      dataDir: "/tmp/argos-data",
      healthCheckIntervalMs: 5,
      healthCheckTimeoutMs: 10000,
      onPortAssigned,
    });
    await sidecar.whenHealthy(1000);
    expect(onPortAssigned).toHaveBeenCalledTimes(1);

    first.emit("exit", 1);
    expect(sidecar.status).toBe("unhealthy");

    // Restart is scheduled 1s after the first crash.
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await expect(sidecar.whenHealthy(1000)).resolves.toBeUndefined();
    expect(onPortAssigned).toHaveBeenCalledTimes(2);

    const stopPromise = sidecar.stop();
    second.emit("exit", 0);
    await stopPromise;
  });

  it("starts the daemon through its dev bundle launcher when one exists", async () => {
    const child = new EventEmitter() as MockChildProcess;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
      return true;
    });

    spawnMock.mockReturnValue(child);
    createServerMock.mockReturnValue({
      unref: vi.fn(),
      once: vi.fn(),
      listen: (_options: unknown, callback: () => void) => callback(),
      address: () => ({ port: 4321 }),
      close: (callback: (error?: Error) => void) => callback(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ status: "ok" }) })),
    );
    vi.spyOn(process, "cwd").mockReturnValue("/repo/apps/desktop");
    existsSyncMock.mockImplementation((candidate: string) => {
      const normalized = candidate.replaceAll(String.fromCharCode(92), "/");
      return (
        normalized.endsWith("/repo/apps/daemon/src/index.ts") ||
        normalized.endsWith("/repo/apps/daemon/src/dev-bundle.ts")
      );
    });

    const { startSidecar } = await import("../../../src/main/presenter/sidecarManager/index");
    const sidecar = await startSidecar({ dataDir: "/tmp/argos-data", healthCheckIntervalMs: 5 });

    const entry = String(spawnMock.mock.calls[0]?.[1]?.[1]).replaceAll(String.fromCharCode(92), "/");
    expect(entry.endsWith("/repo/apps/daemon/src/dev-bundle.ts")).toBe(true);

    const stopPromise = sidecar.stop();
    child.emit("exit", 0);
    await stopPromise;
  });

  it("recognizes a listening announcement split across stdout chunks", async () => {
    const child = new EventEmitter() as MockChildProcess;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
      return true;
    });

    spawnMock.mockReturnValue(child);
    createServerMock.mockReturnValue({
      unref: vi.fn(),
      once: vi.fn(),
      listen: (_options: unknown, callback: () => void) => callback(),
      address: () => ({ port: 4321 }),
      close: (callback: (error?: Error) => void) => callback(),
    });
    // Never healthy: the port must come from the log line alone.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ status: "starting" }) })),
    );

    const onPortAssigned = vi.fn();
    const { startSidecar } = await import("../../../src/main/presenter/sidecarManager/index");
    const sidecar = await startSidecar({
      dataDir: "/tmp/argos-data",
      healthCheckIntervalMs: 5,
      healthCheckTimeoutMs: 10000,
      onPortAssigned,
    });

    child.stdout.emit("data", Buffer.from("[INFO] [daemon] Listening on http://127.0"));
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(onPortAssigned).not.toHaveBeenCalled();

    child.stdout.emit("data", Buffer.from(".0.1:4321\n[INFO] next line without newline"));
    await expect(sidecar.whenListening(1000)).resolves.toBe(4321);
    expect(onPortAssigned).toHaveBeenCalledWith(4321);

    const stopPromise = sidecar.stop();
    child.emit("exit", 0);
    await stopPromise;
  });
});
