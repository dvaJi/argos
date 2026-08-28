import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import type { LLM_PROVIDER, MODEL_META, RENDERER_MODEL_META, ModelConfig } from "@argos/shared/presenter";
import { isChatSelectableModelType, ModelType } from "@argos/shared/model";
import {
  resolveDerivedModelMaxTokens,
  resolveModelContextLength,
  resolveModelFunctionCall,
  resolveModelMaxTokens,
  resolveModelVision,
} from "@argos/shared/modelConfigDefaults";
import { resolveVideoGenerationCompatType } from "@argos/shared/videoGenerationSettings";
import { refreshAgentModels } from "#/stores/agentModelStore";
import { getModelConfig } from "#/stores/modelConfigStore";
import { providerStore, getSortedProviders, ensureInitialized } from "#/stores/providerStore";
import { uiSettingsStore } from "#/stores/uiSettingsStore";
import { createModelClient } from "../../api/ModelClient";

type ChatSelectableModelGroup = {
  providerId: string;
  providerName: string;
  models: RENDERER_MODEL_META[];
};

const resolveRendererModelType = (
  model: Pick<MODEL_META, "id" | "type" | "supportedEndpointTypes" | "endpointType">,
): ModelType => {
  return (resolveVideoGenerationCompatType({
    modelId: model.id,
    type: model.type,
    endpointType: model.endpointType,
    supportedEndpointTypes: model.supportedEndpointTypes,
  }) ??
    model.type ??
    ModelType.Chat) as ModelType;
};

const modelClient = createModelClient();

export const modelStore = new Store({
  enabledModels: [] as { providerId: string; models: RENDERER_MODEL_META[] }[],
  allProviderModels: [] as { providerId: string; models: RENDERER_MODEL_META[] }[],
  customModels: [] as { providerId: string; models: RENDERER_MODEL_META[] }[],
  listenersRegistered: false,
  initialized: false,
  isInitializing: false,
  initializationError: null as Error | null,
  initializationPromise: null as Promise<void> | null,
});

let removeModelListeners: (() => void) | null = null;
const inFlightRefreshes = new Map<string, Promise<boolean>>();
const rerunRequested = new Set<string>();
const pendingRefreshStarts = new Set<string>();
const pendingModelStatusEchoes = new Map<string, boolean>();
const providerModelsReadyAt = new Map<string, number>();

const MODEL_TOGGLE_PERF_LOG_PREFIX = "[ModelTogglePerf]";
const getPerfNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const logModelTogglePerf = (phase: string, details: Record<string, unknown>) => {
  if (!uiSettingsStore.state.traceDebugEnabled) {
    return;
  }

  console.info(`${MODEL_TOGGLE_PERF_LOG_PREFIX} ${phase}`, details);
};

const getModelStatusKey = (providerId: string, modelId: string) => `${providerId}:${modelId}`;

const getProviderState = (providerId: string) => {
  return providerStore.state.providers.find((provider) => provider.id === providerId) ?? null;
};

const markProviderModelsReady = (providerId: string) => {
  providerModelsReadyAt.set(providerId, Date.now());
};

const clearProviderModelsReady = (providerId?: string) => {
  if (providerId) {
    providerModelsReadyAt.delete(providerId);
    return;
  }

  providerModelsReadyAt.clear();
};

const isProviderModelsReady = (providerId: string) => {
  return providerModelsReadyAt.has(providerId);
};

const trackPendingModelStatusEcho = (providerId: string, modelId: string, enabled: boolean) => {
  const statusKey = getModelStatusKey(providerId, modelId);
  pendingModelStatusEchoes.set(statusKey, enabled);
  setTimeout(() => {
    if (pendingModelStatusEchoes.get(statusKey) === enabled) {
      pendingModelStatusEchoes.delete(statusKey);
    }
  }, 1500);
};

const ensureModelRuntime = () => {
  setupModelListeners();
};

const getMaterializedProviderIds = () => {
  return Array.from(
    new Set([
      ...modelStore.state.allProviderModels.map((entry) => entry.providerId),
      ...modelStore.state.customModels.map((entry) => entry.providerId),
      ...modelStore.state.enabledModels.map((entry) => entry.providerId),
    ]),
  ).filter((providerId): providerId is string => Boolean(providerId));
};

const removeProviderGroups = (groups: { providerId: string; models: RENDERER_MODEL_META[] }[], providerId: string) => {
  return groups.filter((group) => group.providerId !== providerId);
};

const purgeRemovedProviderState = (providerId: string) => {
  modelStore.setState((prev) => ({
    ...prev,
    allProviderModels: removeProviderGroups(prev.allProviderModels, providerId),
    customModels: removeProviderGroups(prev.customModels, providerId),
    enabledModels: removeProviderGroups(prev.enabledModels, providerId),
  }));
  pendingRefreshStarts.delete(providerId);
  rerunRequested.delete(providerId);
  clearProviderModelsReady(providerId);

  for (const statusKey of Array.from(pendingModelStatusEchoes.keys())) {
    if (statusKey.startsWith(`${providerId}:`)) {
      pendingModelStatusEchoes.delete(statusKey);
    }
  }
};

const resolveExplicitFunctionCall = (...values: Array<boolean | undefined | null>): boolean | undefined => {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
};

const stripDerivedRendererModelFields = <T extends Partial<RENDERER_MODEL_META>>(model: T) => {
  const { explicitFunctionCall: _explicitFunctionCall, ...persistedModel } = model;
  return persistedModel as Omit<T, "explicitFunctionCall">;
};

