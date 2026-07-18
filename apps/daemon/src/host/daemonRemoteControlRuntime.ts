import { RemoteControlRuntime } from "@argos/remote-control-runtime";
import type {
  AgentSessionPort,
  GenerationPort,
  RemoteConfigPort,
  RemoteModelGroupInfo,
} from "@argos/remote-control-runtime";
import type { CreateSessionInput, SendMessageInput, SessionWithState } from "@argos/shared/types/agent-interface";
import type { SearchResult } from "@argos/shared/types/core/search";

type ProviderExecutionWithGeneration = {
  sendMessage(sessionId: string, content: string | SendMessageInput): Promise<unknown>;
  getActiveGeneration(sessionId: string): { eventId: string; runId: string } | null;
  cancelGeneration(sessionId: string): Promise<void>;
  respondToolInteraction(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    response: unknown,
  ): Promise<{ waitingForUserMessage?: boolean }>;
};

type SessionRepositoryLike = {
  create(input: CreateSessionInput, webContentsId: number): Promise<SessionWithState>;
  get(sessionId: string): Promise<SessionWithState | null>;
  list(filters?: { agentId?: string; includeSubagents?: boolean }): Promise<SessionWithState[]>;
  rename(sessionId: string, title: string): Promise<void>;
  listMessages(sessionId: string): Promise<import("@argos/shared/types/agent-interface").ChatMessageRecord[]>;
  getMessage(messageId: string): Promise<import("@argos/shared/types/agent-interface").ChatMessageRecord | null>;
  setProviderModel(sessionId: string, providerId: string, modelId: string): Promise<void>;
  getSearchResults(messageId: string, searchId?: string): Promise<SearchResult[]>;
};

/**
 * Daemon owner for every remote-control channel runtime.
 *
 * Electron only proxies the `remote.*` routes. Long-lived adapters, bindings,
 * sessions, and bot-to-agent turns all live in this process.
 */
export class DaemonRemoteControlRuntime {
  readonly runtime: RemoteControlRuntime;

  constructor(
    private readonly deps: {
      configPresenter: RemoteConfigPresenterLike;
      sessionRepository: SessionRepositoryLike;
      providerExecutionPort: ProviderExecutionWithGeneration;
      dataDir: string;
    },
  ) {
    this.runtime = new RemoteControlRuntime({
      configPort: adaptConfigPort(deps.configPresenter),
      dataDir: deps.dataDir,
      sessionPort: adaptSessionPort(deps),
      generationPort: adaptGenerationPort(deps.providerExecutionPort),
    });
  }

  async initialize(): Promise<void> {
    await this.runtime.initialize();
  }

  async destroy(): Promise<void> {
    await this.runtime.destroy();
  }
}

export interface RemoteConfigPresenterLike {
  getSetting<T>(key: string): T | null | undefined;
  setSetting(key: string, value: unknown): void;
  getDefaultProjectPath(): string | null;
  getDefaultModel(): { providerId: string; modelId: string } | undefined;
  getProviders(): Array<{
    id: string;
    name: string;
    enable?: boolean;
    models?: Array<{ id: string; name?: string }>;
    customModels?: Array<{ id: string; name?: string }>;
  }>;
  getModelStatusMap(providerId?: string): Record<string, boolean>;
  listAgents(): Promise<Array<{ id: string; name: string; type?: string; agentType?: string; enabled?: boolean }>>;
  resolveArgosAgentConfig(agentId: string): Promise<{
    defaultModelPreset?: { providerId?: string; modelId?: string };
  }>;
}

