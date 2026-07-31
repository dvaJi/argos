import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import type { ModelConfig, IModelConfig } from "@argos/shared/presenter";
import { createModelClient } from "../../api/ModelClient";

interface ModelConfigState {
  cache: Record<string, ModelConfig>;
}

const modelClient = createModelClient();

const modelConfigStore = new Store<ModelConfigState>({
  cache: {},
});

const getCacheKey = (modelId: string, providerId?: string) => `${providerId ?? "default"}:${modelId}`;

export const getModelConfig = async (modelId: string, providerId?: string): Promise<ModelConfig> => {
  const key = getCacheKey(modelId, providerId);
  if (modelConfigStore.state.cache[key]) {
    return modelConfigStore.state.cache[key];
  }
  const config = await modelClient.getModelConfig(modelId, providerId);
  modelConfigStore.setState((prev) => ({
    ...prev,
    cache: { ...prev.cache, [key]: config },
  }));
  return config;
};

export const setModelConfig = async (modelId: string, providerId: string, config: ModelConfig) => {
  await modelClient.setModelConfig(modelId, providerId, config);
  modelConfigStore.setState((prev) => ({
    ...prev,
    cache: { ...prev.cache, [getCacheKey(modelId, providerId)]: config },
  }));
};

const resetModelConfig = async (modelId: string, providerId: string) => {
  await modelClient.resetModelConfig(modelId, providerId);
  modelConfigStore.setState((prev) => {
    const next = { ...prev.cache };
    delete next[getCacheKey(modelId, providerId)];
    return { ...prev, cache: next };
  });
};

const getProviderModelConfigs = async (providerId: string) => {
  return await modelClient.getProviderModelConfigs(providerId);
};

const hasUserModelConfig = async (modelId: string, providerId: string) => {
  return await modelClient.hasUserModelConfig(modelId, providerId);
};

const importConfigs = async (configs: Record<string, IModelConfig>, overwrite = false) => {
  await modelClient.importModelConfigs(configs, overwrite);
};

const exportConfigs = async () => {
  return await modelClient.exportModelConfigs();
};

export function useModelConfigStore() {
  const state = useStore(modelConfigStore);
  return {
    ...state,
    getModelConfig,
    setModelConfig,
    resetModelConfig,
    getProviderModelConfigs,
    hasUserModelConfig,
    importConfigs,
    exportConfigs,
  };
}
