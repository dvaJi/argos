import type { eventBus } from "#/eventbus";
import { SendTarget } from "#/eventbus";
import type { IAgentSessionPresenter, IConfigPresenter, ILlmProviderPresenter } from "@argos/shared/presenter";
import { getArgosEventContract, type ArgosEventPayload, type ArgosEventName } from "@argos/shared-contracts/events";
import { ARGOS_EVENT_CHANNEL } from "@argos/shared-contracts/channels";
import type {
  SessionRepository,
  MessageRepository,
  ProviderExecutionPort,
  ProviderCatalogPort,
  SessionPermissionPort,
  WindowEventPort,
  SessionListFilters,
} from "@argos/backend-core";

export function createElectronHotPathPorts(deps: {
  agentSessionPresenter: Pick<
    IAgentSessionPresenter,
    | "createSession"
    | "getSession"
    | "getSessionList"
    | "activateSession"
    | "deactivateSession"
    | "getActiveSession"
    | "getMessages"
    | "listMessagesPage"
    | "getMessage"
    | "sendMessage"
    | "steerActiveTurn"
    | "cancelGeneration"
    | "respondToolInteraction"
  > & {
    clearSessionPermissions: (sessionId: string) => void | Promise<void>;
  };
  configPresenter: Pick<IConfigPresenter, "getProviderModels" | "getCustomModels" | "getAgentType">;
  llmProviderPresenter: Pick<ILlmProviderPresenter, "check">;
  eventBusInstance: typeof eventBus;
}): {
  sessionRepository: SessionRepository;
  messageRepository: MessageRepository;
  providerExecutionPort: ProviderExecutionPort;
  providerCatalogPort: ProviderCatalogPort;
  sessionPermissionPort: SessionPermissionPort;
  windowEventPort: WindowEventPort;
} {
  return {
    sessionRepository: {
      create: async (input, webContentsId) => await deps.agentSessionPresenter.createSession(input, webContentsId),
      get: async (sessionId) => await deps.agentSessionPresenter.getSession(sessionId),
      list: async (filters?: SessionListFilters) => await deps.agentSessionPresenter.getSessionList(filters),
      activate: async (webContentsId, sessionId) =>
        await deps.agentSessionPresenter.activateSession(webContentsId, sessionId),
      deactivate: async (webContentsId) => await deps.agentSessionPresenter.deactivateSession(webContentsId),
      getActive: async (webContentsId) => await deps.agentSessionPresenter.getActiveSession(webContentsId),
    },
    messageRepository: {
      listBySession: async (sessionId) => await deps.agentSessionPresenter.getMessages(sessionId),
      listPageBySession: async (sessionId, options) =>
        await deps.agentSessionPresenter.listMessagesPage(sessionId, options),
      get: async (messageId) => await deps.agentSessionPresenter.getMessage(messageId),
    },
    providerExecutionPort: {
      sendMessage: async (sessionId, content) => await deps.agentSessionPresenter.sendMessage(sessionId, content),
      steerActiveTurn: async (sessionId, content) =>
        await deps.agentSessionPresenter.steerActiveTurn(sessionId, content),
      cancelGeneration: async (sessionId) => await deps.agentSessionPresenter.cancelGeneration(sessionId),
      respondToolInteraction: async (sessionId, messageId, toolCallId, response) =>
        await deps.agentSessionPresenter.respondToolInteraction(sessionId, messageId, toolCallId, response),
      testConnection: async (providerId, modelId) => await deps.llmProviderPresenter.check(providerId, modelId),
    },
    providerCatalogPort: {
      getProviderModels: (providerId) => deps.configPresenter.getProviderModels(providerId) ?? [],
      getCustomModels: (providerId) => deps.configPresenter.getCustomModels(providerId) ?? [],
      getAgentType: async (agentId) => await deps.configPresenter.getAgentType(agentId),
    },
    sessionPermissionPort: {
      clearSessionPermissions: (sessionId) => deps.agentSessionPresenter.clearSessionPermissions(sessionId),
    },
    windowEventPort: {
      publish: <T extends ArgosEventName>(name: T, payload: ArgosEventPayload<T>) => {
        const contract = getArgosEventContract(name);
        const normalizedPayload = contract.payload.parse(payload) as ArgosEventPayload<T>;
        const envelope = { name, payload: normalizedPayload };
        deps.eventBusInstance.sendToRenderer(ARGOS_EVENT_CHANNEL, SendTarget.ALL_WINDOWS, envelope);
      },
    },
  };
}
