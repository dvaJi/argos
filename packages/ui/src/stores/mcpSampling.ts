import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createMcpClient } from "#api/McpClient";
import type { McpSamplingDecision, McpSamplingRequestPayload, RENDERER_MODEL_META } from "@argos/shared/presenter";
import { resolveSamplingChatModel, type ChatModelSelection } from "#/lib/chatModelSelection";

interface ApprovedServerInfo {
  providerId: string;
  modelId: string;
  timestamp: number;
}

const SESSION_TIMEOUT = 30 * 60 * 1000;

const mcpClient = createMcpClient();
const eventCleanups: Array<() => void> = [];

export interface McpSamplingDeps {
  modelStore: {
    get initialized(): boolean;
    initialize(): Promise<void>;
    getChatSelectableModelGroups: () => Array<{ providerId: string; models: RENDERER_MODEL_META[] }>;
    findChatSelectableModel(
      providerId: string,
      modelId: string,
    ): { providerId: string; model: RENDERER_MODEL_META } | undefined;
  };
  providerStore: {
    getSortedProviders: () => Array<{ id: string; name: string }>;
  };
  sessionStore: {
    getActiveSession: () => { providerId?: string; modelId?: string } | null;
  };
  draftStore: {
    providerId?: string;
    modelId?: string;
  };
}

let deps: McpSamplingDeps | null = null;

const registerMcpSamplingDeps = (d: McpSamplingDeps) => {
  deps = d;
};

const requireDeps = (): McpSamplingDeps => {
  if (!deps) throw new Error("MCP sampling dependencies not registered");
  return deps;
};

const resolveSamplingDefaultModel = (input: {
  modelGroups: Array<{ providerId: string; models: RENDERER_MODEL_META[] }>;
  requiresVision: boolean;
  activeSelection?: ChatModelSelection | null;
  draftSelection?: ChatModelSelection | null;
}): { providerId: string | null; model: RENDERER_MODEL_META | null } => {
  const resolvedModel = resolveSamplingChatModel({
    modelGroups: input.modelGroups,
    requiresVision: input.requiresVision,
    selections: [input.activeSelection, input.draftSelection],
  });
  return resolvedModel
    ? { providerId: resolvedModel.providerId, model: resolvedModel.model }
    : { providerId: null, model: null };
};

const mcpSamplingStore = new Store({
  request: null as McpSamplingRequestPayload | null,
  isOpen: false,
  isSubmitting: false,
  selectedProviderId: null as string | null,
  selectedModel: null as RENDERER_MODEL_META | null,
  isPreparingModels: false,
  modelPreparationError: null as Error | null,
  approvedServers: new Map<string, ApprovedServerInfo>(),
});

export const getRequiresVision = () => mcpSamplingStore.state.request?.requiresVision ?? false;

export const getSelectedModelSupportsVision = () => mcpSamplingStore.state.selectedModel?.vision ?? false;

const getSelectedProviderLabel = () => {
  const { selectedProviderId } = mcpSamplingStore.state;
  if (!selectedProviderId) return null;
  const d = requireDeps();
  const provider = d.providerStore.getSortedProviders().find((entry) => entry.id === selectedProviderId);
  return provider?.name ?? selectedProviderId;
};

const getIsModelSelectionReady = () => {
  const d = requireDeps();
  return (
    d.modelStore.initialized &&
    !mcpSamplingStore.state.isPreparingModels &&
    !mcpSamplingStore.state.modelPreparationError
  );
};

const ensureModelsReady = async (): Promise<boolean> => {
  const d = requireDeps();
  if (d.modelStore.initialized) {
    mcpSamplingStore.setState((s) => ({
      ...s,
      modelPreparationError: null,
      isPreparingModels: false,
    }));
    return true;
  }

  mcpSamplingStore.setState((s) => ({
    ...s,
    isPreparingModels: true,
    modelPreparationError: null,
  }));

  try {
    await d.modelStore.initialize();
    return true;
  } catch (error) {
    mcpSamplingStore.setState((s) => ({
      ...s,
      modelPreparationError: error instanceof Error ? error : new Error("Failed to initialize enabled models"),
    }));
    return false;
  } finally {
    mcpSamplingStore.setState((s) => ({ ...s, isPreparingModels: false }));
  }
};