function adaptConfigPort(config: RemoteConfigPresenterLike): RemoteConfigPort {
  return {
    getSetting: <T>(key: string) => config.getSetting<T>(key),
    setSetting: (key: string, value: unknown) => config.setSetting(key, value),
    getDefaultProjectPath: () => config.getDefaultProjectPath(),
    listAgents: async () =>
      (await config.listAgents()).map((agent) => ({
        ...agent,
        type: agent.type === "acp" || agent.agentType === "acp" ? ("acp" as const) : ("argos" as const),
      })),
    getAgentType: async (agentId: string) => {
      const agent = (await config.listAgents()).find((candidate) => candidate.id === agentId);
      return agent?.type === "acp" || agent?.agentType === "acp" ? "acp" : "argos";
    },
    getEnabledProviders: () =>
      config
        .getProviders()
        .filter((provider) => provider.enable !== false)
        .map(({ id, name }) => ({ id, name })),
    getAllEnabledModels: async (): Promise<RemoteModelGroupInfo[]> =>
      config
        .getProviders()
        .filter((provider) => provider.enable !== false)
        .map((provider) => {
          const status = config.getModelStatusMap(provider.id);
          const models = [...(provider.models ?? []), ...(provider.customModels ?? [])]
            .filter((model, index, all) => all.findIndex((candidate) => candidate.id === model.id) === index)
            .filter((model) => status[model.id] !== false);
          return { providerId: provider.id, models };
        }),
  };
}

function adaptSessionPort(deps: {
  configPresenter: RemoteConfigPresenterLike;
  sessionRepository: SessionRepositoryLike;
  providerExecutionPort: ProviderExecutionWithGeneration;
}): AgentSessionPort {
  const { configPresenter, sessionRepository, providerExecutionPort } = deps;
  return {
    async createDetachedSession(input) {
      let providerId = input.providerId;
      let modelId = input.modelId;
      if (!providerId || !modelId) {
        const agentConfig = await configPresenter.resolveArgosAgentConfig(input.agentId ?? "argos");
        const fallback = configPresenter.getDefaultModel();
        providerId = providerId ?? agentConfig.defaultModelPreset?.providerId ?? fallback?.providerId;
        modelId = modelId ?? agentConfig.defaultModelPreset?.modelId ?? fallback?.modelId;
      }

      const session = await sessionRepository.create(
        {
          agentId: input.agentId ?? "argos",
          message: "",
          projectDir: input.projectDir,
          providerId,
          modelId,
          subagentEnabled: false,
        },
        0,
      );
      if (input.title?.trim()) {
        await sessionRepository.rename(session.id, input.title.trim());
        return (await sessionRepository.get(session.id)) ?? session;
      }
      return session;
    },
    getSession: (sessionId) => sessionRepository.get(sessionId),
    getSessionList: ({ agentId }) => sessionRepository.list({ agentId, includeSubagents: false }),
    getMessages: (sessionId) => sessionRepository.listMessages(sessionId),
    getMessage: (messageId) => sessionRepository.getMessage(messageId),
    async sendMessage(sessionId, content) {
      await providerExecutionPort.sendMessage(sessionId, content);
    },
    async setSessionModel(sessionId, providerId, modelId) {
      await sessionRepository.setProviderModel(sessionId, providerId, modelId);
      const session = await sessionRepository.get(sessionId);
      if (!session) throw new Error(`Session not found after model update: ${sessionId}`);
      return session;
    },
    async respondToolInteraction(sessionId, messageId, toolCallId, response) {
      const result = await providerExecutionPort.respondToolInteraction(sessionId, messageId, toolCallId, response);
      return { waitingForUserMessage: result.waitingForUserMessage === true };
    },
    getSearchResults: (messageId, searchId) => sessionRepository.getSearchResults(messageId, searchId),
  };
}

function adaptGenerationPort(providerExecutionPort: ProviderExecutionWithGeneration): GenerationPort {
  return {
    getActiveGeneration: (sessionId) => providerExecutionPort.getActiveGeneration(sessionId),
    cancelGenerationByEventId(sessionId, eventId) {
      const active = providerExecutionPort.getActiveGeneration(sessionId);
      if (!active || active.eventId !== eventId) return false;
      void providerExecutionPort.cancelGeneration(sessionId);
      return true;
    },
  };
}
