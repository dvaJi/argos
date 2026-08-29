import { useState, useEffect, useRef } from "react";
import type { ProviderClient } from "#api/ProviderClient";
import type { SessionClient } from "#api/SessionClient";
import type { AcpConfigOption, AcpConfigState } from "@argos/shared/presenter";
const ACP_INLINE_OPTION_LIMIT = 3;
type UseChatStatusBarAcpConfigOptions = {
  isAcpAgent: boolean;
  activeAcpAgentId: string | null;
  activeAcpSessionId: string | null;
  acpWorkspacePath: string | null;
  selectedAgentId: string | null | undefined;
  selectedAgentName: string | null | undefined;
  providerClient: ProviderClient;
  sessionClient: SessionClient;
  resolveModelName: (providerId?: string | null, modelId?: string | null) => string;
  resolveModelIconId: (providerId?: string | null, modelId?: string | null) => string;
};
const isAcpConfigOptionValue = (value: unknown): value is NonNullable<AcpConfigOption["options"]>[number] => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.value === "string" && typeof candidate.label === "string";
};
const isAcpConfigOption = (value: unknown): value is AcpConfigOption => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.label !== "string" ||
    (candidate.type !== "select" && candidate.type !== "boolean")
  ) {
    return false;
  }
  if (!("currentValue" in candidate)) {
    return false;
  }
  if (candidate.type === "select" && candidate.options !== undefined) {
    return Array.isArray(candidate.options) && candidate.options.every(isAcpConfigOptionValue);
  }
  return true;
};
const isAcpConfigState = (value: unknown): value is AcpConfigState => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.source === "configOptions" || candidate.source === "legacy") &&
    Array.isArray(candidate.options) &&
    candidate.options.every(isAcpConfigOption)
  );
};
const hasAcpConfigState = (state: AcpConfigState | null | undefined): state is AcpConfigState =>
  Array.isArray(state?.options);
