import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { RequestError } from "@agentclientprotocol/sdk";
import type * as schema from "@agentclientprotocol/sdk";

/**
 * Structural subset of the host runtime's PTY APIs — a `Terminal` constructor
 * plus a `spawn` that accepts a `terminal` option (available in the Bun
 * daemon's runtime, >= 1.4.0). Resolved via `globalThis` so this package keeps
 * no runtime-specific global binding and stays stub-able from Node-based
 * tests.
 */
interface PtyTerminal {
  write(data: string): unknown;
  resize(cols: number, rows: number): unknown;
  close(): unknown;
}

interface PtySubprocess {
  exited: Promise<number>;
  kill(): unknown;
}

interface BunPtyApi {
  Terminal: new (options: {
    cols: number;
    rows: number;
    data: (terminal: unknown, data: string | Uint8Array) => void;
  }) => PtyTerminal;
  spawn: (
    argv: readonly string[],
    options: { terminal: PtyTerminal; cwd: string; env: Record<string, string | undefined> },
  ) => PtySubprocess;
}

function resolveBunPtyApi(): BunPtyApi {
  const ptyHost = (globalThis as unknown as { Bun?: Partial<BunPtyApi> }).Bun;
  if (!ptyHost || typeof ptyHost.Terminal !== "function" || typeof ptyHost.spawn !== "function") {
    throw new Error("ACP terminals require a Bun >= 1.4.0 host runtime (no PTY Terminal API available)");
  }
  return ptyHost as BunPtyApi;
}

interface TerminalState {
  id: string;
  sessionId: string;
  terminal: PtyTerminal;
  ptyProcess: PtySubprocess;
  outputBuffer: string;
  maxOutputBytes: number;
  truncated: boolean;
  exitStatus: { exitCode?: number | null; signal?: string | null } | null;
  exitPromise: Promise<{ exitCode?: number | null; signal?: string | null }>;
  exitResolve: (status: { exitCode?: number | null; signal?: string | null }) => void;
  killed: boolean;
  released: boolean;
}

/**
 * Manages PTY-based terminals for ACP agent command execution.
 *
 * This manager implements the ACP terminal protocol, allowing agents to:
 * - Create terminals to execute commands
 * - Read terminal output
 * - Wait for command completion
 * - Kill running commands
 * - Release terminal resources
 *
 * Terminals run on the host runtime's built-in PTY (`Terminal` + `spawn`
 * with a `terminal` option).
 *
 * @see https://agentclientprotocol.com/protocol/terminals
 */
export class AcpTerminalManager {
  private readonly terminals = new Map<string, TerminalState>();
  private readonly defaultMaxOutputBytes = 1024 * 1024; // 1MB default

  constructor(private readonly tempDir: () => string) {}

  private resolveTerminalCwd(cwd?: string | null): string {
    const normalized = cwd?.trim();
    if (normalized) {
      return path.resolve(normalized);
    }

    const fallbackDir = path.join(this.tempDir(), "argos-acp", "terminals");
    try {
      fs.mkdirSync(fallbackDir, { recursive: true });
      console.warn(`[ACP Terminal] Missing cwd, using fallback directory: ${fallbackDir}`);
      return fallbackDir;
    } catch (error) {
      const tempDir = this.tempDir();
      console.warn(`[ACP Terminal] Failed to create fallback directory, using temp path instead: ${tempDir}`, error);
      return tempDir;
    }
  }