const normalizeRendererModel = (model: MODEL_META, providerId: string): RENDERER_MODEL_META => ({
  id: model.id,
  name: model.name || model.id,
  contextLength: resolveModelContextLength(model.contextLength),
  maxTokens: resolveModelMaxTokens(model.maxTokens),
  group: model.group || "default",
  providerId,
  enabled: (model as RENDERER_MODEL_META).enabled ?? false,
  isCustom: model.isCustom ?? false,
  vision: resolveModelVision(model.vision),
  functionCall: resolveModelFunctionCall(model.functionCall),
  explicitFunctionCall: resolveExplicitFunctionCall(
    model.functionCall,
    (model as RENDERER_MODEL_META).explicitFunctionCall,
  ),
  reasoning: model.reasoning ?? false,
  enableSearch: (model as RENDERER_MODEL_META).enableSearch ?? false,
  type: resolveRendererModelType(model),
  supportedEndpointTypes: model.supportedEndpointTypes,
  endpointType: model.endpointType,
  ownedBy: model.ownedBy,
});

const normalizeDerivedRendererModel = (model: MODEL_META, providerId: string): RENDERER_MODEL_META => ({
  id: model.id,
  name: model.name || model.id,
  contextLength: resolveModelContextLength(model.contextLength),
  maxTokens: resolveDerivedModelMaxTokens(model.maxTokens),
  group: model.group || "default",
  providerId,
  enabled: (model as RENDERER_MODEL_META).enabled ?? false,
  isCustom: model.isCustom ?? false,
  vision: resolveModelVision(model.vision),
  functionCall: resolveModelFunctionCall(model.functionCall),
  explicitFunctionCall: resolveExplicitFunctionCall(
    model.functionCall,
    (model as RENDERER_MODEL_META).explicitFunctionCall,
  ),
  reasoning: model.reasoning ?? false,
  enableSearch: (model as RENDERER_MODEL_META).enableSearch ?? false,
  type: resolveRendererModelType(model),
  supportedEndpointTypes: model.supportedEndpointTypes,
  endpointType: model.endpointType,
  ownedBy: model.ownedBy,
});

const applyUserDefinedModelConfig = async (
  model: RENDERER_MODEL_META,
  providerId: string,
): Promise<RENDERER_MODEL_META> => {
  const normalized: RENDERER_MODEL_META = {
    ...model,
    vision: resolveModelVision(model.vision),
    functionCall: resolveModelFunctionCall(model.functionCall),
    reasoning: model.reasoning ?? false,
    enableSearch: model.enableSearch ?? false,
    type: model.type ?? ModelType.Chat,
  };

  try {
    const config: ModelConfig | null = await getModelConfig(model.id, providerId);
    if (config?.isUserDefined) {
      const resolvedMaxTokens = config.maxTokens ?? config.maxCompletionTokens ?? normalized.maxTokens;
      return {
        ...normalized,
        contextLength: resolveModelContextLength(config.contextLength ?? normalized.contextLength),
        maxTokens: resolvedMaxTokens,
        vision: resolveModelVision(config.vision ?? normalized.vision),
        functionCall: resolveModelFunctionCall(config.functionCall ?? normalized.functionCall),
        explicitFunctionCall: resolveExplicitFunctionCall(config.functionCall, normalized.explicitFunctionCall),
        reasoning: model.isCustom ? (config.reasoning ?? normalized.reasoning ?? false) : normalized.reasoning,
        type: config.type ?? normalized.type ?? ModelType.Chat,
        endpointType: config.endpointType ?? normalized.endpointType,
        ownedBy: config.ownedBy ?? normalized.ownedBy,
      };
    }
  } catch (error) {
    console.error(`Failed to read model configuration: ${providerId}/${model.id}`, error);
  }

  return normalized;
};

const updateCustomModelState = (providerId: string, models: RENDERER_MODEL_META[]) => {
  modelStore.setState((prev) => {
    const customIndex = prev.customModels.findIndex((item) => item.providerId === providerId);
    if (customIndex !== -1) {
      const next = [...prev.customModels];
      next[customIndex] = { ...next[customIndex], models };
      return { ...prev, customModels: next };
    }
    return { ...prev, customModels: [...prev.customModels, { providerId, models }] };
  });
};

const updateAllProviderState = (providerId: string, models: RENDERER_MODEL_META[]) => {
  modelStore.setState((prev) => {
    const idx = prev.allProviderModels.findIndex((item) => item.providerId === providerId);
    if (idx !== -1) {
      const next = [...prev.allProviderModels];
      next[idx] = { ...next[idx], models };
      return { ...prev, allProviderModels: next };
    }
    return { ...prev, allProviderModels: [...prev.allProviderModels, { providerId, models }] };
  });
};

const updateEnabledState = (providerId: string, models: RENDERER_MODEL_META[]) => {
  const providerState = getProviderState(providerId);
  const enabledModelsList = providerState?.enable ? models.filter((model) => model.enabled) : [];
  modelStore.setState((prev) => {
    const idx = prev.enabledModels.findIndex((item) => item.providerId === providerId);
    let next = [...prev.enabledModels];
    if (idx !== -1) {
      if (enabledModelsList.length > 0) {
        next[idx] = { ...next[idx], models: enabledModelsList };
      } else {
        next = next.filter((_, i) => i !== idx);
      }
    } else if (enabledModelsList.length > 0) {
      next.push({ providerId, models: enabledModelsList });
    }
    return { ...prev, enabledModels: next };
  });
};

const pruneModelState = (providerIds: Set<string>, enabledProviderIds: Set<string>) => {
  modelStore.setState((prev) => ({
    ...prev,
    enabledModels: prev.enabledModels.filter((group) => enabledProviderIds.has(group.providerId)),
    allProviderModels: prev.allProviderModels.filter((group) => providerIds.has(group.providerId)),
    customModels: prev.customModels.filter((group) => providerIds.has(group.providerId)),
  }));
};

