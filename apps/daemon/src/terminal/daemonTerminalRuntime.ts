import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import type { IEventPublisher } from "@argos/backend-core";
import { terminalExitEvent, terminalOutputEvent } from "@argos/shared-contracts";
import type { TerminalExitStatus } from "@argos/shared-contracts";

/** Interval at which buffered PTY chunks are coalesced into one event. */
const TERMINAL_FLUSH_MS = 16;
/** Default per-terminal scrollback retained for replay after (re)attach. */
const DEFAULT_SCROLLBACK_LIMIT_BYTES = 1024 * 1024;

/** Structural subset of `Bun.Terminal` used by the runtime (Bun >= 1.4.0). */
interface PtyTerminal {
  write(data: string | Uint8Array): unknown;
  resize(cols: number, rows: number): unknown;
  close(): unknown;
}

type PtyTerminalCtor = new (options: {
  cols: number;
  rows: number;
  data: (terminal: unknown, data: Uint8Array | string) => void;
}) => PtyTerminal;

interface PtySpawnOptions {
  terminal: PtyTerminal;
  cwd: string;
  env: Record<string, string | undefined>;
}

interface PtySubprocess {
  exited: Promise<number>;
  kill(signal?: string): unknown;
}

/**
 * Signal used to terminate PTY children. Interactive shells (bash) ignore
 * SIGTERM once fully initialized, so the default `proc.kill()` SIGTERM races
 * shell startup and can leave the shell alive — SIGKILL cannot be ignored
 * (Windows maps any kill to TerminateProcess).
 */
function killPtyProcess(proc: PtySubprocess): void {
  proc.kill(process.platform === "win32" ? undefined : "SIGKILL");
}

export interface TerminalCreateInput {
  cwd: string;
  cols?: number;
  rows?: number;
  shell?: string;
}

export interface TerminalCreateResult {
  terminalId: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
}

export interface TerminalSummary {
  terminalId: string;
  shell: string;
  cwd: string;
  exitStatus: TerminalExitStatus | null;
}

export interface TerminalAttachResult {
  terminalId: string;
  buffer: string;
  seq: number;
  exitStatus: TerminalExitStatus | null;
}

interface TerminalSession {
  terminalId: string;
  terminal: PtyTerminal;
  proc: PtySubprocess;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  /** Bounded output tail retained for `terminal.attach` replay. */
  scrollbackChunks: Buffer[];
  scrollbackBytes: number;
  /** Per-terminal monotonic counter of published output events. */
  seq: number;
  pendingChunks: Buffer[];
  pendingBytes: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
  exitStatus: TerminalExitStatus | null;
  /** Set when the client explicitly killed the session (dispose on exit). */
  killed: boolean;
}

function resolvePtyTerminalCtor(): PtyTerminalCtor {
  const ctor = (Bun as unknown as { Terminal?: PtyTerminalCtor }).Terminal;
  if (typeof ctor !== "function") {
    throw new Error("Bun.Terminal is unavailable; the terminal requires Bun >= 1.4.0");
  }
  return ctor;
}

function isDirectory(cwd: string): boolean {
  try {
    return statSync(cwd).isDirectory();
  } catch {
    return false;
  }
}

function findExecutableOnPath(executables: string[]): string | null {
  const pathEnv = process.env.PATH ?? "";
  const extensions = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE").split(";") : [""];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const executable of executables) {
      for (const extension of extensions) {
        const candidate = join(dir, executable + extension);
        try {
          if (statSync(candidate).isFile()) {
            return candidate;
          }
        } catch {
          // Not here; keep scanning.
        }
      }
    }
  }
  return null;
}

interface ResolvedShell {
  shell: string;
  args: string[];
}

function resolvePlatformShell(): ResolvedShell {
  if (process.platform === "win32") {
    const pwsh = findExecutableOnPath(["pwsh", "powershell"]);
    if (pwsh) return { shell: pwsh, args: ["-NoLogo"] };
    return { shell: "cmd.exe", args: [] };
  }
  const userShell = process.env.SHELL;
  if (userShell) {
    return { shell: userShell, args: process.platform === "darwin" ? ["-l"] : [] };
  }
  if (process.platform === "darwin") return { shell: "/bin/zsh", args: ["-l"] };
  return { shell: "/bin/bash", args: [] };
}

