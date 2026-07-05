import type { ProviderExecutionPort, IEventPublisher } from "@argos/backend-core";
import type { SendMessageInput, MessageStartResult } from "@shared/types/agent-interface";
import type { ToolInteractionResponse, ToolInteractionResult } from "@argos/backend-core";
import type * as schema from "@agentclientprotocol/sdk";
import { AcpSessionPersistence, createAcpRuntime, type AcpRuntime } from "@argos/acp-runtime";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import type { BunSessionRepository } from "./bun-session-repository";
import { createDaemonAcpPorts } from "./acpPorts";
import { createDaemonAcpSqlitePresenter } from "./daemonAcpSqlite";

const ACP_PROVIDER_ID = "acp";

/**
 * Daemon ACP execution adapter. Spawns and drives ACP agents via the shared
 * `createAcpRuntime`, streaming `session/update` notifications to attached
 * clients through the daemon `BunEventPublisher`.
 *
 * Sessions persist to the daemon's SQLite `acp_sessions` table (resume across
 * daemon restarts). The daemon resolves agent runtimes from `$PATH` (no bundled
 * runtime).
 */
export class AcpProviderExecutionPort implements ProviderExecutionPort {
  private runtimePromise: Promise<AcpRuntime> | null = null;
  private activeTurns = new Map<string, AbortController>();

  constructor(
    private readonly configPresenter: DaemonConfigPresenter,
    private readonly sessionRepository: BunSessionRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly deps: {
      dataDir: string;
      appVersion: string;
      db: {
        prepare(sql: string): {
          get(...p: unknown[]): unknown;
          all(...p: unknown[]): unknown[];
          run(...p: unknown[]): { changes: number };
        };
      };
    },
  ) {}

  private async getRuntime(): Promise<AcpRuntime> {
    if (!this.runtimePromise) {
      this.runtimePromise = (async () => {
        const ports = createDaemonAcpPorts({
          dataDir: this.deps.dataDir,
          appVersion: this.deps.appVersion,
          eventPublisher: this.eventPublisher,
        });
        const sessionPersistence = new AcpSessionPersistence(
          createDaemonAcpSqlitePresenter(this.deps.db),
          () => ports.paths.homeDir(),
          () => ports.paths.homeDir(),
        );
        const acpProvider = (
          this.configPresenter as unknown as { getProviderById(id: string): unknown }
        ).getProviderById(ACP_PROVIDER_ID) as { id: string; name: string } | undefined;
        return createAcpRuntime({
          provider: (acpProvider ?? { id: ACP_PROVIDER_ID, name: "ACP" }) as never,
          configPresenter: this.configPresenter as never,
          sessionPersistence,
          ports,
        });
      })();
    }
    return this.runtimePromise;
  }

  async sendMessage(sessionId: string, content: string | SendMessageInput): Promise<MessageStartResult> {
    const session = await this.sessionRepository.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const agentId = session.modelId || "";
    const agents = (await this.configPresenter.getAcpAgents()) as Array<{ id: string; name: string }>;
    const agent = agents.find((entry) => entry.id === agentId);
    if (!agent) throw new Error(`ACP agent not found for model ${agentId}`);

    const text = typeof content === "string" ? content : content.text || "";
    const prompt: schema.ContentBlock[] = [{ type: "text", text }];

    const runtime = await this.getRuntime();
    const controller = new AbortController();
    this.activeTurns.set(sessionId, controller);

    void this.runTurn(runtime, sessionId, agent, prompt, controller).finally(() => {
      this.activeTurns.delete(sessionId);
    });

    return { accepted: true, requestId: null, messageId: null };
  }

  private async runTurn(
    runtime: AcpRuntime,
    sessionId: string,
    agent: { id: string; name: string },
    prompt: schema.ContentBlock[],
    controller: AbortController,
  ): Promise<void> {
    try {
      for await (const notification of runtime.runPromptTurn({
        conversationId: sessionId,
        agent: agent as never,
        prompt,
      })) {
        if (controller.signal.aborted) break;
        this.eventPublisher.publish("chat.stream", { sessionId, notification });
      }
    } catch (error) {
      this.eventPublisher.publish("chat.error", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.eventPublisher.publish("chat.stream.end", { sessionId });
    }
  }

  async steerActiveTurn(_sessionId: string, _content: string | SendMessageInput): Promise<void> {
    // ACP steering not yet wired in daemon mode.
  }

  async cancelGeneration(sessionId: string): Promise<void> {
    const controller = this.activeTurns.get(sessionId);
    if (controller) controller.abort();
    try {
      const runtime = await this.getRuntime();
      await runtime.sessionManager.clearSession(sessionId);
    } catch {
      // best-effort cleanup
    }
  }

  async respondToolInteraction(
    _sessionId: string,
    _messageId: string,
    _toolCallId: string,
    _response: ToolInteractionResponse,
  ): Promise<ToolInteractionResult> {
    return { handledInline: true };
  }

  async testConnection(providerId: string, modelId?: string): Promise<{ isOk: boolean; errorMsg: string | null }> {
    if (providerId !== ACP_PROVIDER_ID) {
      return { isOk: false, errorMsg: "Not an ACP provider" };
    }
    try {
      const agents = (await this.configPresenter.getAcpAgents()) as Array<{ id: string }>;
      if (modelId && !agents.some((agent) => agent.id === modelId)) {
        return { isOk: false, errorMsg: `ACP agent not found: ${modelId}` };
      }
      return { isOk: true, errorMsg: null };
    } catch (error) {
      return { isOk: false, errorMsg: error instanceof Error ? error.message : String(error) };
    }
  }
}