const updateEnabledStateFromLocalProvider = (providerId: string) => {
  const materializedProviderModels =
    modelStore.state.allProviderModels.find((item) => item.providerId === providerId)?.models ?? [];
  const materializedCustomModels =
    modelStore.state.customModels.find((item) => item.providerId === providerId)?.models ?? [];

  if (materializedCustomModels.length === 0) {
    updateEnabledState(providerId, materializedProviderModels);
    return;
  }

  const mergedModels = new Map<string, RENDERER_MODEL_META>();

  for (const model of materializedProviderModels) {
    mergedModels.set(model.id, model);
  }

  for (const model of materializedCustomModels) {
    mergedModels.set(model.id, model);
  }

  updateEnabledState(providerId, Array.from(mergedModels.values()));
};

const updateLocalBatchModelStatus = (
  providerId: string,
  updates: { modelId: string; enabled: boolean }[],
): Map<string, boolean | null> => {
  const previousStates = new Map<string, boolean | null>();

  if (updates.length === 0) {
    return previousStates;
  }

  const s = modelStore.state;
  const providerEntry = s.allProviderModels.find((item) => item.providerId === providerId);
  const customEntry = s.customModels.find((item) => item.providerId === providerId);
  const enabledEntry = s.enabledModels.find((item) => item.providerId === providerId);
  const providerModelById = providerEntry ? new Map(providerEntry.models.map((model) => [model.id, model])) : null;
  const customModelById = customEntry ? new Map(customEntry.models.map((model) => [model.id, model])) : null;
  const enabledModelIds = enabledEntry ? new Set(enabledEntry.models.map((model) => model.id)) : null;

  const nextEnabledByModelId = new Map<string, boolean>();
  for (const update of updates) {
    const providerModel = providerModelById?.get(update.modelId);
    const customModel = customModelById?.get(update.modelId);
    previousStates.set(
      update.modelId,
      providerModel
        ? !!providerModel.enabled
        : customModel
          ? !!customModel.enabled
          : (enabledModelIds?.has(update.modelId) ?? null),
    );
    nextEnabledByModelId.set(update.modelId, update.enabled);
  }

  modelStore.setState((prev) => {
    const nextAllProvider = providerEntry
      ? prev.allProviderModels.map((g) => {
          if (g.providerId !== providerId) return g;
          return {
            ...g,
            models: g.models.map((m) => {
              const nextEnabled = nextEnabledByModelId.get(m.id);
              return nextEnabled !== undefined ? { ...m, enabled: nextEnabled } : m;
            }),
          };
        })
      : prev.allProviderModels;

    const nextCustom = customEntry
      ? prev.customModels.map((g) => {
          if (g.providerId !== providerId) return g;
          return {
            ...g,
            models: g.models.map((m) => {
              const nextEnabled = nextEnabledByModelId.get(m.id);
              return nextEnabled !== undefined ? { ...m, enabled: nextEnabled } : m;
            }),
          };
        })
      : prev.customModels;

    return { ...prev, allProviderModels: nextAllProvider, customModels: nextCustom };
  });

  updateEnabledStateFromLocalProvider(providerId);

  return previousStates;
};

const rollbackLocalBatchModelStatus = (providerId: string, previousStates: Map<string, boolean | null>) => {
  const rollbackUpdates: { modelId: string; enabled: boolean }[] = [];
  for (const [modelId, enabled] of previousStates) {
    if (enabled !== null) {
      rollbackUpdates.push({ modelId, enabled });
    }
  }

  if (rollbackUpdates.length > 0) {
    updateLocalBatchModelStatus(providerId, rollbackUpdates);
  }
};

const trackPendingBatchModelStatusEchoes = (providerId: string, updates: { modelId: string; enabled: boolean }[]) => {
  const trackedEchoes: { statusKey: string; enabled: boolean }[] = [];
  for (const update of updates) {
    const statusKey = getModelStatusKey(providerId, update.modelId);
    pendingModelStatusEchoes.set(statusKey, update.enabled);
    trackedEchoes.push({ statusKey, enabled: update.enabled });
  }

  setTimeout(() => {
    for (const echo of trackedEchoes) {
      if (pendingModelStatusEchoes.get(echo.statusKey) === echo.enabled) {
        pendingModelStatusEchoes.delete(echo.statusKey);
      }
    }
  }, 1500);
};

const clearPendingBatchModelStatusEchoes = (providerId: string, updates: { modelId: string; enabled: boolean }[]) => {
  for (const update of updates) {
    const statusKey = getModelStatusKey(providerId, update.modelId);
    if (pendingModelStatusEchoes.get(statusKey) === update.enabled) {
      pendingModelStatusEchoes.delete(statusKey);
    }
  }
};

const refreshCustomModels = async (providerId: string): Promise<boolean> => {
  try {
    const customModelsList = (await modelClient.getCustomModels(providerId)) ?? [];
    const existingCustom = modelStore.state.customModels.find((item) => item.providerId === providerId)?.models ?? [];

    if (customModelsList.length === 0 && existingCustom.length === 0) {
      return true;
    }

    const modelIds = customModelsList.map((model) => model.id);
    const modelStatusMap = await modelClient.getBatchModelStatus(providerId, modelIds);

    const customModelsWithStatus = await Promise.all(
      customModelsList.map(async (model) => {
        const base: RENDERER_MODEL_META = {
          ...normalizeRendererModel(model, providerId),
          enabled: modelStatusMap[model.id] ?? true,
          isCustom: true,
        };
        return applyUserDefinedModelConfig(base, providerId);
      }),
    );

    updateCustomModelState(providerId, customModelsWithStatus);

    const existingStandard =
      modelStore.state.allProviderModels
        .find((item) => item.providerId === providerId)
        ?.models.filter((model) => !model.isCustom) || [];
    updateAllProviderState(providerId, [...existingStandard, ...customModelsWithStatus]);
    updateEnabledState(providerId, [...existingStandard, ...customModelsWithStatus]);
    markProviderModelsReady(providerId);
    return true;
  } catch (error) {
    console.error(`Failed to refresh custom models: ${providerId}`, error);
    return false;
  }
};

