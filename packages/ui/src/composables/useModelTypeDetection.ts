import { useState, useMemo, useEffect, useRef } from "react";

import { useModelConfigStore } from "#/stores/modelConfigStore";

export interface UseModelTypeDetectionOptions {
  modelId: string | undefined;
  providerId: string | undefined;
  modelType: "chat" | "imageGeneration" | "videoGeneration" | "tts" | "embedding" | "rerank" | undefined;
}

export function useModelTypeDetection(options: UseModelTypeDetectionOptions) {
  const { modelId, providerId, modelType } = options;
  const modelConfigStore = useModelConfigStore();

  const [modelReasoning, setModelReasoning] = useState(false);
  const requestIdRef = useRef(0);

  const isImageGenerationModel = useMemo(() => modelType === "imageGeneration", [modelType]);
  const isVideoGenerationModel = useMemo(() => modelType === "videoGeneration", [modelType]);
  const isTtsModel = useMemo(() => modelType === "tts", [modelType]);

  useEffect(() => {
    const currentRequestId = ++requestIdRef.current;
    const currentModelId = modelId;
    const currentProviderId = providerId;

    if (!currentModelId || !currentProviderId) {
      setModelReasoning(false);
      return;
    }

    const fetchModelReasoning = async () => {
      try {
        const modelConfig = await modelConfigStore.getModelConfig(currentModelId, currentProviderId);
        if (currentRequestId !== requestIdRef.current) return;

        setModelReasoning(modelConfig.reasoning || false);
      } catch (error) {
        if (currentRequestId !== requestIdRef.current) return;

        setModelReasoning(false);
        console.error(error);
      }
    };

    void fetchModelReasoning();
  }, [modelId, providerId, modelConfigStore]);

  return {
    isImageGenerationModel,
    isVideoGenerationModel,
    isTtsModel,
    modelReasoning,
  };
}
