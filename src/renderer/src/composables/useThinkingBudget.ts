import { useMemo } from "react";

export interface ThinkingBudgetRange {
  min?: number;
  max?: number;
  default?: number;
  auto?: number;
  off?: number;
  unit?: string;
}

export interface UseThinkingBudgetOptions {
  thinkingBudget: number | undefined;
  budgetRange: ThinkingBudgetRange | null;
  modelReasoning: boolean;
  supportsReasoning: boolean | null;
}

export function useThinkingBudget(options: UseThinkingBudgetOptions) {
  const { thinkingBudget, budgetRange, modelReasoning, supportsReasoning } = options;

  const showThinkingBudget = useMemo(
    () =>
      modelReasoning &&
      supportsReasoning === true &&
      !!budgetRange &&
      (budgetRange.min !== undefined ||
        budgetRange.max !== undefined ||
        budgetRange.default !== undefined ||
        budgetRange.auto !== undefined ||
        budgetRange.off !== undefined),
    [modelReasoning, supportsReasoning, budgetRange],
  );

  const validationError = useMemo(() => {
    const value = thinkingBudget;
    const range = budgetRange;

    if (value === undefined || value === null || !range) {
      return "";
    }

    const isProviderDbSentinel =
      (typeof range.auto === "number" && value === range.auto) ||
      (typeof range.off === "number" && value === range.off);

    if (isProviderDbSentinel) {
      return "";
    }

    if (range.min !== undefined && value < range.min) {
      return `Value must be at least ${range.min}`;
    }

    if (range.max !== undefined && value > range.max) {
      return `Value must be at most ${range.max}`;
    }

    return "";
  }, [thinkingBudget, budgetRange]);

  return {
    showThinkingBudget,
    validationError,
  };
}