const refreshStandardModels = async (providerId: string): Promise<boolean> => {
  try {
    const providerState = getProviderState(providerId);
    const useProviderDbModels = providerState?.apiType !== "ollama";
    let models: RENDERER_MODEL_META[] = useProviderDbModels ? await modelClient.getDbProviderModels(providerId) : [];

    let storedModels = (await modelClient.getProviderModels(providerId)) ?? [];

    if (storedModels.length === 0) {
      const fallbackProviderModels = (await modelClient.getProviderModels(providerId)) ?? [];
      if (fallbackProviderModels.length > 0) {
        storedModels = fallbackProviderModels;
      }
    }

    if (storedModels.length > 0) {
      const dbModelMap = new Map(models.map((model) => [model.id, model]));
      const storedModelMap = new Map<string, RENDERER_MODEL_META>();

      const normalizeStoredModel = (model: MODEL_META, fallback?: RENDERER_MODEL_META): RENDERER_MODEL_META => {
        return {
          id: model.id,
          name: model.name || fallback?.name || model.id,
          group: model.group || fallback?.group || "default",
          providerId,
          enabled: false,
          isCustom: model.isCustom ?? fallback?.isCustom ?? false,
          contextLength: resolveModelContextLength(model.contextLength ?? fallback?.contextLength),
          maxTokens: resolveDerivedModelMaxTokens(model.maxTokens ?? fallback?.maxTokens),
          vision: resolveModelVision(model.vision ?? fallback?.vision),
          functionCall: resolveModelFunctionCall(model.functionCall ?? fallback?.functionCall),
          explicitFunctionCall: resolveExplicitFunctionCall(model.functionCall, fallback?.explicitFunctionCall),
          reasoning: fallback !== undefined ? (fallback.reasoning ?? false) : (model.reasoning ?? false),
          enableSearch:
            (model as RENDERER_MODEL_META).enableSearch ??
            (fallback as RENDERER_MODEL_META | undefined)?.enableSearch ??
            false,
          type: resolveRendererModelType({
            id: model.id,
            type: model.type ?? fallback?.type,
            supportedEndpointTypes: model.supportedEndpointTypes ?? fallback?.supportedEndpointTypes,
            endpointType: model.endpointType ?? fallback?.endpointType,
          }),
          supportedEndpointTypes: model.supportedEndpointTypes ?? fallback?.supportedEndpointTypes,
          endpointType: model.endpointType ?? fallback?.endpointType,
          ownedBy: model.ownedBy ?? fallback?.ownedBy,
        };
      };

      for (const storedModel of storedModels) {
        const normalized = normalizeStoredModel(storedModel, dbModelMap.get(storedModel.id));
        storedModelMap.set(storedModel.id, normalized);
      }

      const mergedModels: RENDERER_MODEL_META[] = [];

      if (models.length === 0) {
        for (const model of storedModelMap.values()) {
          mergedModels.push(normalizeDerivedRendererModel(model, providerId));
        }
      } else {
        for (const model of models) {
          const override = storedModelMap.get(model.id);
          if (override) {
            storedModelMap.delete(model.id);
            mergedModels.push(normalizeDerivedRendererModel({ ...model, ...override, providerId }, providerId));
          } else {
            mergedModels.push(normalizeDerivedRendererModel({ ...model, providerId }, providerId));
          }
        }

        for (const model of storedModelMap.values()) {
          mergedModels.push(normalizeDerivedRendererModel(model, providerId));
        }
      }

      models = mergedModels;
    }

    if (!models || models.length === 0) {
      try {
        const modelMetas = await modelClient.getModelList(providerId);
        if (modelMetas) {
          models = modelMetas.map((meta) => ({
            id: meta.id,
            name: meta.name,
            contextLength: meta.contextLength || 4096,
            maxTokens: meta.maxTokens || 2048,
            provider: providerId,
            group: meta.group || "default",
            enabled: false,
            isCustom: meta.isCustom || false,
            providerId,
            vision: meta.vision || false,
            functionCall: meta.functionCall || false,
            reasoning: meta.reasoning || false,
            type: (meta.type || ModelType.Chat) as ModelType,
            supportedEndpointTypes: meta.supportedEndpointTypes,
            endpointType: meta.endpointType,
            ownedBy: meta.ownedBy,
          }));
        }
      } catch (error) {
        console.error(`Failed to fetch models for provider ${providerId}:`, error);
        models = [];
      }
    }

    const modelIds = models.map((model) => model.id);
    const modelStatusMap = await modelClient.getBatchModelStatus(providerId, modelIds);

    const modelsWithStatus = await Promise.all(
      models.map(async (model) => {
        const base: RENDERER_MODEL_META = {
          ...normalizeDerivedRendererModel(model, providerId),
          enabled: modelStatusMap[model.id] ?? true,
          isCustom: model.isCustom || false,
        };
        return applyUserDefinedModelConfig(base, providerId);
      }),
    );

    const existingCustom = modelStore.state.customModels.find((item) => item.providerId === providerId)?.models || [];
    updateAllProviderState(providerId, [...modelsWithStatus, ...existingCustom]);
    updateEnabledState(providerId, [...modelsWithStatus, ...existingCustom]);
    markProviderModelsReady(providerId);
    return true;
  } catch (error) {
    console.error(`Failed to refresh standard models: ${providerId}`, error);
    return false;
  }
};

const refreshProviderModelsNow = async (providerId: string): Promise<boolean> => {
  if (providerId === "acp") {
    try {
      const { rendererModels } = await refreshAgentModels(providerId);
      updateAllProviderState(providerId, rendererModels);
      updateEnabledState(providerId, rendererModels);
      markProviderModelsReady(providerId);
      return true;
    } catch (error) {
      console.error(`[ModelStore] Failed to refresh agent models for ${providerId}:`, error);
      clearProviderModelsReady(providerId);
      return false;
    }
  }

  const [standardRefreshed, customRefreshed] = await Promise.all([
    refreshStandardModels(providerId),
    refreshCustomModels(providerId),
  ]);

  if (!standardRefreshed || !customRefreshed) {
    clearProviderModelsReady(providerId);
  }

  return standardRefreshed && customRefreshed;
};

