import { describe, expect, it, vi } from "vitest";
import { useChatConfigFields } from "@/composables/useChatConfigFields";
import type { ThinkingBudgetRange } from "@/composables/useThinkingBudget";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function createFields(
  supportsTemperatureControl: boolean | null,
  options: {
    showThinkingBudget?: boolean;
    thinkingBudget?: number;
    budgetRange?: ThinkingBudgetRange | null;
  } = {},
) {
  return useChatConfigFields({
    temperature: { value: 0.7 },
    contextLength: { value: 4096 },
    maxTokens: { value: 1024 },
    contextLengthLimit: { value: undefined },
    maxTokensLimit: { value: undefined },
    thinkingBudget: { value: options.thinkingBudget },
    reasoningEffort: { value: undefined },
    verbosity: { value: undefined },
    providerId: { value: "openai" },
    supportsTemperatureControl: { value: supportsTemperatureControl },
    showThinkingBudget: { value: options.showThinkingBudget ?? false },
    thinkingBudgetError: { value: "" },
    budgetRange: { value: options.budgetRange ?? null },
    formatSize: (size: number) => String(size),
    emit: vi.fn(),
  });
}

describe("useChatConfigFields", () => {
  it("hides temperature when capabilities explicitly disable temperature control", () => {
    const { sliderFields } = createFields(false);

    expect(sliderFields.value.some((field) => field.key === "temperature")).toBe(false);
  });

  it("shows temperature when capabilities support temperature control", () => {
    const { sliderFields } = createFields(true);

    expect(sliderFields.value.some((field) => field.key === "temperature")).toBe(true);
  });

  it("shows temperature while temperature capability is unknown", () => {
    const { sliderFields } = createFields(null);

    expect(sliderFields.value.some((field) => field.key === "temperature")).toBe(true);
  });

  it("expands thinking budget input bounds to include sentinels", () => {
    const autoFields = createFields(true, {
      showThinkingBudget: true,
      budgetRange: { min: 128, max: 24576, auto: -1, unit: "tokens" },
    });
    const autoBudgetField = autoFields.inputFields.value.find((field) => field.key === "thinkingBudget");

    expect(autoBudgetField?.min).toBe(-1);
    expect(autoBudgetField?.max).toBe(24576);

    const offFields = createFields(true, {
      showThinkingBudget: true,
      budgetRange: { min: 512, max: 24576, off: 0, unit: "tokens" },
    });
    const offBudgetField = offFields.inputFields.value.find((field) => field.key === "thinkingBudget");

    expect(offBudgetField?.min).toBe(0);
    expect(offBudgetField?.max).toBe(24576);
  });
});
