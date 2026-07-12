import { useState, useEffect, useRef } from "react";

import { createModelClient } from "#api/ModelClient";
import type { ReasoningPortrait } from "@argos/shared/types/model-db";
import type { ThinkingBudgetRange } from "./useThinkingBudget";

const normalizeBudgetRange = (
  budget: ReasoningPortrait["budget"] | ThinkingBudgetRange | null | undefined,
): ThinkingBudgetRange | null => {
  if (!budget) return null;

  const range: ThinkingBudgetRange = {};
  if (typeof budget.min === "number") range.min = budget.min;
  if (typeof budget.max === "number") range.max = budget.max;
  if (typeof budget.default === "number") range.default = budget.default;
  if (typeof budget.auto === "number") range.auto = budget.auto;
  if (typeof budget.off === "number") range.off = budget.off;
  if (typeof budget.unit === "string") range.unit = budget.unit;

  return Object.keys(range).length > 0 ? range : null;
};

const mergeBudgetRanges = (
  base: ReasoningPortrait["budget"] | ThinkingBudgetRange | null | undefined,
  overlay: ReasoningPortrait["budget"] | ThinkingBudgetRange | null | undefined,
): ThinkingBudgetRange | null => {
  const normalizedBase = normalizeBudgetRange(base) ?? {};
  const normalizedOverlay = normalizeBudgetRange(overlay) ?? {};
  const merged = {
    ...normalizedBase,
    ...normalizedOverlay,
  };

  return Object.keys(merged).length > 0 ? merged : null;
};

export interface ModelCapabilities {
  supportsReasoning: boolean | null;
  budgetRange: ThinkingBudgetRange | null;
  supportsSearch: boolean | null;
  searchDefaults: {
    default?: boolean;
    forced?: boolean;
    strategy?: "turbo" | "max";
  } | null;
  supportsTemperatureControl: boolean | null;
}

export interface UseModelCapabilitiesOptions {
  providerId: string | undefined;
  modelId: string | undefined;
}

export function useModelCapabilities(options: UseModelCapabilitiesOptions) {
  const { providerId, modelId } = options;
  const modelClientRef = useRef(createModelClient());

  const [capabilitySupportsReasoning, setCapabilitySupportsReasoning] = useState<boolean | null>(null);
  const [capabilityBudgetRange, setCapabilityBudgetRange] = useState<ThinkingBudgetRange | null>(null);
  const [capabilitySupportsSearch, setCapabilitySupportsSearch] = useState<boolean | null>(null);
  const [capabilitySupportsTemperatureControl, setCapabilitySupportsTemperatureControl] = useState<boolean | null>(
    null,
  );
  const [capabilitySearchDefaults, setCapabilitySearchDefaults] = useState<{
    default?: boolean;
    forced?: boolean;
    strategy?: "turbo" | "max";
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  const resetCapabilities = () => {
    setCapabilitySupportsReasoning(null);
    setCapabilityBudgetRange(null);
    setCapabilitySupportsSearch(null);
    setCapabilitySupportsTemperatureControl(null);
    setCapabilitySearchDefaults(null);
  };

  useEffect(() => {
    const currentRequestId = ++requestIdRef.current;
    const currentProviderId = providerId;
    const currentModelId = modelId;

    if (!currentProviderId || !currentModelId) {
      resetCapabilities();
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const fetchCapabilities = async () => {
      try {
        const capabilities = await modelClientRef.current.getCapabilities(currentProviderId, currentModelId);

        if (currentRequestId !== requestIdRef.current) return;

        setCapabilitySupportsReasoning(
          typeof capabilities.supportsReasoning === "boolean" ? capabilities.supportsReasoning : null,
        );
        setCapabilityBudgetRange(
          mergeBudgetRanges(capabilities.thinkingBudgetRange, capabilities.reasoningPortrait?.budget),
        );
        setCapabilitySupportsSearch(
          typeof capabilities.supportsSearch === "boolean" ? capabilities.supportsSearch : null,
        );
        setCapabilitySearchDefaults(capabilities.searchDefaults || {});
        setCapabilitySupportsTemperatureControl(
          typeof capabilities.supportsTemperatureControl === "boolean"
            ? capabilities.supportsTemperatureControl
            : typeof capabilities.temperatureCapability === "boolean"
              ? capabilities.temperatureCapability
              : null,
        );
      } catch (error) {
        if (currentRequestId !== requestIdRef.current) return;

        resetCapabilities();
        console.error(error);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    void fetchCapabilities();
  }, [providerId, modelId]);

  const refresh = async () => {
    const currentRequestId = ++requestIdRef.current;
    const currentProviderId = providerId;
    const currentModelId = modelId;

    if (!currentProviderId || !currentModelId) {
      resetCapabilities();
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const capabilities = await modelClientRef.current.getCapabilities(currentProviderId, currentModelId);
      if (currentRequestId !== requestIdRef.current) return;

      setCapabilitySupportsReasoning(
        typeof capabilities.supportsReasoning === "boolean" ? capabilities.supportsReasoning : null,
      );
      setCapabilityBudgetRange(
        mergeBudgetRanges(capabilities.thinkingBudgetRange, capabilities.reasoningPortrait?.budget),
      );
      setCapabilitySupportsSearch(
        typeof capabilities.supportsSearch === "boolean" ? capabilities.supportsSearch : null,
      );
      setCapabilitySearchDefaults(capabilities.searchDefaults || {});
      setCapabilitySupportsTemperatureControl(
        typeof capabilities.supportsTemperatureControl === "boolean"
          ? capabilities.supportsTemperatureControl
          : typeof capabilities.temperatureCapability === "boolean"
            ? capabilities.temperatureCapability
            : null,
      );
    } catch (error) {
      if (currentRequestId !== requestIdRef.current) return;
      resetCapabilities();
      console.error(error);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  return {
    supportsReasoning: capabilitySupportsReasoning,
    budgetRange: capabilityBudgetRange,
    supportsSearch: capabilitySupportsSearch,
    searchDefaults: capabilitySearchDefaults,
    supportsTemperatureControl: capabilitySupportsTemperatureControl,
    isLoading,
    refresh,
  };
}
