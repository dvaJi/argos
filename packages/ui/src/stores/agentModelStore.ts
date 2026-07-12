import { Store } from "@tanstack/store";
import type { AgentProcessHandle, AgentSessionState, MODEL_META, RENDERER_MODEL_META } from "@argos/shared/presenter";
import { ModelType } from "@argos/shared/model";
import { createConfigClient } from "../../api/ConfigClient";

export interface AgentModelRefreshResult {
  rendererModels: RENDERER_MODEL_META[];
  modelMetas: MODEL_META[];
}

interface AgentModelState {
  agentModels: Record<string, RENDERER_MODEL_META[]>;
  sessionStatus: Record<string, AgentSessionState>;
  processStatus: Record<string, AgentProcessHandle>;
}

const PROCESS_KEY_SEPARATOR = ":";

const buildProcessKey = (providerId: string, agentId: string) => `${providerId}${PROCESS_KEY_SEPARATOR}${agentId}`;

const configClient = createConfigClient();

export const agentModelStore = new Store<AgentModelState>({
  agentModels: {},
  sessionStatus: {},
  processStatus: {},
});

export const refreshAgentModels = async (providerId: string): Promise<AgentModelRefreshResult> => {
  if (providerId !== "acp") {
    agentModelStore.setState((prev) => ({
      ...prev,
      agentModels: { ...prev.agentModels, [providerId]: [] },
    }));
    return { rendererModels: [], modelMetas: [] };
  }

  const acpEnabled = await configClient.getAcpEnabled();
  if (!acpEnabled) {
    agentModelStore.setState((prev) => ({
      ...prev,
      agentModels: { ...prev.agentModels, [providerId]: [] },
    }));
    return { rendererModels: [], modelMetas: [] };
  }

  const agents = await configClient.getAcpAgents();
  const rendererModels: RENDERER_MODEL_META[] = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    group: "ACP",
    providerId,
    enabled: true,
    isCustom: true,
    contextLength: 8192,
    maxTokens: 4096,
    description: agent.description,
    vision: false,
    functionCall: true,
    explicitFunctionCall: true,
    reasoning: false,
    enableSearch: false,
    type: ModelType.Chat,
  }));

  agentModelStore.setState((prev) => ({
    ...prev,
    agentModels: { ...prev.agentModels, [providerId]: rendererModels },
  }));

  const modelMetas: MODEL_META[] = rendererModels.map((model) => ({
    id: model.id,
    name: model.name,
    group: model.group,
    providerId: model.providerId,
    isCustom: true,
    contextLength: model.contextLength,
    maxTokens: model.maxTokens,
    description: model.description,
    functionCall: model.functionCall,
    reasoning: model.reasoning,
    enableSearch: model.enableSearch,
    type: model.type,
  }));

  return { rendererModels, modelMetas };
};

export const getSessionStatus = (conversationId: string): AgentSessionState | null =>
  agentModelStore.state.sessionStatus[conversationId] ?? null;

export const upsertSessionStatus = (session: AgentSessionState) => {
  agentModelStore.setState((prev) => ({
    ...prev,
    sessionStatus: { ...prev.sessionStatus, [session.conversationId]: session },
  }));
};

export const removeSessionStatus = (conversationId: string) => {
  if (!agentModelStore.state.sessionStatus[conversationId]) return;
  agentModelStore.setState((prev) => {
    const next = { ...prev.sessionStatus };
    delete next[conversationId];
    return { ...prev, sessionStatus: next };
  });
};

export const clearSessions = (providerId?: string) => {
  if (!providerId) {
    agentModelStore.setState((prev) => ({ ...prev, sessionStatus: {} }));
    return;
  }
  agentModelStore.setState((prev) => ({
    ...prev,
    sessionStatus: Object.fromEntries(
      Object.entries(prev.sessionStatus).filter(([, state]) => state.providerId !== providerId),
    ),
  }));
};

export const getProcessStatus = (providerId: string, agentId: string): AgentProcessHandle | null =>
  agentModelStore.state.processStatus[buildProcessKey(providerId, agentId)] ?? null;

export const upsertProcessStatus = (handle: AgentProcessHandle) => {
  agentModelStore.setState((prev) => ({
    ...prev,
    processStatus: {
      ...prev.processStatus,
      [buildProcessKey(handle.providerId, handle.agentId)]: handle,
    },
  }));
};

export const clearProcesses = (providerId?: string) => {
  if (!providerId) {
    agentModelStore.setState((prev) => ({ ...prev, processStatus: {} }));
    return;
  }
  agentModelStore.setState((prev) => ({
    ...prev,
    processStatus: Object.fromEntries(
      Object.entries(prev.processStatus).filter(([key]) => !key.startsWith(`${providerId}${PROCESS_KEY_SEPARATOR}`)),
    ),
  }));
};

export const clearAll = () => {
  agentModelStore.setState((prev) => ({ ...prev, agentModels: {}, sessionStatus: {}, processStatus: {} }));
};