export const refreshProviderModels = (providerId: string): Promise<boolean> => {
  ensureModelRuntime();

  const existingRefresh = inFlightRefreshes.get(providerId);
  if (existingRefresh) {
    if (!pendingRefreshStarts.has(providerId)) {
      rerunRequested.add(providerId);
    }
    return existingRefresh;
  }

  pendingRefreshStarts.add(providerId);
  let refreshPromise: Promise<boolean> | null = null;
  refreshPromise = (async () => {
    let lastRefreshSucceeded = true;
    try {
      await Promise.resolve();
      pendingRefreshStarts.delete(providerId);

      do {
        rerunRequested.delete(providerId);
        lastRefreshSucceeded = await refreshProviderModelsNow(providerId);
      } while (rerunRequested.has(providerId));

      return lastRefreshSucceeded;
    } finally {
      pendingRefreshStarts.delete(providerId);
      rerunRequested.delete(providerId);
      if (refreshPromise && inFlightRefreshes.get(providerId) === refreshPromise) {
        inFlightRefreshes.delete(providerId);
      }
    }
  })();

  inFlightRefreshes.set(providerId, refreshPromise);
  return refreshPromise;
};

const _refreshAllModelsInternal = async (): Promise<boolean> => {
  await ensureInitialized();
  const providers = providerStore.state.providers;
  const activeProviders = providers.filter((p) => p.enable);
  let allProvidersRefreshed = true;
  for (const provider of activeProviders) {
    const refreshed = await refreshProviderModels(provider.id);
    allProvidersRefreshed = allProvidersRefreshed && refreshed;
  }

  return allProvidersRefreshed;
};

let lastRefreshAllTime = 0;
let refreshAllTimer: ReturnType<typeof setTimeout> | null = null;

const refreshAllModels = async (): Promise<boolean> => {
  const now = Date.now();
  if (now - lastRefreshAllTime >= 1000) {
    lastRefreshAllTime = now;
    return _refreshAllModelsInternal();
  }
  if (!refreshAllTimer) {
    refreshAllTimer = setTimeout(
      () => {
        refreshAllTimer = null;
        lastRefreshAllTime = Date.now();
        void _refreshAllModelsInternal();
      },
      1000 - (now - lastRefreshAllTime),
    );
  }
  return true;
};

const getActiveEnabledModels = () => {
  const activeProviderIds = new Set(providerStore.state.providers.filter((p) => p.enable).map((p) => p.id));
  return modelStore.state.enabledModels.filter((group) => activeProviderIds.has(group.providerId));
};

export const getChatSelectableModelGroups = (): ChatSelectableModelGroup[] => {
  const sorted = getSortedProviders();
  const orderedProviders = sorted.length > 0 ? sorted : providerStore.state.providers;
  return getChatSelectableModelGroupsFrom(orderedProviders, modelStore.state.enabledModels);
};

/**
 * Pure grouping over explicit state pieces so callers can subscribe to the exact
 * values they render (React Compiler requires dependency lists of plain values).
 */
export const getChatSelectableModelGroupsFrom = (
  orderedProviders: LLM_PROVIDER[],
  enabledModels: { providerId: string; models: RENDERER_MODEL_META[] }[],
): ChatSelectableModelGroup[] => {
  const modelsByProviderId = new Map(
    enabledModels
      .filter((group) => group.providerId !== "acp")
      .map(
        (group) => [group.providerId, group.models.filter((model) => isChatSelectableModelType(model.type))] as const,
      )
      .filter(([, models]) => models.length > 0),
  );

  const result: ChatSelectableModelGroup[] = [];

  for (const provider of orderedProviders) {
    if (!provider.enable || provider.id === "acp") {
      continue;
    }

    const models = modelsByProviderId.get(provider.id);
    if (!models || models.length === 0) {
      continue;
    }

    result.push({
      providerId: provider.id,
      providerName: provider.name,
      models,
    });
  }

  return result;
};

export const findChatSelectableModel = (providerId: string, modelId: string) => {
  const groups = getChatSelectableModelGroups();
  const group = groups.find((entry) => entry.providerId === providerId);
  const model = group?.models.find((entry) => entry.id === modelId);
  if (!group || !model) {
    return null;
  }

  return {
    providerId: group.providerId,
    providerName: group.providerName,
    model,
  };
};

const pickFirstChatSelectableModel = () => {
  const groups = getChatSelectableModelGroups();
  const firstGroup = groups[0];
  const firstModel = firstGroup?.models[0];
  if (!firstGroup || !firstModel) {
    return null;
  }

  return {
    providerId: firstGroup.providerId,
    providerName: firstGroup.providerName,
    model: firstModel,
  };
};

const searchModels = (query: string) => {
  const normalized = query.toLowerCase();
  return getActiveEnabledModels()
    .map((group) => ({
      providerId: group.providerId,
      models: group.models.filter(
        (model) => model.id.toLowerCase().includes(normalized) || model.name.toLowerCase().includes(normalized),
      ),
    }))
    .filter((group) => group.models.length > 0);
};

