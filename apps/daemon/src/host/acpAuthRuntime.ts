import { randomUUID } from "node:crypto";
import { methods as acpMethods } from "@agentclientprotocol/sdk";
import type * as schema from "@agentclientprotocol/sdk";
import type { IEventPublisher } from "@argos/backend-core";
import type { AcpProcessManager } from "@argos/acp-runtime/process/acpProcessManager";
import type { AcpAgentConfig } from "@argos/shared/presenter";

/**
 * Terminal + agent authentication flows for ACP agents, driven from the
 * daemon's real process manager (docs/features/acp-terminal-auth).
 *
 * - agent methods (no `type`): `authenticate` on the warm connection with a
 *   bounded timeout; the handle stays valid for the session retry.
 * - terminal methods (`type: "terminal"`): run the agent's verified launch
 *   command plus the method `args` in a `Bun.Terminal` (argv-style, no
 *   shell), stream output to the renderer, then `release()` the agent's
 *   cached handles so the next attempt re-initializes with fresh credentials.
 *
 * The per-agent reservation is installed synchronously before any await, so
 * concurrent starts cannot double-launch. One active run per agent; PTY
 * output is chunked and capped; cancel kills the PTY and publishes
 * `cancelled`.
 */

const AUTH_TIMEOUT_MS = 30_000;
const OUTPUT_CHUNK_BYTES = 64 * 1024;
const OUTPUT_TOTAL_CAP_BYTES = 256 * 1024;

export interface AcpAuthLaunchSpec {
  command: string;
  args: string[];
  env?: Record<string, string> | null;
}

/** Minimal PTY surface the auth runtime needs (Bun.Terminal-compatible). */
export interface AcpAuthPty {
  write: (data: string | Uint8Array) => void;
  kill?: (signal?: string) => void;
  close?: () => void;
}

export interface AcpAuthRuntimeDeps {
  eventPublisher: IEventPublisher;
  getProcessManager: () => Promise<AcpProcessManager>;
  resolveLaunchSpec: (agentId: string, workdir?: string) => Promise<AcpAuthLaunchSpec>;
  /** PTY constructor (Bun.Terminal-compatible); tests inject a fake. */
  ptyFactory: (options: { cols: number; rows: number; onData: (data: Uint8Array) => void }) => AcpAuthPty;
  /** argv spawn bound to the PTY (Bun.spawn in production). */
  spawnPty: (
    argv: string[],
    options: { cwd: string; env: Record<string, string | undefined>; terminal: AcpAuthPty },
  ) => {
    exited: Promise<number>;
  };
}

type AcpAuthState = "running" | "ready" | "error" | "cancelled";

interface AuthMethodLike {
  id: string;
  name?: string;
  type?: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ActiveRun {
  agentId: string;
  workdir: string | null;
  runId: string | null;
  mode: "agent" | "terminal";
  state: AcpAuthState;
  cancelled?: boolean;
  /** Keystrokes for the terminal TUI go through the PTY object. */
  write?: (data: string | Uint8Array) => void;
  /** SIGKILL on unix: interactive PTY children ignore SIGTERM. */
  kill?: () => void;
  abort?: AbortController;
  abortPromise?: Promise<never>;
  terminal?: AcpAuthPty;
  totalBytes: number;
}

export class DaemonAcpAuthRuntime {
  private readonly activeByAgent = new Map<string, ActiveRun>();
  private readonly runsById = new Map<string, ActiveRun>();

  constructor(private readonly deps: AcpAuthRuntimeDeps) {}

  isActive(agentId: string): boolean {
    return this.activeByAgent.get(agentId)?.state === "running";
  }

