import type { IConfigPresenter, LLM_PROVIDER } from "@shared/presenter";
import { methods as acpMethods } from "@agentclientprotocol/sdk";
import type * as schema from "@agentclientprotocol/sdk";
import { AcpProcessManager } from "./process/acpProcessManager";
import { AcpSessionManager } from "./session/acpSessionManager";
import { AcpSessionPersistence } from "./session/acpSessionPersistence";
import { AcpPromptController } from "./session/acpPromptController";
import type { AcpAgentConfig } from "@shared/presenter";
import type { AcpHostPorts } from "./host/ports";

export interface AcpRuntime {
  processManager: AcpProcessManager;
  sessionManager: AcpSessionManager;
  promptController: AcpPromptController;
  sessionPersistence: AcpSessionPersistence;
  /**
   * Run a single ACP prompt turn, yielding raw `session/update` notifications as
   * they arrive. The generator completes when the prompt request resolves.
   * Hosts translate the notifications into their own stream/event format.
   */
  runPromptTurn(args: {
    conversationId: string;
    agent: AcpAgentConfig;
    prompt: schema.ContentBlock[];
    workdir?: string;
  }): AsyncGenerator<schema.SessionNotification, void, unknown>;
}

/** Minimal single-consumer async queue for notification streaming. */
function createAsyncQueue<T>() {
  const items: T[] = [];
  const waiters: Array<() => void> = [];
  return {
    push(item: T) {
      items.push(item);
      waiters.shift()?.();
    },
    drain(): Promise<T | undefined> {
      if (items.length) return Promise.resolve(items.shift());
      return new Promise<T | undefined>((resolve) => {
        waiters.push(() => resolve(items.shift()));
      });
    },
    size() {
      return items.length;
    },
  };
}

/**
 * Compose the host-agnostic ACP runtime. Used by the daemon execution adapter
 * (the desktop instead composes these inside its `AcpClientPresenter` adapter).
 */
export function createAcpRuntime(deps: {
  provider: LLM_PROVIDER;
  configPresenter: IConfigPresenter;
  sessionPersistence: AcpSessionPersistence;
  ports: AcpHostPorts;
}): AcpRuntime {
  const { provider, configPresenter, sessionPersistence, ports } = deps;

  const processManager = new AcpProcessManager({
    providerId: provider.id,
    ports,
    resolveLaunchSpec: (agentId, workdir) => configPresenter.resolveAcpLaunchSpec(agentId, workdir),
    getAgentState: (agentId) => configPresenter.getAcpAgentState(agentId),
    getNpmRegistry: ports.mcp?.getNpmRegistry,
    getUvRegistry: ports.mcp?.getUvRegistry,
  });

  const promptController = new AcpPromptController();

  const sessionManager = new AcpSessionManager({
    providerId: provider.id,
    processManager,
    sessionPersistence,
    configPresenter,
    lifecycle: ports.lifecycle,
  });

  return {
    processManager,
    sessionManager,
    promptController,
    sessionPersistence,

    async *runPromptTurn(args) {
      const session = await sessionManager.getOrCreateSession(
        args.conversationId,
        args.agent,
        {
          onSessionUpdate: () => {},
          onPermission: async () => ({ outcome: { outcome: "cancelled" } }),
        },
        args.workdir,
      );
      const queue = createAsyncQueue<schema.SessionNotification | null>();
      let promptError: Error | null = null;
      const detach = processManager.registerSessionListener(args.agent.id, session.sessionId, (notification) =>
        queue.push(notification),
      );

      const promptPromise = session.connection.agent
        .request(acpMethods.agent.session.prompt, {
          sessionId: session.sessionId,
          prompt: args.prompt,
        })
        .then(() => {
          queue.push(null); // sentinel: turn finished
        })
        .catch((error: unknown) => {
          promptError = error instanceof Error ? error : new Error(String(error));
          queue.push(null);
        });

      try {
        while (true) {
          const item = await queue.drain();
          if (item === null || item === undefined) break;
          yield item;
        }
        await promptPromise;
        if (promptError) throw promptError;
      } finally {
        detach();
      }
    },
  };
}
