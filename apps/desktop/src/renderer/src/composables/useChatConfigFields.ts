import { useMemo } from "react";
import type {
  SliderFieldConfig,
  InputFieldConfig,
  SelectFieldConfig,
  SelectOption,
  FieldConfig,
} from "@/components/ChatConfig/types";
import type { ThinkingBudgetRange } from "@/composables/useThinkingBudget";
import {
  DEFAULT_REASONING_EFFORT_OPTIONS as FALLBACK_REASONING_EFFORT_OPTIONS,
  isReasoningEffort,
  type ReasoningEffort,
  type Verbosity,
} from "@shared/types/model-db";

const getThinkingBudgetInputBounds = (budgetRange: ThinkingBudgetRange | null): { min?: number; max?: number } => {
  const bounds: { min?: number; max?: number } = {
    min: budgetRange?.min,
    max: budgetRange?.max,
  };
  const sentinels = [budgetRange?.auto, budgetRange?.off].filter((value): value is number => typeof value === "number");

  for (const sentinel of sentinels) {
    if (typeof bounds.min === "number" && sentinel < bounds.min) {
      bounds.min = sentinel;
    }
    if (typeof bounds.max === "number" && sentinel > bounds.max) {
      bounds.max = sentinel;
    }
  }

  return bounds;
};

export interface UseChatConfigFieldsOptions {
  temperature: number;
  contextLength: number;
  maxTokens: number;
  contextLengthLimit: number | undefined;
  maxTokensLimit: number | undefined;
  thinkingBudget: number | undefined;
  reasoningEffort: ReasoningEffort | undefined;
  verbosity: Verbosity | undefined;
  providerId: string | undefined;

  supportsTemperatureControl: boolean | null;
  showThinkingBudget: boolean;
  thinkingBudgetError: string;
  budgetRange: ThinkingBudgetRange | null;

  formatSize: (size: number) => string;

  emit: {
    (e: "update:temperature", value: number): void;
    (e: "update:contextLength", value: number): void;
    (e: "update:maxTokens", value: number): void;
    (e: "update:thinkingBudget", value: number | undefined): void;
    (e: "update:reasoningEffort", value: ReasoningEffort): void;
    (e: "update:verbosity", value: Verbosity): void;
  };
}

export function useChatConfigFields(options: UseChatConfigFieldsOptions) {
  const sliderFields = useMemo<SliderFieldConfig[]>(() => {
    const fields: SliderFieldConfig[] = [];

    if (options.supportsTemperatureControl !== false) {
      fields.push({
        key: "temperature",
        type: "slider",
        icon: "lucide:thermometer",
        label: "Temperature",
        description: "Controls randomness in responses",
        min: 0,
        max: 2,
        step: 0.1,
        getValue: () => options.temperature,
        setValue: (val) => options.emit("update:temperature", val),
      });
    }

    fields.push({
      key: "contextLength",
      type: "slider",
      icon: "lucide:pencil-ruler",
      label: "Context Length",
      description: "Maximum context length for the model",
      min: 2048,
      max: options.contextLengthLimit ?? 16384,
      step: 1024,
      formatter: options.formatSize,
      getValue: () => options.contextLength,
      setValue: (val) => options.emit("update:contextLength", val),
    });

    fields.push({
      key: "maxTokens",
      type: "slider",
      icon: "lucide:message-circle-reply",
      label: "Response Length",
      description: "Maximum response length",
      min: 1024,
      max: !options.maxTokensLimit || options.maxTokensLimit < 8192 ? 8192 : options.maxTokensLimit,
      step: 128,
      formatter: options.formatSize,
      getValue: () => options.maxTokens,
      setValue: (val) => options.emit("update:maxTokens", val),
    });

    return fields;
  }, [
    options.temperature,
    options.contextLength,
    options.maxTokens,
    options.contextLengthLimit,
    options.maxTokensLimit,
    options.supportsTemperatureControl,
    options.formatSize,
    options.emit,
  ]);

  const inputFields = useMemo<InputFieldConfig[]>(() => {
    const fields: InputFieldConfig[] = [];

    if (options.showThinkingBudget) {
      const thinkingBudgetInputBounds = getThinkingBudgetInputBounds(options.budgetRange);

      fields.push({
        key: "thinkingBudget",
        type: "input",
        icon: "lucide:brain",
        label: "Thinking Budget",
        description: "Token budget for extended thinking",
        inputType: "number",
        min: thinkingBudgetInputBounds.min,
        max: thinkingBudgetInputBounds.max,
        step: 128,
        placeholder: "Auto",
        getValue: () => options.thinkingBudget,
        setValue: (val) => options.emit("update:thinkingBudget", val as number | undefined),
        error: () => options.thinkingBudgetError,
        hint: () => {
          if (options.thinkingBudget === undefined) {
            return "Using model default";
          }
          return `Range: ${options.budgetRange?.min} - ${options.budgetRange?.max}`;
        },
      });
    }

    return fields;
  }, [
    options.showThinkingBudget,
    options.thinkingBudget,
    options.budgetRange,
    options.thinkingBudgetError,
    options.emit,
  ]);

  const selectFields = useMemo<SelectFieldConfig[]>(() => {
    const fields: SelectFieldConfig[] = [];

    if (options.reasoningEffort !== undefined) {
      const getReasoningEffortOptions = (): SelectOption[] => {
        if (
          isReasoningEffort(options.reasoningEffort) &&
          !FALLBACK_REASONING_EFFORT_OPTIONS.includes(options.reasoningEffort)
        ) {
          return [
            {
              value: options.reasoningEffort,
              label: options.reasoningEffort,
            },
          ];
        }

        if (options.providerId === "grok") {
          return [
            { value: "low", label: "Low" },
            { value: "high", label: "High" },
          ];
        }

        return FALLBACK_REASONING_EFFORT_OPTIONS.map((value) => ({
          value,
          label: value.charAt(0).toUpperCase() + value.slice(1),
        }));
      };

      fields.push({
        key: "reasoningEffort",
        type: "select",
        icon: "lucide:brain",
        label: "Reasoning Effort",
        description: "Adjust reasoning depth",
        options: getReasoningEffortOptions,
        placeholder: "Select reasoning effort",
        getValue: () => options.reasoningEffort,
        setValue: (val) => options.emit("update:reasoningEffort", val as ReasoningEffort),
      });
    }

    if (options.verbosity !== undefined) {
      fields.push({
        key: "verbosity",
        type: "select",
        icon: "lucide:message-square-text",
        label: "Verbosity",
        description: "Response verbosity level",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
        placeholder: "Select verbosity",
        getValue: () => options.verbosity,
        setValue: (val) => options.emit("update:verbosity", val as "low" | "medium" | "high"),
      });
    }

    return fields;
  }, [options.reasoningEffort, options.providerId, options.verbosity, options.emit]);

  const allFields = useMemo<FieldConfig[]>(
    () => [...sliderFields, ...inputFields, ...selectFields],
    [sliderFields, inputFields, selectFields],
  );

  return {
    sliderFields,
    inputFields,
    selectFields,
    allFields,
  };
}