/**
 * Trim `buffer` to its last `maxBytes` bytes, skipping UTF-8 continuation
 * bytes so the retained tail starts on a character boundary.
 */
function retainTailAtCharBoundary(buffer: Buffer, maxBytes: number): Buffer {
  if (buffer.length <= maxBytes) return buffer;
  let start = buffer.length - maxBytes;
  while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) {
    start += 1;
  }
  return buffer.subarray(start);
}

/**
 * Owns PTY-backed terminal sessions for the integrated terminal.
 *
 * Each session spawns the platform shell through `Bun.spawn` with a
 * `Bun.Terminal` (ConPTY/POSIX PTY), coalesces raw output chunks into
 * `terminal.output` events (base64 bytes + per-terminal monotonic `seq`),
 * and retains a bounded scrollback tail so clients can replay history via
 * `terminal.attach` after a reload.
 */
export class DaemonTerminalRuntime {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly scrollbackLimitBytes: number;

  constructor(
    private readonly eventPublisher: IEventPublisher,
    options?: { scrollbackLimitBytes?: number },
  ) {
    this.scrollbackLimitBytes = options?.scrollbackLimitBytes ?? DEFAULT_SCROLLBACK_LIMIT_BYTES;
  }

  async create(input: TerminalCreateInput): Promise<TerminalCreateResult> {
    const ctor = resolvePtyTerminalCtor();
    const cwd = resolve(input.cwd);
    if (!isDirectory(cwd)) {
      throw new Error(`Terminal cwd is not a directory: ${cwd}`);
    }
    const cols = input.cols ?? 80;
    const rows = input.rows ?? 24;
    const { shell, args } = input.shell ? { shell: input.shell, args: [] as string[] } : resolvePlatformShell();
    const env: Record<string, string | undefined> = { ...process.env };
    if (process.platform !== "win32") {
      env.TERM = env.TERM || "xterm-256color";
    }

    const terminalId = `term_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const session: TerminalSession = {
      terminalId,
      terminal: undefined as unknown as PtyTerminal,
      proc: undefined as unknown as PtySubprocess,
      shell,
      cwd,
      cols,
      rows,
      scrollbackChunks: [],
      scrollbackBytes: 0,
      seq: 0,
      pendingChunks: [],
      pendingBytes: 0,
      flushTimer: null,
      exitStatus: null,
      killed: false,
    };

    const terminal = new ctor({
      cols,
      rows,
      data: (_terminal, data) => this.handleOutput(session, data),
    });
    session.terminal = terminal;

    const proc = Bun.spawn([shell, ...args], {
      terminal,
      cwd,
      env,
    } as unknown as Parameters<typeof Bun.spawn>[1]);
    session.proc = proc as unknown as PtySubprocess;

    void (proc as { exited: Promise<number> }).exited
      .then((exitCode) => this.handleExit(session, exitCode))
      .catch(() => this.handleExit(session, null));

    this.sessions.set(terminalId, session);
    return { terminalId, shell, cwd, cols, rows };
  }

  sendInput(terminalId: string, data: string): void {
    const session = this.getTerminal(terminalId);
    if (session.exitStatus) return; // Exited; drop late input instead of failing the route.
    try {
      session.terminal.write(data);
    } catch (error) {
      throw new Error(`Failed to write to terminal ${terminalId}: ${(error as Error).message}`);
    }
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const session = this.getTerminal(terminalId);
    if (session.exitStatus) return;
    session.cols = cols;
    session.rows = rows;
    try {
      session.terminal.resize(cols, rows);
    } catch {
      // Resize races with process exit; safe to ignore.
    }
  }

  kill(terminalId: string): void {
    const session = this.getTerminal(terminalId);
    if (session.exitStatus) {
      // Already exited: "kill" on a dead tab disposes the session.
      this.disposeSession(session);
      return;
    }
    // Mark as user-initiated so handleExit disposes the session once the
    // process is actually gone — a closed terminal must not linger in the
    // map (holding its scrollback) or reappear via terminal.list after a
    // client reload.
    session.killed = true;
    try {
      killPtyProcess(session.proc);
    } catch (error) {
      console.warn(`[Terminal] Failed to kill terminal ${terminalId}:`, error);
    }
  }

  list(): TerminalSummary[] {
    return Array.from(this.sessions.values()).map((session) => ({
      terminalId: session.terminalId,
      shell: session.shell,
      cwd: session.cwd,
      exitStatus: session.exitStatus,
    }));
  }

  attach(terminalId: string): TerminalAttachResult {
    const session = this.getTerminal(terminalId);
    // Flush pending (coalescing-window) output first so every byte in the
    // replay buffer is covered by a published event with seq <= the returned
    // seq — otherwise the client re-renders those bytes when the flush lands.
    this.flush(session);
    return {
      terminalId: session.terminalId,
      buffer: Buffer.concat(session.scrollbackChunks).toString("base64"),
      seq: session.seq,
      exitStatus: session.exitStatus,
    };
  }

  shutdown(): void {
    for (const session of Array.from(this.sessions.values())) {
      try {
        if (!session.exitStatus) killPtyProcess(session.proc);
      } catch {
        // Already dead.
      }
      this.clearFlushTimer(session);
      try {
        session.terminal.close();
      } catch {
        // Already closed.
      }
    }
    this.sessions.clear();
  }

  private getTerminal(terminalId: string): TerminalSession {
    const session = this.sessions.get(terminalId);
    if (!session) {
      throw new Error(`Unknown terminal: ${terminalId}`);
    }
    return session;
  }

  private handleOutput(session: TerminalSession, data: Uint8Array | string): void {
    const chunk = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    if (chunk.length === 0) return;

    session.scrollbackChunks.push(chunk);
    session.scrollbackBytes += chunk.length;
    if (session.scrollbackBytes > this.scrollbackLimitBytes) {
      const merged = Buffer.concat(session.scrollbackChunks);
      const tail = retainTailAtCharBoundary(merged, this.scrollbackLimitBytes);
      session.scrollbackChunks = [Buffer.from(tail)];
      session.scrollbackBytes = tail.length;
    }

    session.pendingChunks.push(chunk);
    session.pendingBytes += chunk.length;
    if (session.flushTimer === null) {
      const timer = setTimeout(() => {
        session.flushTimer = null;
        this.flush(session);
      }, TERMINAL_FLUSH_MS);
      timer.unref?.();
      session.flushTimer = timer;
    }
  }

  private flush(session: TerminalSession): void {
    if (session.pendingChunks.length === 0) return;
    const merged = session.pendingBytes === 0 ? Buffer.alloc(0) : Buffer.concat(session.pendingChunks);
    session.pendingChunks = [];
    session.pendingBytes = 0;
    session.seq += 1;
    try {
      this.eventPublisher.publish(terminalOutputEvent.name, {
        terminalId: session.terminalId,
        seq: session.seq,
        data: merged.toString("base64"),
      });
    } catch (error) {
      console.warn(`[Terminal] Failed to publish output for ${session.terminalId}:`, error);
    }
  }

  private handleExit(session: TerminalSession, exitCode: number | null): void {
    if (session.exitStatus) return;
    session.exitStatus = {
      exitCode: typeof exitCode === "number" ? exitCode : null,
      signal: null,
    };
    this.clearFlushTimer(session);
    this.flush(session); // Deliver trailing output before the exit event.
    try {
      session.terminal.close();
    } catch {
      // Already closed.
    }
    try {
      this.eventPublisher.publish(terminalExitEvent.name, {
        terminalId: session.terminalId,
        ...session.exitStatus,
      });
    } catch (error) {
      console.warn(`[Terminal] Failed to publish exit for ${session.terminalId}:`, error);
    }
    // A user-killed session is closed for good: release its scrollback and
    // drop it from the map so terminal.list no longer reports it. Sessions
    // that exited on their own are kept (with exit status) until the client
    // closes the tab, so they survive a reload as a restartable entry.
    if (session.killed) {
      this.disposeSession(session);
    }
  }

  private disposeSession(session: TerminalSession): void {
    this.clearFlushTimer(session);
    try {
      session.terminal.close();
    } catch {
      // Already closed.
    }
    this.sessions.delete(session.terminalId);
  }

  private clearFlushTimer(session: TerminalSession): void {
    if (session.flushTimer !== null) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
  }
}