  async start(input: { agentId: string; workdir?: string; methodId: string }): Promise<{
    mode: "agent" | "terminal";
    runId: string | null;
  }> {
    // Reserve the agent synchronously before any await: two concurrent starts
    // must not both observe "no active run" and double-launch.
    if (this.isActive(input.agentId)) {
      throw new Error(`An authentication flow is already running for agent ${input.agentId}`);
    }
    const run: ActiveRun = {
      agentId: input.agentId,
      workdir: input.workdir ?? null,
      runId: null,
      mode: "agent",
      state: "running",
      abort: new AbortController(),
      totalBytes: 0,
    };
    // Created with the reservation so cancel() rejects even while earlier
    // awaits (connection warmup) are still settling.
    run.abortPromise = new Promise<never>((_, reject) => {
      run.abort?.signal.addEventListener("abort", () => reject(new Error("Authentication cancelled")), {
        once: true,
      });
    });
    this.activeByAgent.set(input.agentId, run);

    try {
      const processManager = await this.deps.getProcessManager();
      const agent = { id: input.agentId, name: input.agentId } as AcpAgentConfig;
      const handle = await processManager.getConnection(agent, input.workdir);
      const method = (handle.authMethods ?? []).find((entry) => entry.id === input.methodId) as
        | AuthMethodLike
        | undefined;
      if (!method) {
        throw new Error(`Agent ${input.agentId} did not advertise auth method ${input.methodId}`);
      }
      if (method.type === "terminal") {
        return await this.startTerminalFlow(run, input, method);
      }
      return this.startAgentFlow(run, input, method);
    } catch (error) {
      // Setup failures (unreachable agent, unknown method, PTY unavailable)
      // must release the reservation so the agent stays retryable.
      this.activeByAgent.delete(input.agentId);
      this.publish({ run, state: "error", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  write(runId: string, data: string): void {
    const run = this.runsById.get(runId);
    if (!run || run.state !== "running" || !run.write) {
      throw new Error(`No active terminal auth run: ${runId}`);
    }
    run.write(data);
  }

  cancel(input: { agentId: string }): void {
    const run = this.activeByAgent.get(input.agentId);
    if (!run || run.state !== "running") {
      return;
    }
    if (run.mode === "agent") {
      run.abort?.abort();
      return;
    }
    run.cancelled = true;
    run.kill?.();
  }

  private publish(payload: {
    run: ActiveRun;
    state: AcpAuthState;
    output?: string | null;
    exitCode?: number | null;
    error?: string | null;
  }): void {
    this.deps.eventPublisher.publish("providers.acpAuth.changed", {
      agentId: payload.run.agentId,
      workdir: payload.run.workdir,
      runId: payload.run.runId,
      state: payload.state,
      mode: payload.run.mode,
      output: payload.output ?? null,
      exitCode: payload.exitCode ?? null,
      error: payload.error ?? null,
    });
  }

  /**
   * Agent-method authenticate. Runs in the background (like the terminal
   * flow) and reports the outcome via events; the route returns immediately
   * so the UI drives off state transitions instead of the response.
   */
  private startAgentFlow(
    run: ActiveRun,
    input: { agentId: string; workdir?: string; methodId: string },
    method: AuthMethodLike,
  ): {
    mode: "agent";
    runId: null;
  } {
    this.publish({ run, state: "running" });

    void (async () => {
      try {
        const processManager = await this.deps.getProcessManager();
        const handle = await processManager.getConnection(
          { id: input.agentId, name: input.agentId } as AcpAgentConfig,
          input.workdir,
        );
        const authenticate = handle.connection.agent.request(acpMethods.agent.authenticate, {
          methodId: method.id,
        } as schema.AuthenticateRequest);
        const timeout = new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new Error("Authentication timed out")), AUTH_TIMEOUT_MS);
        });
        await Promise.race([authenticate, timeout, run.abortPromise!]);
        run.state = "ready";
        this.publish({ run, state: "ready" });
      } catch (error) {
        const cancelled = run.abort?.signal.aborted === true;
        run.state = cancelled ? "cancelled" : "error";
        this.publish({
          run,
          state: run.state,
          error: cancelled ? "Authentication cancelled" : error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return { mode: "agent", runId: null };
  }

  private async startTerminalFlow(
    run: ActiveRun,
    input: { agentId: string; workdir?: string; methodId: string },
    method: AuthMethodLike,
  ): Promise<{ mode: "terminal"; runId: string | null }> {
    const spec = await this.deps.resolveLaunchSpec(input.agentId, input.workdir);
    const methodArgs = Array.isArray(method.args) ? method.args : [];
    const methodEnv = method.env && typeof method.env === "object" ? method.env : {};
    const argv = [spec.command, ...spec.args, ...methodArgs].filter(
      (part) => typeof part === "string" && part.length > 0,
    );

    run.mode = "terminal";
    run.runId = `acpauth_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    this.runsById.set(run.runId, run);
    this.publish({ run, state: "running" });

    const env = buildAuthEnv(spec.env ?? {}, methodEnv);

    // Construct the PTY first and keep it: keystrokes must go through the
    // terminal object (Bun's terminal-mode subprocess does not expose
    // write), and the terminal must be closed when the run finishes.
    const terminal = this.deps.ptyFactory({
      cols: 80,
      rows: 24,
      onData: (data) => this.handleOutput(run, data),
    });
    run.terminal = terminal;
    run.write = (data) => terminal.write(data);
    run.kill = () => {
      // Interactive PTY children ignore SIGTERM; force-kill like the
      // integrated terminal runtime does.
      terminal.kill?.(process.platform === "win32" ? undefined : "SIGKILL");
    };

    let exitPromise: Promise<number>;
    try {
      const proc = this.deps.spawnPty(argv, {
        cwd: input.workdir || process.cwd(),
        env,
        terminal,
      });
      exitPromise = proc.exited;
    } catch (error) {
      // Spawn/setup failure: release the reservation so the agent stays
      // retryable instead of being stuck in "running" forever.
      this.runsById.delete(run.runId);
      try {
        terminal.close?.();
      } catch {
        // best-effort
      }
      run.state = "error";
      const message = error instanceof Error ? error.message : String(error);
      this.publish({ run, state: "error", error: message });
      throw new Error(`Terminal authentication could not start: ${message}`);
    }

    // Finish in the background — the route returns the runId immediately so
    // the UI can subscribe to output events.
    void exitPromise
      .then(async (exitCode) => {
        await this.finishTerminalRun(run, exitCode);
      })
      .catch(async () => {
        await this.finishTerminalRun(run, null);
      });
    return { mode: "terminal", runId: run.runId };
  }

  private handleOutput(run: ActiveRun, data: Uint8Array): void {
    if (run.state !== "running") return;
    run.totalBytes += data.byteLength;
    // Chunk the full buffer so no output is silently dropped; enforce the
    // total cap by force-killing a runaway process.
    if (run.totalBytes > OUTPUT_TOTAL_CAP_BYTES) {
      this.publish({ run, state: "running", output: "\r\n[output truncated]\r\n" });
      run.kill?.();
      return;
    }
    for (let offset = 0; offset < data.byteLength; offset += OUTPUT_CHUNK_BYTES) {
      const slice = data.subarray(offset, offset + OUTPUT_CHUNK_BYTES);
      this.publish({ run, state: "running", output: new TextDecoder().decode(slice) });
    }
  }

  private async finishTerminalRun(run: ActiveRun, exitCode: number | null): Promise<void> {
    this.runsById.delete(run.runId!);
    try {
      run.terminal?.close?.();
    } catch {
      // best-effort
    }
    const success = exitCode === 0 && !run.cancelled;
    // Drop cached handles so the next session re-initializes with fresh
    // credentials (or a clean failure state).
    try {
      const processManager = await this.deps.getProcessManager();
      await processManager.release(run.agentId);
    } catch {
      // best-effort
    }
    run.state = run.cancelled ? "cancelled" : success ? "ready" : "error";
    this.publish({
      run,
      state: run.state,
      exitCode,
      error: run.state === "error" ? `The agent login process exited with code ${exitCode ?? "unknown"}` : null,
    });
  }
}

function buildAuthEnv(
  specEnv: Record<string, string>,
  methodEnv: Record<string, string>,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, ...specEnv, ...methodEnv };
  if (process.platform !== "win32") {
    env.TERM = "xterm-256color";
  }
  return env;
}