  /**
   * Create a new terminal to execute a command.
   */
  async createTerminal(params: schema.CreateTerminalRequest): Promise<schema.CreateTerminalResponse> {
    const bun = resolveBunPtyApi();
    const id = `term_${nanoid(12)}`;
    const maxOutputBytes = params.outputByteLimit ?? this.defaultMaxOutputBytes;
    const cwd = this.resolveTerminalCwd(params.cwd);

    let exitResolve!: (status: { exitCode?: number | null; signal?: string | null }) => void;
    const exitPromise = new Promise<{ exitCode?: number | null; signal?: string | null }>((resolve) => {
      exitResolve = resolve;
    });

    // Build environment from env array
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    if (params.env) {
      for (const envVar of params.env) {
        env[envVar.name] = envVar.value;
      }
    }
    // Replaces the terminal `name` option of classic node-pty-style PTYs.
    env.TERM = env.TERM || "xterm-256color";

    const decoder = new TextDecoder();
    const terminal = new bun.Terminal({
      cols: 120,
      rows: 30,
      data: (_ptyTerminal, data) => {
        if (state.released) return;
        const chunk = typeof data === "string" ? data : decoder.decode(data, { stream: true });
        const nextBuffer = state.outputBuffer + chunk;
        state.outputBuffer = this.retainTailAtCharBoundary(nextBuffer, state.maxOutputBytes);
        state.truncated = state.truncated || Buffer.byteLength(nextBuffer, "utf-8") > state.maxOutputBytes;
      },
    });

    const ptyProcess = bun.spawn([params.command, ...(params.args ?? [])], {
      terminal,
      cwd,
      env,
    });

    const state: TerminalState = {
      id,
      sessionId: params.sessionId,
      terminal,
      ptyProcess,
      outputBuffer: "",
      maxOutputBytes,
      truncated: false,
      exitStatus: null,
      exitPromise,
      exitResolve,
      killed: false,
      released: false,
    };

    // Handle exit. Bun's `exited` promise reports the exit code only.
    void ptyProcess.exited
      .then((exitCode) => {
        state.exitStatus = {
          exitCode: typeof exitCode === "number" ? exitCode : null,
          signal: null,
        };
        exitResolve(state.exitStatus);
      })
      .catch(() => {
        state.exitStatus = { exitCode: null, signal: null };
        exitResolve(state.exitStatus);
      });

    this.terminals.set(id, state);
    return { terminalId: id };
  }

  /**
   * Get current terminal output without waiting.
   */
  async terminalOutput(params: schema.TerminalOutputRequest): Promise<schema.TerminalOutputResponse> {
    const state = this.getTerminal(params.terminalId);

    return {
      output: state.outputBuffer,
      truncated: state.truncated,
      exitStatus: state.exitStatus ?? undefined,
    };
  }

  /**
   * Wait for a terminal command to exit.
   */
  async waitForTerminalExit(params: schema.WaitForTerminalExitRequest): Promise<schema.WaitForTerminalExitResponse> {
    const state = this.getTerminal(params.terminalId);
    const status = await state.exitPromise;
    return status;
  }

  /**
   * Kill a terminal command without releasing the terminal.
   */
  async killTerminal(params: schema.KillTerminalRequest): Promise<schema.KillTerminalResponse> {
    const state = this.getTerminal(params.terminalId);

    if (!state.killed && !state.exitStatus) {
      try {
        state.ptyProcess.kill();
        state.killed = true;
      } catch (error) {
        console.warn(`[ACP Terminal] Failed to kill terminal ${params.terminalId}:`, error);
      }
    }

    return {};
  }

  /**
   * Release a terminal and free all associated resources.
   */
  async releaseTerminal(params: schema.ReleaseTerminalRequest): Promise<schema.ReleaseTerminalResponse> {
    const state = this.terminals.get(params.terminalId);
    if (!state) return {}; // Already released, idempotent

    if (!state.killed && !state.exitStatus) {
      try {
        state.ptyProcess.kill();
      } catch (error) {
        console.warn(`[ACP Terminal] Failed to kill terminal on release ${params.terminalId}:`, error);
      }
    }

    state.released = true;
    try {
      state.terminal.close();
    } catch {
      // Already closed.
    }
    this.terminals.delete(params.terminalId);
    return {};
  }

  /**
   * Clean up all terminals for a session.
   */
  async releaseSessionTerminals(sessionId: string): Promise<void> {
    const toRelease = Array.from(this.terminals.values())
      .filter((t) => t.sessionId === sessionId)
      .map((t) => t.id);

    await Promise.all(toRelease.map((id) => this.releaseTerminal({ terminalId: id, sessionId })));
  }

  /**
   * Shutdown all terminals.
   */
  async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.terminals.values()).map((t) =>
        this.releaseTerminal({ terminalId: t.id, sessionId: t.sessionId }),
      ),
    );
  }

  private getTerminal(id: string): TerminalState {
    const state = this.terminals.get(id);
    if (!state) {
      throw RequestError.resourceNotFound(id);
    }
    return state;
  }

  private retainTailAtCharBoundary(str: string, maxBytes: number): string {
    if (maxBytes <= 0) return "";

    const buf = Buffer.from(str, "utf-8");
    if (buf.length <= maxBytes) return str;

    for (let start = buf.length - maxBytes; start < buf.length; start += 1) {
      const tail = buf.subarray(start);
      const decoded = tail.toString("utf-8");
      if (!decoded.startsWith("\uFFFD")) {
        return decoded;
      }
    }
    return "";
  }
}