const updateLocalModelStatus = (providerId: string, modelId: string, enabled: boolean) => {
  modelStore.setState((prev) => {
    const providerEntry = prev.allProviderModels.find((p) => p.providerId === providerId);
    const customEntry = prev.customModels.find((p) => p.providerId === providerId);

    const nextAllProvider = providerEntry
      ? prev.allProviderModels.map((g) => {
          if (g.providerId !== providerId) return g;
          return {
            ...g,
            models: g.models.map((m) => (m.id === modelId ? { ...m, enabled } : m)),
          };
        })
      : prev.allProviderModels;

    const nextCustom = customEntry
      ? prev.customModels.map((g) => {
          if (g.providerId !== providerId) return g;
          return {
            ...g,
            models: g.models.map((m) => (m.id === modelId ? { ...m, enabled } : m)),
          };
        })
      : prev.customModels;

    if (!getProviderState(providerId)?.enable) {
      return {
        ...prev,
        allProviderModels: nextAllProvider,
        customModels: nextCustom,
        enabledModels: prev.enabledModels.filter((entry) => entry.providerId !== providerId),
      };
    }

    const updatedProviderModel = nextAllProvider
      .find((p) => p.providerId === providerId)
      ?.models.find((m) => m.id === modelId);
    const updatedCustomModel = nextCustom
      .find((p) => p.providerId === providerId)
      ?.models.find((m) => m.id === modelId);

    let nextEnabledModels = [...prev.enabledModels];
    let enabledProvider = nextEnabledModels.find((p) => p.providerId === providerId);

    if (!enabledProvider && enabled) {
      enabledProvider = { providerId, models: [] };
      nextEnabledModels = [...nextEnabledModels, enabledProvider];
    }

    if (enabledProvider) {
      const currentModels = enabledProvider.models;
      const modelIndex = currentModels.findIndex((m) => m.id === modelId);
      const sourceModel = updatedProviderModel ?? updatedCustomModel ?? currentModels[modelIndex];

      let nextProviderModels: RENDERER_MODEL_META[];
      if (enabled) {
        if (sourceModel) {
          const normalizedModel: RENDERER_MODEL_META = {
            ...sourceModel,
            enabled: true,
            vision: resolveModelVision(sourceModel.vision),
            functionCall: resolveModelFunctionCall(sourceModel.functionCall),
            reasoning: sourceModel.reasoning ?? false,
            type: sourceModel.type ?? ModelType.Chat,
          };
          if (modelIndex === -1) {
            nextProviderModels = [...currentModels, normalizedModel];
          } else {
            nextProviderModels = currentModels.map((m, i) => (i === modelIndex ? normalizedModel : m));
          }
        } else {
          nextProviderModels = currentModels;
        }
      } else {
        nextProviderModels = currentModels.filter((_, i) => i !== modelIndex);
      }

      if (!enabled && nextProviderModels.length === 0) {
        nextEnabledModels = nextEnabledModels.filter((p) => p.providerId !== providerId);
      } else {
        nextEnabledModels = nextEnabledModels.map((p) =>
          p.providerId === providerId ? { ...p, models: nextProviderModels } : p,
        );
      }
    }

    return {
      ...prev,
      allProviderModels: nextAllProvider,
      customModels: nextCustom,
      enabledModels: nextEnabledModels,
    };
  });
};

const getLocalModelEnabledState = (providerId: string, modelId: string): boolean | null => {
  const provider = modelStore.state.allProviderModels.find((p) => p.providerId === providerId);
  const providerModel = provider?.models.find((m) => m.id === modelId);
  if (providerModel) {
    return !!providerModel.enabled;
  }

  const customProvider = modelStore.state.customModels.find((p) => p.providerId === providerId);
  const customModel = customProvider?.models.find((m) => m.id === modelId);
  if (customModel) {
    return !!customModel.enabled;
  }

  const enabledProvider = modelStore.state.enabledModels.find((p) => p.providerId === providerId);
  if (enabledProvider) {
    return enabledProvider.models.some((model) => model.id === modelId);
  }

  return null;
};

const updateModelStatus = async (providerId: string, modelId: string, enabled: boolean) => {
  const actionStart = getPerfNow();
  const previousState = getLocalModelEnabledState(providerId, modelId);
  const localUpdateStart = getPerfNow();
  updateLocalModelStatus(providerId, modelId, enabled);
  trackPendingModelStatusEcho(providerId, modelId, enabled);
  logModelTogglePerf("store.local-update", {
    providerId,
    modelId,
    enabled,
    previousState,
    elapsedMs: Math.round(getPerfNow() - localUpdateStart),
  });

  try {
    const ipcStart = getPerfNow();
    await modelClient.updateModelStatus(providerId, modelId, enabled);
    logModelTogglePerf("store.ipc-complete", {
      providerId,
      modelId,
      enabled,
      elapsedMs: Math.round(getPerfNow() - ipcStart),
      totalMs: Math.round(getPerfNow() - actionStart),
    });
  } catch (error) {
    console.error("Failed to update model status:", error);
    const statusKey = getModelStatusKey(providerId, modelId);
    if (pendingModelStatusEchoes.get(statusKey) === enabled) {
      pendingModelStatusEchoes.delete(statusKey);
    }
    if (previousState !== null && previousState !== enabled) {
      updateLocalModelStatus(providerId, modelId, previousState);
    }
    logModelTogglePerf("store.rollback", {
      providerId,
      modelId,
      enabled,
      previousState,
      totalMs: Math.round(getPerfNow() - actionStart),
    });
  }
};

const addCustomModel = async (
  providerId: string,
  model: Omit<RENDERER_MODEL_META, "providerId" | "isCustom" | "group">,
) => {
  try {
    const newModel = await modelClient.addCustomModel(providerId, stripDerivedRendererModelFields(model));
    await refreshCustomModels(providerId);
    return newModel;
  } catch (error) {
    console.error("Failed to add custom model:", error);
    throw error;
  }
};

const removeCustomModel = async (providerId: string, modelId: string) => {
  try {
    const success = await modelClient.removeCustomModel(providerId, modelId);
    if (success) {
      await refreshCustomModels(providerId);
    }
    return success;
  } catch (error) {
    console.error("Failed to remove custom model:", error);
    throw error;
  }
};