const resetSelection = () => {
  const d = requireDeps();
  if (!d.modelStore.initialized) {
    mcpSamplingStore.setState((s) => ({
      ...s,
      selectedProviderId: null,
      selectedModel: null,
    }));
    return;
  }

  const activeSession = d.sessionStore.getActiveSession();
  const activeSelection =
    activeSession?.providerId && activeSession?.modelId
      ? { providerId: activeSession.providerId, modelId: activeSession.modelId }
      : null;
  const draftSelection =
    d.draftStore.providerId && d.draftStore.modelId
      ? { providerId: d.draftStore.providerId, modelId: d.draftStore.modelId }
      : null;

  const selection = resolveSamplingDefaultModel({
    modelGroups: d.modelStore.getChatSelectableModelGroups(),
    requiresVision: getRequiresVision(),
    activeSelection,
    draftSelection,
  });

  mcpSamplingStore.setState((s) => ({
    ...s,
    selectedProviderId: selection.providerId,
    selectedModel: selection.model,
  }));
};

export const getHasEligibleModel = () => {
  const { request } = mcpSamplingStore.state;
  if (!request || !getIsModelSelectionReady()) return false;
  const requiresVisionValue = getRequiresVision();
  const d = requireDeps();
  return d.modelStore
    .getChatSelectableModelGroups()
    .some((entry) => entry.models.some((model) => !requiresVisionValue || model.vision));
};

const getIsActiveSession = () => {
  const { request, approvedServers } = mcpSamplingStore.state;
  if (!request) return false;
  const approvedInfo = approvedServers.get(request.serverName);
  if (!approvedInfo) return false;
  return Date.now() - approvedInfo.timestamp < SESSION_TIMEOUT;
};

const cleanExpiredSessions = () => {
  const { approvedServers } = mcpSamplingStore.state;
  const now = Date.now();
  const next = new Map(approvedServers);
  for (const [serverName, info] of next.entries()) {
    if (now - info.timestamp >= SESSION_TIMEOUT) {
      next.delete(serverName);
    }
  }
  mcpSamplingStore.setState((s) => ({ ...s, approvedServers: next }));
};

const recordServerApproval = (serverName: string, providerId: string, modelId: string) => {
  const { approvedServers } = mcpSamplingStore.state;
  const next = new Map(approvedServers);
  next.set(serverName, { providerId, modelId, timestamp: Date.now() });
  mcpSamplingStore.setState((s) => ({ ...s, approvedServers: next }));
  cleanExpiredSessions();
};

const applySessionSelection = (): boolean => {
  const d = requireDeps();
  const { request, approvedServers } = mcpSamplingStore.state;
  if (!request || !d.modelStore.initialized) return false;

  const sessionInfo = approvedServers.get(request.serverName);
  if (!sessionInfo) return false;

  const match = d.modelStore.findChatSelectableModel(sessionInfo.providerId, sessionInfo.modelId);
  if (!match) {
    const next = new Map(approvedServers);
    next.delete(request.serverName);
    mcpSamplingStore.setState((s) => ({ ...s, approvedServers: next }));
    return false;
  }

  if (getRequiresVision() && !match.model.vision) {
    const next = new Map(approvedServers);
    next.delete(request.serverName);
    mcpSamplingStore.setState((s) => ({ ...s, approvedServers: next }));
    return false;
  }

  mcpSamplingStore.setState((s) => ({
    ...s,
    selectedProviderId: match.providerId,
    selectedModel: match.model,
  }));
  return true;
};

const autoApproveRequest = async (): Promise<boolean> => {
  const { request } = mcpSamplingStore.state;
  if (!request) return false;

  const applied = applySessionSelection();
  if (!applied || !mcpSamplingStore.state.selectedProviderId || !mcpSamplingStore.state.selectedModel) return false;

  recordServerApproval(
    request.serverName,
    mcpSamplingStore.state.selectedProviderId,
    mcpSamplingStore.state.selectedModel.id,
  );

  await submitDecision({
    requestId: request.requestId,
    approved: true,
    providerId: mcpSamplingStore.state.selectedProviderId,
    modelId: mcpSamplingStore.state.selectedModel.id,
  });

  return true;
};

const openRequest = (payload: McpSamplingRequestPayload) => {
  void (async () => {
    cleanExpiredSessions();
    mcpSamplingStore.setState((s) => ({
      ...s,
      request: payload,
      isOpen: true,
      isSubmitting: false,
      selectedProviderId: null,
      selectedModel: null,
    }));

    if (!mcpSamplingStore.state.request || mcpSamplingStore.state.request.requestId !== payload.requestId) return;

    const ready = await ensureModelsReady();
    // A newer request may have replaced this one while models were loading.
    if (!mcpSamplingStore.state.request || mcpSamplingStore.state.request.requestId !== payload.requestId) return;
    if (!ready) return;

    if (getIsActiveSession()) {
      const success = await autoApproveRequest();
      if (!success && mcpSamplingStore.state.request?.requestId === payload.requestId) {
        resetSelection();
      }
      return;
    }

    resetSelection();
  })();
};

