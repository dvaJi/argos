import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcpTerminalManager } from "@argos/acp-runtime";
import { spawn } from "node-pty";

vi.mock("node-pty", () => ({
  spawn: vi.fn<(...args: any[]) => any>(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn<(...args: any[]) => any>((name: string) => (name === "temp" ? "/tmp" : "/tmp")),
  },
}));

describe("AcpTerminalManager", () => {
  const createPty = () => ({
    onData: vi.fn<(...args: any[]) => any>(),
    onExit: vi.fn<(...args: any[]) => any>(),
    kill: vi.fn<(...args: any[]) => any>(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn<(...args: any[]) => any>(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.mocked<(...args: any[]) => any>(spawn).mockReturnValue(createPty() as never);
  });

  it("uses the provided cwd when one is supplied", async () => {
    const manager = new AcpTerminalManager(() => "/tmp");

    await manager.createTerminal({
      sessionId: "session-1",
      command: "pwd",
      cwd: "/tmp/workspace",
    });

    expect(spawn).toHaveBeenCalledWith(
      "pwd",
      [],
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
    expect(spawn).toHaveBeenCalledWith(
      "pwd",
      [],
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

    expect(spawn).toHaveBeenCalledWith(
      "node",
      ["-e", 'console.log("hello world")'],
      expect.objectContaining({
        cwd: expect.stringContaining(path.normalize("/tmp/workspace")),
      }),
    );
  });

  it("retains the latest terminal output when outputByteLimit is exceeded", async () => {
    const pty = createPty();
    vi.mocked<(...args: any[]) => any>(spawn).mockReturnValue(pty as never);
    const manager = new AcpTerminalManager(() => "/tmp");

    const response = await manager.createTerminal({
      sessionId: "session-1",
      command: "node",
      outputByteLimit: 6,
      cwd: "/tmp/workspace",
    });
    const onData = pty.onData.mock.calls[0][0] as (data: string) => void;

    onData("abcdef");
    onData("ghij");

    await expect(
      manager.terminalOutput({ sessionId: "session-1", terminalId: response.terminalId }),
    ).resolves.toMatchObject({
      output: "efghij",
      truncated: true,
    });
  });

  it("preserves UTF-8 character boundaries when truncating multibyte output", async () => {
    const pty = createPty();
    vi.mocked<(...args: any[]) => any>(spawn).mockReturnValue(pty as never);
    const manager = new AcpTerminalManager(() => "/tmp");

    const response = await manager.createTerminal({
      sessionId: "session-1",
      command: "cat",
      outputByteLimit: 4,
      cwd: "/tmp/workspace",
    });
    const onData = pty.onData.mock.calls[0][0] as (data: string) => void;

    onData("ab你好");

    const result = await manager.terminalOutput({ sessionId: "session-1", terminalId: response.terminalId });
    expect(result.truncated).toBe(true);
    expect(result.output).not.toContain("\uFFFD");
  });

  it("kill is idempotent and only kills the pty once", async () => {
    const pty = createPty();
    vi.mocked<(...args: any[]) => any>(spawn).mockReturnValue(pty as never);
    const manager = new AcpTerminalManager(() => "/tmp");

    const response = await manager.createTerminal({
      sessionId: "session-1",
      command: "node",
      cwd: "/tmp/workspace",
    });

    await manager.killTerminal({ terminalId: response.terminalId });
    await manager.killTerminal({ terminalId: response.terminalId });

    expect(pty.kill).toHaveBeenCalledTimes(1);
  });

  it("release is idempotent and stops collecting output", async () => {
    const pty = createPty();
    vi.mocked<(...args: any[]) => any>(spawn).mockReturnValue(pty as never);
    const manager = new AcpTerminalManager(() => "/tmp");

    const response = await manager.createTerminal({
      sessionId: "session-1",
      command: "node",
      cwd: "/tmp/workspace",
    });
    const onData = pty.onData.mock.calls[0][0] as (data: string) => void;

    onData("before-release");
    await manager.releaseTerminal({ terminalId: response.terminalId });
    onData("after-release");

    await expect(manager.terminalOutput({ sessionId: "session-1", terminalId: response.terminalId })).rejects.toThrow();
  });
});
