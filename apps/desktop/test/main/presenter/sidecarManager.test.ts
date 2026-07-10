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

    const { startSidecar } = await import("../../../../src/main/presenter/sidecarManager");

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

    const { startSidecar } = await import("../../../../src/main/presenter/sidecarManager");
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
});
