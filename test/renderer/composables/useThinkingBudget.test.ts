import { describe, it, expect, vi } from "vitest";
import { useThinkingBudget, type ThinkingBudgetRange } from "@/composables/useThinkingBudget";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (k: string, _p?: any) => k }),
}));

describe("useThinkingBudget", () => {
  it("computes showThinkingBudget only when reasoning supported and range provided", () => {
    const thinkingBudget = { value: undefined } as { value: number | undefined };
    const budgetRange = {
      value: { min: 256, max: 4096 },
    } as { value: ThinkingBudgetRange | null };
    const modelReasoning = { value: true } as { value: boolean };
    const supportsReasoning = { value: true } as { value: boolean | null };

    const api = useThinkingBudget({
      thinkingBudget,
      budgetRange,
      modelReasoning,
      supportsReasoning,
    });
    expect(api.showThinkingBudget.value).toBe(true);

    supportsReasoning.value = null;
    expect(api.showThinkingBudget.value).toBe(false);

    supportsReasoning.value = true;
    budgetRange.value = null;
    expect(api.showThinkingBudget.value).toBe(false);

    budgetRange.value = { auto: -1 };
    expect(api.showThinkingBudget.value).toBe(true);
  });

  it("validates ranges and allows provider-db budget sentinels", () => {
    const thinkingBudget = { value: 128 } as { value: number | undefined };
    const budgetRange = {
      value: { min: 256, max: 1024 },
    } as { value: ThinkingBudgetRange | null };
    const modelReasoning = { value: true } as { value: boolean };
    const supportsReasoning = { value: true } as { value: boolean | null };

    const api = useThinkingBudget({
      thinkingBudget,
      budgetRange,
      modelReasoning,
      supportsReasoning,
    });
    expect(api.validationError.value).toBe("settings.model.modelConfig.thinkingBudget.validation.minValue");

    thinkingBudget.value = 2048;
    expect(api.validationError.value).toBe("settings.model.modelConfig.thinkingBudget.validation.maxValue");

    thinkingBudget.value = 512;
    expect(api.validationError.value).toBe("");

    thinkingBudget.value = -1;
    expect(api.validationError.value).toBe("settings.model.modelConfig.thinkingBudget.validation.minValue");

    budgetRange.value = { min: 0, max: 24576, default: -1, auto: -1, off: 0, unit: "tokens" };
    expect(api.validationError.value).toBe("");

    budgetRange.value = { min: 512, max: 24576, off: 0 };
    thinkingBudget.value = 0;
    expect(api.validationError.value).toBe("");
  });
});