export const retryPrepareModels = async () => {
  cleanExpiredSessions();
  const { request } = mcpSamplingStore.state;
  if (!request) return;

  const currentRequestId = request.requestId;
  const ready = await ensureModelsReady();
  if (!mcpSamplingStore.state.request || mcpSamplingStore.state.request.requestId !== currentRequestId || !ready)
    return;

  if (getIsActiveSession()) {
    const success = await autoApproveRequest();
    if (!success && mcpSamplingStore.state.request?.requestId === currentRequestId) {
      resetSelection();
    }
    return;
  }

  resetSelection();
};

const clearRequest = () => {
  mcpSamplingStore.setState((s) => ({
    ...s,
    isOpen: false,
    isSubmitting: false,
    request: null,
    selectedProviderId: null,
    selectedModel: null,
    isPreparingModels: false,
    modelPreparationError: null,
  }));
};

export const selectModel = (model: RENDERER_MODEL_META, providerId: string) => {
  if (!getIsModelSelectionReady() || (getRequiresVision() && !model.vision)) return;
  mcpSamplingStore.setState((s) => ({
    ...s,
    selectedModel: model,
    selectedProviderId: providerId,
  }));
};

const submitDecision = async (decision: McpSamplingDecision) => {
  const { request } = mcpSamplingStore.state;
  if (!request) return;

  const activeRequestId = request.requestId;
  mcpSamplingStore.setState((s) => ({ ...s, isSubmitting: true }));
  try {
    await mcpClient.submitSamplingDecision(decision);
    clearRequest();
  } catch (error) {
    console.error("[MCP Sampling] Failed to submit decision:", error);
    try {
      await mcpClient.cancelSamplingRequest(activeRequestId, "Sampling decision submission failed");
    } catch (cancelError) {
      console.error("[MCP Sampling] Failed to cancel sampling request:", cancelError);
    }
    clearRequest();
  }
};

export const confirmApproval = async () => {
  const { request, selectedProviderId, selectedModel } = mcpSamplingStore.state;
  if (!request || !selectedProviderId || !selectedModel || !getIsModelSelectionReady()) return;

  recordServerApproval(request.serverName, selectedProviderId, selectedModel.id);

  await submitDecision({
    requestId: request.requestId,
    approved: true,
    providerId: selectedProviderId,
    modelId: selectedModel.id,
  });
};

export const rejectRequest = async () => {
  const { request } = mcpSamplingStore.state;
  if (!request) return;

  await submitDecision({
    requestId: request.requestId,
    approved: false,
    reason: "User rejected sampling request",
  });
};

export const dismissRequest = async () => {
  const { request } = mcpSamplingStore.state;
  if (!request) {
    clearRequest();
    return;
  }

  await submitDecision({
    requestId: request.requestId,
    approved: false,
    reason: "User dismissed sampling request",
  });
};

const handleSamplingRequest = (payload: { request: unknown }) => {
  if (!payload?.request) return;
  openRequest(payload.request as McpSamplingRequestPayload);
};

const handleSamplingCancelled = (payload: { requestId: string }) => {
  if (mcpSamplingStore.state.request && payload.requestId === mcpSamplingStore.state.request.requestId) clearRequest();
};

const handleSamplingDecision = (payload: { decision: unknown }) => {
  const decision = payload.decision as McpSamplingDecision | undefined;
  if (mcpSamplingStore.state.request && decision?.requestId === mcpSamplingStore.state.request.requestId)
    clearRequest();
};

const initMcpSampling = () => {
  eventCleanups.push(mcpClient.onSamplingRequest(handleSamplingRequest));
  eventCleanups.push(mcpClient.onSamplingCancelled(handleSamplingCancelled));
  eventCleanups.push(mcpClient.onSamplingDecision(handleSamplingDecision));
};

const cleanupMcpSampling = () => {
  while (eventCleanups.length > 0) {
    eventCleanups.pop()?.();
  }
};

export function useMcpSamplingStore() {
  return useStore(mcpSamplingStore);
}
