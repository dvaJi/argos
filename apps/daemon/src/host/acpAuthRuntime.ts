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
 * One active run per agent; PTY output is chunked and capped; cancel kills
 * the PTY and publishes `cancelled`.
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
  kill: (signal?: string) => void;
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
    write: (data: string | Uint8Array) => void;
    kill: (signal?: string) => void;
    exited: Promise<number>;
  };
}

type AcpAuthState = "running" | "ready" | "error" | "cancelled";

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
  write?: (data: string | Uint8Array) => void;
  kill?: (signal?: string) => void;
  abort?: AbortController;
  totalBytes: number;
}

export class DaemonAcpAuthRuntime {
  private readonly activeByAgent = new Map<string, ActiveRun>();
  private readonly runsById = new Map<string, ActiveRun>();

  constructor(private readonly deps: AcpAuthRuntimeDeps) {}

  isActive(agentId: string): boolean {
    return this.activeByAgent.get(agentId)?.state === "running";
  }

  async start(input: {
    agentId: string;
    workdir?: string;
    methodId: string;
  }): Promise<{ mode: "agent" | "terminal"; runId: string | null }> {
    if (this.isActive(input.agentId)) {
      throw new Error(`An authentication flow is already running for agent ${input.agentId}`);
    }

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
      return await this.startTerminalFlow(input, method);
    }
    return await this.startAgentFlow(input, method);
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

  private async startAgentFlow(
    input: { agentId: string; workdir?: string; methodId: string },
    _method: AuthMethodLike,
  ): Promise<{ mode: "agent"; runId: string | null }> {
    const run: ActiveRun = {
      agentId: input.agentId,
      workdir: input.workdir ?? null,
      runId: null,
      mode: "agent",
      state: "running",
      abort: new AbortController(),
      totalBytes: 0,
    };
    this.activeByAgent.set(input.agentId, run);
    this.publish({ run, state: "running" });

    try {
      const processManager = await this.deps.getProcessManager();
      const handle = await processManager.getConnection(
        { id: input.agentId, name: input.agentId } as AcpAgentConfig,
        input.workdir,
      );
      const authenticate = handle.connection.agent.request(acpMethods.agent.authenticate, {
        methodId: input.methodId,
      } as schema.AuthenticateRequest);
      const timeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error("Authentication timed out")), AUTH_TIMEOUT_MS);
        run.abort?.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Authentication cancelled"));
        });
      });
      await Promise.race([authenticate, timeout]);
      run.state = "ready";
      this.publish({ run, state: "ready" });
    } catch (error) {
      const cancelled = run.abort?.signal.aborted === true;
      run.state = cancelled ? "cancelled" : "error";
      this.publish({
        run,
        state: run.state,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { mode: "agent", runId: null };
  }

  private async startTerminalFlow(
    input: { agentId: string; workdir?: string; methodId: string },
    method: AuthMethodLike,
  ): Promise<{ mode: "terminal"; runId: string | null }> {
    const spec = await this.deps.resolveLaunchSpec(input.agentId, input.workdir);
    const methodArgs = Array.isArray(method.args) ? method.args : [];
    const methodEnv = method.env && typeof method.env === "object" ? method.env : {};
    const argv = [spec.command, ...spec.args, ...methodArgs].filter(
      (part) => typeof part === "string" && part.length > 0,
    );

    const run: ActiveRun = {
      agentId: input.agentId,
      workdir: input.workdir ?? null,
      runId: `acpauth_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
      mode: "terminal",
      state: "running",
      totalBytes: 0,
    };
    this.activeByAgent.set(input.agentId, run);
    this.runsById.set(run.runId!, run);
    this.publish({ run, state: "running" });

    const env = buildAuthEnv(spec.env ?? {}, methodEnv);

    const terminal = this.deps.ptyFactory({
      cols: 80,
      rows: 24,
      onData: (data) => this.handleOutput(run, data),
    });
    const proc = this.deps.spawnPty(argv, {
      cwd: input.workdir || process.cwd(),
      env,
      terminal,
    });
    run.write = (data) => proc.write(data);
    run.kill = (signal) => proc.kill(signal);

    void proc.exited
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
    if (run.totalBytes > OUTPUT_TOTAL_CAP_BYTES) {
      this.publish({ run, state: "running", output: "\r\n[output truncated]\r\n" });
      run.kill?.();
      return;
    }
    const chunk = data.byteLength > OUTPUT_CHUNK_BYTES ? data.subarray(0, OUTPUT_CHUNK_BYTES) : data;
    this.publish({ run, state: "running", output: new TextDecoder().decode(chunk) });
  }

  private async finishTerminalRun(run: ActiveRun, exitCode: number | null): Promise<void> {
    this.runsById.delete(run.runId!);
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