const getAcpOptionCurrentLabel = (option?: AcpConfigOption | null): string | null => {
  if (!option || option.type !== "select") {
    return null;
  }
  const currentValue = typeof option.currentValue === "string" ? option.currentValue : "";
  return option.options?.find((entry) => entry.value === currentValue)?.label ?? currentValue;
};
export function useChatStatusBarAcpConfig(options: UseChatStatusBarAcpConfigOptions) {
  const [acpConfigState, setAcpConfigState] = useState<AcpConfigState | null>(null);
  const [acpConfigLoadedRequestKey, setAcpConfigLoadedRequestKey] = useState<string | null>(null);
  const [acpConfigLoadingRequestKey, setAcpConfigLoadingRequestKey] = useState<string | null>(null);
  const [acpInlineOpenOptionId, setAcpInlineOpenOptionId] = useState<string | null>(null);
  const [acpOptionSavingIds, setAcpOptionSavingIds] = useState<string[]>([]);
  const [acpConfigError, setAcpConfigError] = useState<string | null>(null);
  const [isAcpSessionConfigLoading, setIsAcpSessionConfigLoading] = useState(false);
  const acpConfigCacheByKeyRef = useRef(new Map<string, AcpConfigState>());
  const acpConfigSyncTokenRef = useRef(0);
  const getAcpProcessCacheKey = (agentId?: string | null, workdir?: string | null): string | null => {
    if (!agentId) {
      return null;
    }
    const normalizedWorkdir = workdir?.trim();
    return normalizedWorkdir ? `process:${agentId}::${normalizedWorkdir}` : `agent:${agentId}`;
  };
  const acpConfigCacheKey = (() => {
    if (!options.isAcpAgent || options.activeAcpSessionId) {
      return null;
    }
    return getAcpProcessCacheKey(options.activeAcpAgentId, options.acpWorkspacePath);
  })();
  const acpConfigRequestKey = (() => {
    if (!options.isAcpAgent) {
      return null;
    }
    if (options.activeAcpSessionId) {
      return `session:${options.activeAcpSessionId}`;
    }
    return acpConfigCacheKey;
  })();
  const getCachedAcpConfigState = (cacheKey?: string | null): AcpConfigState | null => {
    if (!cacheKey) {
      return null;
    }
    return acpConfigCacheByKeyRef.current.get(cacheKey) ?? null;
  };
  const setCachedAcpConfigState = (
    cacheKey: string | null | undefined,
    state: AcpConfigState | null | undefined,
  ): void => {
    if (!cacheKey || !hasAcpConfigState(state)) {
      return;
    }
    acpConfigCacheByKeyRef.current.set(cacheKey, state);
  };
  const acpConfigOptions = acpConfigState?.options ?? [];
  const isAcpConfigLoading = (() => {
    if (!options.isAcpAgent) {
      return false;
    }
    if (options.activeAcpSessionId) {
      return isAcpSessionConfigLoading;
    }
    if (!options.acpWorkspacePath) {
      return false;
    }
    const requestKey = acpConfigRequestKey;
    return Boolean(requestKey && acpConfigLoadingRequestKey === requestKey);
  })();
  const isAcpSessionConfigLoaded = (() => {
    if (!options.activeAcpSessionId) {
      return false;
    }
    return acpConfigLoadedRequestKey === acpConfigRequestKey;
  })();
  const acpConfigReadOnly = (() => {
    if (!options.isAcpAgent) {
      return false;
    }
    if (!options.activeAcpSessionId) {
      return true;
    }
    return !isAcpSessionConfigLoaded;
  })();
  const acpInlineOptions = acpConfigOptions
    .filter((option) => option.type === "select")
    .slice(0, ACP_INLINE_OPTION_LIMIT);
  const acpOverflowOptions = (() => {
    const inlineIds = new Set(acpInlineOptions.map((option) => option.id));
    return acpConfigOptions.filter((option) => !inlineIds.has(option.id));
  })();
  const acpAgentLabel = (() => {
    const modelId = options.activeAcpAgentId ?? options.selectedAgentId;
    const resolvedName = options.resolveModelName("acp", modelId);
    return (
      options.selectedAgentName ||
      (resolvedName && resolvedName !== modelId ? resolvedName : "") ||
      modelId ||
      "ACP Agent"
    );
  })();
  const acpAgentIconId = options.resolveModelIconId("acp", options.activeAcpAgentId ?? options.selectedAgentId);
  const getAcpOptionDisplayValue = (option: AcpConfigOption): string => {
    if (option.type === "boolean") {
      return option.currentValue ? "Enabled" : "Disabled";
    }
    const currentLabel = getAcpOptionCurrentLabel(option);
    if (currentLabel?.trim()) {
      return currentLabel;
    }
    if (typeof option.currentValue === "string" && option.currentValue.trim()) {
      return option.currentValue;
    }
    return "";
  };
  const clearAcpConfigLoadingRequest = (requestKey?: string | null): void => {
    if (!requestKey || acpConfigLoadingRequestKey === requestKey) {
      setAcpConfigLoadingRequestKey(null);
    }
  };
  const matchesCurrentAcpWarmupTarget = (
    agentId: string | null | undefined,
    workdir: string | null | undefined,
  ): boolean => {
    if (options.activeAcpSessionId || !agentId || options.activeAcpAgentId !== agentId) {
      return false;
    }
    const expectedWorkdir = options.acpWorkspacePath?.trim();
    if (!expectedWorkdir) {
      return true;
    }
    return workdir?.trim() === expectedWorkdir;
  };
  const syncAcpConfigOptions = async () => {
    const token = ++acpConfigSyncTokenRef.current;
    const requestKey = acpConfigRequestKey;
    setAcpInlineOpenOptionId(null);
    if (!options.isAcpAgent || !requestKey) {
      setAcpConfigState(null);
      setAcpConfigLoadedRequestKey(null);
      setAcpConfigLoadingRequestKey(null);
      setAcpConfigError(null);
      setIsAcpSessionConfigLoading(false);
      return;
    }
    const agentId = options.activeAcpAgentId;
    if (options.activeAcpSessionId) {
      setAcpConfigLoadingRequestKey(null);
      setAcpConfigState(null);
      setAcpConfigLoadedRequestKey(null);
      setIsAcpSessionConfigLoading(true);
      let loaded = false;
      const delays = [0, 1500, 3000];
      for (const delay of delays) {
        if (delay > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
          if (token !== acpConfigSyncTokenRef.current || acpConfigRequestKey !== requestKey) return;
        }
        try {
          const state = await options.sessionClient.getAcpSessionConfigOptions(options.activeAcpSessionId);
          if (token !== acpConfigSyncTokenRef.current || acpConfigRequestKey !== requestKey) return;
          setAcpConfigState(state);
          setAcpConfigLoadedRequestKey(requestKey);
          setAcpConfigError(null);
          clearAcpConfigLoadingRequest(requestKey);
          loaded = true;
          break;
        } catch {
          if (token !== acpConfigSyncTokenRef.current || acpConfigRequestKey !== requestKey) return;
        }
      }
      if (!loaded && agentId && options.acpWorkspacePath) {
        try {
          await options.providerClient.warmupAcpProcess(agentId, options.acpWorkspacePath ?? undefined);
          const state = await options.providerClient.getAcpProcessConfigOptions(
            agentId,
            options.acpWorkspacePath ?? undefined,
          );
          if (token !== acpConfigSyncTokenRef.current || acpConfigRequestKey !== requestKey) return;
          if (hasAcpConfigState(state)) {
            setAcpConfigState(state);
            setAcpConfigLoadedRequestKey(requestKey);
            setAcpConfigError(null);
            clearAcpConfigLoadingRequest(requestKey);
            loaded = true;
          }
        } catch (fallbackError) {
          console.warn("[ChatStatusBar] ACP config fallback failed:", fallbackError);
        }
      }
      if (!loaded) {
        console.warn("[ChatStatusBar] All ACP config loading attempts failed");
        setAcpConfigState(null);
        setAcpConfigLoadedRequestKey(null);
        setAcpConfigError("Failed to load agent configuration");
      }
      setIsAcpSessionConfigLoading(false);
      clearAcpConfigLoadingRequest(requestKey);
      return;
    }
    setAcpConfigLoadedRequestKey(null);
    setIsAcpSessionConfigLoading(false);
    const cacheKey = acpConfigCacheKey;
    const cachedState = getCachedAcpConfigState(cacheKey);
    setAcpConfigState(cachedState);
    if (hasAcpConfigState(cachedState)) {
      clearAcpConfigLoadingRequest(requestKey);
    } else {
      setAcpConfigLoadingRequestKey(requestKey?.trim() ? requestKey : null);
    }
    if (!agentId) {
      return;
    }
    try {
      try {
        await options.providerClient.warmupAcpProcess(agentId, options.acpWorkspacePath ?? undefined);
      } catch (error) {
        console.warn("[ChatStatusBar] Failed to warmup ACP process:", error);
      }
      const state = await options.providerClient.getAcpProcessConfigOptions(
        agentId,
        options.acpWorkspacePath ?? undefined,
      );
      if (token !== acpConfigSyncTokenRef.current || acpConfigRequestKey !== requestKey) {
        return;
      }
      if (!hasAcpConfigState(state)) {
        setAcpConfigState(getCachedAcpConfigState(cacheKey));
        clearAcpConfigLoadingRequest(requestKey);
        return;
      }
      setCachedAcpConfigState(cacheKey, state);
      setAcpConfigState(state);
      setAcpConfigError(null);
      clearAcpConfigLoadingRequest(requestKey);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn("[ChatStatusBar] Failed to load ACP process config options:", msg);
      if (token !== acpConfigSyncTokenRef.current || acpConfigRequestKey !== requestKey) {
        return;
      }
      setAcpConfigState(getCachedAcpConfigState(cacheKey));
      setAcpConfigError(msg);
      clearAcpConfigLoadingRequest(requestKey);
    }
  };
  const updateAcpConfigOption = async (configId: string, value: string | boolean) => {
    const sessionId = options.activeAcpSessionId;
    if (!sessionId) {
      return;
    }
    if (acpOptionSavingIds.includes(configId)) {
      return;
    }
    setAcpOptionSavingIds((prev) => [...prev, configId]);
    try {
      let updated: AcpConfigState | null = null;
      try {
        updated = await options.sessionClient.setAcpSessionConfigOption(sessionId, configId, value);
      } catch {
        const agentId = options.activeAcpAgentId;
        const workdir = options.acpWorkspacePath;
        if (!agentId || !workdir) {
          setAcpOptionSavingIds((prev) => prev.filter((id) => id !== configId));
          console.warn("[ChatStatusBar] Cannot update config: no agent or workspace");
          return;
        }
        await options.sessionClient.prepareAcpSession({
          sessionId,
          agentId,
          projectDir: workdir,
        });
        updated = await options.sessionClient.setAcpSessionConfigOption(sessionId, configId, value);
      }
      if (options.activeAcpSessionId === sessionId) {
        setAcpConfigState(updated);
      }
    } catch (error) {
      console.warn("[ChatStatusBar] Failed to update ACP config option:", error);
    }
    setAcpOptionSavingIds((prev) => prev.filter((id) => id !== configId));
  };
  const isAcpOptionSaving = (configId: string) => acpOptionSavingIds.includes(configId);
  const handleAcpConfigOptionsReady = (payload?: Record<string, unknown>) => {
    if (!payload || !options.isAcpAgent) {
      return;
    }
    const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : "";
    const agentId = typeof payload.agentId === "string" ? payload.agentId : "";
    const workdir = typeof payload.workdir === "string" ? payload.workdir : "";
    if (!isAcpConfigState(payload.configState)) {
      return;
    }
    if (conversationId) {
      if (options.activeAcpSessionId !== conversationId) {
        return;
      }
      setAcpConfigState(payload.configState);
      setAcpConfigLoadedRequestKey(`session:${conversationId}`);
      setAcpConfigError(null);
      setIsAcpSessionConfigLoading(false);
      clearAcpConfigLoadingRequest(`session:${conversationId}`);
      return;
    }
    if (!matchesCurrentAcpWarmupTarget(agentId, workdir)) {
      return;
    }
    setCachedAcpConfigState(getAcpProcessCacheKey(agentId, workdir), payload.configState);
    if (!options.activeAcpSessionId) {
      setAcpConfigState(payload.configState);
      clearAcpConfigLoadingRequest(acpConfigRequestKey);
    }
  };
  const onAcpInlineOptionOpenChange = (optionId: string, open: boolean) => {
    if (open) {
      setAcpInlineOpenOptionId(optionId);
      return;
    }
    setAcpInlineOpenOptionId((prev) => (prev === optionId ? null : prev));
  };
  const onAcpSelectOption = (configId: string, value: string) => {
    if (!value) {
      return;
    }
    setAcpInlineOpenOptionId(null);
    void updateAcpConfigOption(configId, value);
  };
  const onAcpBooleanOption = (configId: string, value: boolean) => {
    void updateAcpConfigOption(configId, value);
  };
  useEffect(() => {
    void Promise.resolve().then(() => {
      const optionIds = acpInlineOptions.map((option) => option.id);
      if (acpInlineOpenOptionId && !optionIds.includes(acpInlineOpenOptionId)) {
        setAcpInlineOpenOptionId(null);
      }
    });
  }, [acpInlineOptions, acpInlineOpenOptionId]);
  return {
    acpConfigState,
    acpInlineOpenOptionId,
    acpConfigReadOnly,
    acpInlineOptions,
    acpOverflowOptions,
    acpAgentLabel,
    acpAgentIconId,
    isAcpConfigLoading,
    acpConfigError,
    hasAcpConfigOptions: acpConfigOptions.length > 0,
    getAcpOptionDisplayValue,
    isAcpOptionSaving,
    syncAcpConfigOptions,
    handleAcpConfigOptionsReady,
    onAcpInlineOptionOpenChange,
    onAcpSelectOption,
    onAcpBooleanOption,
  };
}