const updateCustomModel = async (
  providerId: string,
  modelId: string,
  updates: Partial<RENDERER_MODEL_META> & { enabled?: boolean },
) => {
  try {
    const success = await modelClient.updateCustomModel(providerId, modelId, stripDerivedRendererModelFields(updates));
    if (success) {
      await refreshCustomModels(providerId);
    }
    return success;
  } catch (error) {
    console.error("Failed to update custom model:", error);
    throw error;
  }
};

const enableAllModels = async (providerId: string, models: RENDERER_MODEL_META[] = []): Promise<void> => {
  const actionStart = getPerfNow();
  let previousStates: Map<string, boolean | null> | null = null;
  let updates: { modelId: string; enabled: boolean }[] = [];
  try {
    const providerModelsData =
      models.length > 0
        ? { providerId, models }
        : modelStore.state.allProviderModels.find((p) => p.providerId === providerId);

    if (!providerModelsData || providerModelsData.models.length === 0) {
      console.warn(`No models found for provider ${providerId}`);
      return;
    }

    const targetModels = providerModelsData.models.filter((model) => !model.enabled);
    if (targetModels.length === 0) {
      return;
    }

    updates = targetModels.map((model) => ({ modelId: model.id, enabled: true }));
    previousStates = updateLocalBatchModelStatus(providerId, updates);
    trackPendingBatchModelStatusEchoes(providerId, updates);
    await modelClient.setBatchModelStatus(providerId, updates);
    logModelTogglePerf("store.batch-enable-complete", {
      providerId,
      modelCount: updates.length,
      totalMs: Math.round(getPerfNow() - actionStart),
    });
  } catch (error) {
    console.error(`Failed to enable all models for provider ${providerId}:`, error);
    clearPendingBatchModelStatusEchoes(providerId, updates);
    if (previousStates) {
      rollbackLocalBatchModelStatus(providerId, previousStates);
    }
    throw error;
  }
};

const disableAllModels = async (providerId: string, models: RENDERER_MODEL_META[] = []): Promise<void> => {
  const actionStart = getPerfNow();
  let previousStates: Map<string, boolean | null> | null = null;
  let updates: { modelId: string; enabled: boolean }[] = [];
  try {
    const providerModelsData =
      models.length > 0
        ? { providerId, models }
        : modelStore.state.allProviderModels.find((p) => p.providerId === providerId);

    if (!providerModelsData || providerModelsData.models.length === 0) {
      console.warn(`No models found for provider ${providerId}`);
      return;
    }

    const targetModels = providerModelsData.models.filter((model) => model.enabled);
    if (targetModels.length === 0) {
      return;
    }

    updates = targetModels.map((model) => ({ modelId: model.id, enabled: false }));
    previousStates = updateLocalBatchModelStatus(providerId, updates);
    trackPendingBatchModelStatusEchoes(providerId, updates);
    await modelClient.setBatchModelStatus(providerId, updates);
    logModelTogglePerf("store.batch-disable-complete", {
      providerId,
      modelCount: updates.length,
      totalMs: Math.round(getPerfNow() - actionStart),
    });
  } catch (error) {
    console.error(`Failed to disable all models for provider ${providerId}:`, error);
    clearPendingBatchModelStatusEchoes(providerId, updates);
    if (previousStates) {
      rollbackLocalBatchModelStatus(providerId, previousStates);
    }
    throw error;
  }
};

const findModelByIdOrName = (modelId: string): { model: RENDERER_MODEL_META; providerId: string } | null => {
  for (const providerModels of modelStore.state.enabledModels) {
    const model = providerModels.models.find((m) => m.id === modelId);
    if (model) {
      return { model, providerId: providerModels.providerId };
    }
  }

  const enabledModel = modelStore.state.enabledModels
    .flatMap((provider) => provider.models.map((m) => ({ ...m, providerId: provider.providerId })))
    .find((m) => m.id === modelId);
  if (enabledModel) {
    return { model: enabledModel, providerId: enabledModel.providerId! };
  }

  for (const providerModels of modelStore.state.enabledModels) {
    for (const model of providerModels.models) {
      if (
        model.id.toLowerCase().includes(modelId.toLowerCase()) ||
        model.name.toLowerCase().includes(modelId.toLowerCase())
      ) {
        return { model, providerId: providerModels.providerId };
      }
    }
  }

  return null;
};

let prevProviderIds: string[] = [];
let prevProviderStates: Array<{ id: string; enable: boolean }> = [];

function syncWithProviderChanges(): void {
  const providers = providerStore.state.providers;
  const currentIds = providers.map((p) => p.id);
  const currentStates = providers.map((p) => ({ id: p.id, enable: p.enable }));

  const idsKey = currentIds.join(",");
  const prevIdsKey = prevProviderIds.join(",");
  if (idsKey !== prevIdsKey) {
    const providerIdSet = new Set(currentIds);
    for (const materializedProviderId of getMaterializedProviderIds()) {
      if (!providerIdSet.has(materializedProviderId)) {
        purgeRemovedProviderState(materializedProviderId);
      }
    }
    prevProviderIds = currentIds;
  }

  const statesKey = currentStates.map((s) => `${s.id}:${s.enable}`).join(",");
  const prevStatesKey = prevProviderStates.map((s) => `${s.id}:${s.enable}`).join(",");
  if (statesKey !== prevStatesKey) {
    const providerIds = new Set(currentStates.map((p) => p.id));
    const enabledProviderIds = new Set(currentStates.filter((p) => p.enable).map((p) => p.id));
    const previousEnabledProviderIds = new Set(prevProviderStates.filter((p) => p.enable).map((p) => p.id));

    pruneModelState(providerIds, enabledProviderIds);

    for (const provider of prevProviderStates) {
      if (provider.enable && !enabledProviderIds.has(provider.id)) {
        clearProviderModelsReady(provider.id);
      }
    }

    for (const providerId of providerIds) {
      if (enabledProviderIds.has(providerId) && !previousEnabledProviderIds.has(providerId)) {
        updateEnabledStateFromLocalProvider(providerId);
        if (modelStore.state.initialized) {
          void refreshProviderModels(providerId);
        }
      }
    }

    prevProviderStates = currentStates;
  }
}

