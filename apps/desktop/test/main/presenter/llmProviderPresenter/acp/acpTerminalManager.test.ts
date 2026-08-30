import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcpTerminalManager } from "@argos/acp-runtime";

interface FakeTerminalInstance {
  options: { cols: number; rows: number; data: (terminal: unknown, data: string | Uint8Array) => void };
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

const terminalInstances: FakeTerminalInstance[] = [];

interface FakeSpawnResult {
  exited: Promise<number>;
  kill: ReturnType<typeof vi.fn>;
  resolveExited: (code: number) => void;
}

const spawnResults: FakeSpawnResult[] = [];

const terminalCtor = vi.fn(function (options: {
  cols: number;
  rows: number;
  data: (terminal: unknown, data: string | Uint8Array) => void;
}) {
  const instance: FakeTerminalInstance = { options, write: vi.fn(), resize: vi.fn(), close: vi.fn() };
  terminalInstances.push(instance);
  return instance;
});

const spawnMock = vi.fn(function (): FakeSpawnResult {
  let resolveExited!: (code: number) => void;
  const exited = new Promise<number>((resolve) => {
    resolveExited = resolve;
  });
  const kill = vi.fn();
  const result: FakeSpawnResult = { exited, kill, resolveExited };
  spawnResults.push(result);
  return result;
});

// AcpTerminalManager resolves the PTY through `globalThis.Bun` (Bun >= 1.4.0).
vi.stubGlobal("Bun", { Terminal: terminalCtor, spawn: spawnMock });

function lastTerminal(): FakeTerminalInstance {
  const instance = terminalInstances.at(-1);
  if (!instance) throw new Error("no terminal created");
  return instance;
}

describe("AcpTerminalManager", () => {
  beforeEach(() => {
    terminalInstances.length = 0;
    spawnResults.length = 0;
    vi.clearAllMocks();
    vi.spyOn<(...args: any[]) => any>(fs, "mkdirSync").mockImplementation(() => undefined);
  });

  it("uses the provided cwd when one is supplied", async () => {
    const manager = new AcpTerminalManager(() => "/tmp");

    await manager.createTerminal({
      sessionId: "session-1",
      command: "pwd",
      cwd: "/tmp/workspace",
    });

    expect(spawnMock).toHaveBeenCalledWith(
      ["pwd"],
      expect.objectContaining({
        cwd: expect.stringContaining(path.normalize("/tmp/workspace")),
      }),
    );
  });

  it("falls back to a controlled temp directory when cwd is missing", async () => {
    const manager = new AcpTerminalManager(() => "/tmp");

    await manager.createTerminal({
      sessionId: "session-1",
      command: "pwd",
    });

    expect(fs.mkdirSync).toHaveBeenCalledWith(path.normalize("/tmp/argos-acp/terminals"), {
      recursive: true,
    });
    expect(spawnMock).toHaveBeenCalledWith(
      ["pwd"],
      expect.objectContaining({
        cwd: expect.stringContaining(path.normalize("/tmp/argos-acp/terminals")),
      }),
    );
  });

  it("passes command arguments directly without shell concatenation", async () => {
    const manager = new AcpTerminalManager(() => "/tmp");

    await manager.createTerminal({
      sessionId: "session-1",
      command: "node",
      args: ["-e", 'console.log("hello world")'],
      cwd: "/tmp/workspace",
    });

    expect(spawnMock).toHaveBeenCalledWith(
      ["node", "-e", 'console.log("hello world")'],
      expect.objectContaining({
        cwd: expect.stringContaining(path.normalize("/tmp/workspace")),
      }),
    );
  });

  it("retains the latest terminal output when outputByteLimit is exceeded", async () => {
    const manager = new AcpTerminalManager(() => "/tmp");

    const response = await manager.createTerminal({
      sessionId: "session-1",
      command: "node",
      outputByteLimit: 6,
      cwd: "/tmp/workspace",
    });
    const onData = lastTerminal().options.data;

    onData({}, "abcdef");
    onData({}, "ghij");

    await expect(
      manager.terminalOutput({ sessionId: "session-1", terminalId: response.terminalId }),
    ).resolves.toMatchObject({
      output: "efghij",
      truncated: true,
    });
  });

  it("preserves UTF-8 character boundaries when truncating multibyte output", async () => {
    const manager = new AcpTerminalManager(() => "/tmp");

    const response = await manager.createTerminal({
      sessionId: "session-1",
      command: "cat",
      outputByteLimit: 4,
      cwd: "/tmp/workspace",
    });
    const onData = lastTerminal().options.data;

    onData({}, "ab你好");

    const result = await manager.terminalOutput({ sessionId: "session-1", terminalId: response.terminalId });
    expect(result.truncated).toBe(true);
    expect(result.output).not.toContain("\uFFFD");
  });

  it("decodes byte chunks with a streaming decoder across chunk boundaries", async () => {
    const manager = new AcpTerminalManager(() => "/tmp");

    const response = await manager.createTerminal({
      sessionId: "session-1",
      command: "cat",
      cwd: "/tmp/workspace",
    });
    const onData = lastTerminal().options.data;
    const encoder = new TextEncoder();
    const bytes = encoder.encode("ab你好");
    // Split mid-multibyte-character: "ab" = 3 bytes, first byte of 你 = 3rd byte.
    onData({}, bytes.slice(0, 3));
    onData({}, bytes.slice(3));

    const result = await manager.terminalOutput({ sessionId: "session-1", terminalId: response.terminalId });
    expect(result.output).toBe("ab你好");
  });

  it("kill is idempotent and only kills the pty once", async () => {
    const manager = new AcpTerminalManager(() => "/tmp");

    const response = await manager.createTerminal({
      sessionId: "session-1",
      command: "node",
      cwd: "/tmp/workspace",
    });

    await manager.killTerminal({ terminalId: response.terminalId });
    await manager.killTerminal({ terminalId: response.terminalId });

    expect(spawnResults[0].kill).toHaveBeenCalledTimes(1);
  });

  it("release is idempotent and stops collecting output", async () => {
    const manager = new AcpTerminalManager(() => "/tmp");

    const response = await manager.createTerminal({
      sessionId: "session-1",
      command: "node",
      cwd: "/tmp/workspace",
    });
    const onData = lastTerminal().options.data;

    onData({}, "before-release");
    await manager.releaseTerminal({ terminalId: response.terminalId });
    onData({}, "after-release");

    await expect(manager.terminalOutput({ sessionId: "session-1", terminalId: response.terminalId })).rejects.toThrow();
  });
});