syncWithProviderChanges();
providerStore.subscribe(() => {
  syncWithProviderChanges();
});

const setupModelListeners = () => {
  if (modelStore.state.listenersRegistered) return;
  modelStore.setState((prev) => ({ ...prev, listenersRegistered: true }));

  const unsubscribeModelListChanged = modelClient.onModelsChanged(async ({ providerId, reason }) => {
    if (providerId) {
      await refreshProviderModels(providerId);
      return;
    }

    if (reason === "provider-db-loaded" || reason === "provider-db-updated") {
      await refreshMaterializedProviders();
      return;
    }

    if (modelStore.state.initialized) {
      await refreshAllModels();
    }
  });

  const unsubscribeModelStatusChanged = modelClient.onModelStatusChanged(
    async (msg: { providerId: string; modelId: string; enabled: boolean }) => {
      const statusKey = getModelStatusKey(msg.providerId, msg.modelId);
      const pendingEnabled = pendingModelStatusEchoes.get(statusKey);
      if (pendingEnabled !== undefined) {
        pendingModelStatusEchoes.delete(statusKey);
        if (pendingEnabled === msg.enabled) {
          return;
        }
      }

      updateLocalModelStatus(msg.providerId, msg.modelId, msg.enabled);
    },
  );

  const unsubscribeModelBatchStatusChanged = modelClient.onModelBatchStatusChanged(
    async (msg: { providerId: string; updates: { modelId: string; enabled: boolean }[] }) => {
      for (const update of msg.updates) {
        const statusKey = getModelStatusKey(msg.providerId, update.modelId);
        const pendingEnabled = pendingModelStatusEchoes.get(statusKey);
        if (pendingEnabled !== undefined) {
          pendingModelStatusEchoes.delete(statusKey);
          if (pendingEnabled === update.enabled) {
            continue;
          }
        }
        updateLocalModelStatus(msg.providerId, update.modelId, update.enabled);
      }
    },
  );

  removeModelListeners = () => {
    unsubscribeModelListChanged();
    unsubscribeModelStatusChanged();
    unsubscribeModelBatchStatusChanged();
  };
};

const refreshMaterializedProviders = async () => {
  const providerIds = getMaterializedProviderIds();
  for (const providerId of providerIds) {
    await refreshProviderModels(providerId);
  }
};

const cleanup = () => {
  removeModelListeners?.();
  removeModelListeners = null;
  modelStore.setState((prev) => ({
    ...prev,
    listenersRegistered: false,
    initialized: false,
    isInitializing: false,
    initializationError: null,
    initializationPromise: null,
  }));
  inFlightRefreshes.clear();
  rerunRequested.clear();
  pendingRefreshStarts.clear();
  pendingModelStatusEchoes.clear();
  clearProviderModelsReady();
};

export const initialize = async () => {
  if (modelStore.state.initialized) {
    return;
  }

  if (modelStore.state.initializationPromise) {
    await modelStore.state.initializationPromise;
    return;
  }

  modelStore.setState((prev) => ({
    ...prev,
    initializationError: null,
    isInitializing: true,
  }));

  const promise = (async () => {
    ensureModelRuntime();
    const refreshed = await _refreshAllModelsInternal();
    if (!refreshed) {
      console.warn("[ModelStore] Some enabled providers failed to refresh during initialization");
    }
    modelStore.setState((prev) => ({ ...prev, initialized: true }));
  })();
  modelStore.setState((prev) => ({ ...prev, initializationPromise: promise }));

  try {
    await promise;
  } catch (error) {
    modelStore.setState((prev) => ({
      ...prev,
      initialized: false,
      initializationError: error instanceof Error ? error : new Error("Failed to initialize enabled models"),
    }));
    throw error;
  } finally {
    modelStore.setState((prev) => ({
      ...prev,
      isInitializing: false,
      ...(prev.initialized ? {} : { initializationPromise: null }),
    }));
  }
};

const ensureProviderModelsReady = async (providerId: string) => {
  ensureModelRuntime();
  if (isProviderModelsReady(providerId)) {
    return;
  }

  await refreshProviderModels(providerId);
};

async function addCustomModelMutation(
  providerId: string,
  model: Omit<RENDERER_MODEL_META, "providerId" | "isCustom" | "group">,
) {
  const result = await modelClient.addCustomModel(providerId, stripDerivedRendererModelFields(model));
  await refreshCustomModels(providerId);
  return result;
}

async function removeCustomModelMutation(providerId: string, modelId: string) {
  const result = await modelClient.removeCustomModel(providerId, modelId);
  if (result) {
    await refreshCustomModels(providerId);
  }
  return result;
}

async function updateCustomModelMutation(
  providerId: string,
  modelId: string,
  updates: Partial<RENDERER_MODEL_META> & { enabled?: boolean },
) {
  const result = await modelClient.updateCustomModel(providerId, modelId, stripDerivedRendererModelFields(updates));
  if (result) {
    await refreshCustomModels(providerId);
  }
  return result;
}

export function useModelStore() {
  const state = useStore(modelStore);
  return {
    ...state,
    refreshProviderModels,
    refreshAllModels,
    getActiveEnabledModels,
    getChatSelectableModelGroups,
    updateLocalModelStatus,
    getLocalModelEnabledState,
    updateModelStatus,
    addCustomModel,
    removeCustomModel,
    updateCustomModel,
    enableAllModels,
    disableAllModels,
    findModelByIdOrName,
    cleanup,
    initialize,
    addCustomModelMutation,
    removeCustomModelMutation,
    updateCustomModelMutation,
  };
}
