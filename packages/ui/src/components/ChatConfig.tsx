import { useMemo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { Label } from "#shadcn/components/ui/label";
import { Textarea } from "#shadcn/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import ConfigSliderField from "./ChatConfig/ConfigSliderField";
import ConfigInputField from "./ChatConfig/ConfigInputField";
import ConfigSelectField from "./ChatConfig/ConfigSelectField";
import { useModelCapabilities } from "#/composables/useModelCapabilities";
import { useThinkingBudget } from "#/composables/useThinkingBudget";
import { useModelTypeDetection } from "#/composables/useModelTypeDetection";
import { useChatConfigFields } from "#/composables/useChatConfigFields";
import type { ReasoningEffort, Verbosity } from "@argos/shared/types/model-db";
import { useLanguageStore } from "#/stores/language";

interface ChatConfigProps {
  contextLengthLimit?: number;
  maxTokensLimit?: number;
  temperature: number;
  contextLength: number;
  maxTokens: number;
  thinkingBudget?: number;
  modelId?: string;
  providerId?: string;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
  modelType?: "chat" | "imageGeneration" | "videoGeneration" | "tts" | "embedding" | "rerank";
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  onUpdateTemperature: (value: number) => void;
  onUpdateContextLength: (value: number) => void;
  onUpdateMaxTokens: (value: number) => void;
  onUpdateThinkingBudget: (value: number | undefined) => void;
  onUpdateReasoningEffort: (value: ReasoningEffort) => void;
  onUpdateVerbosity: (value: Verbosity) => void;
}

export default function ChatConfig({
  contextLengthLimit,
  maxTokensLimit,
  temperature,
  contextLength,
  maxTokens,
  thinkingBudget,
  modelId,
  providerId,
  reasoningEffort,
  verbosity,
  modelType,
  systemPrompt,
  onSystemPromptChange,
  onUpdateTemperature,
  onUpdateContextLength,
  onUpdateMaxTokens,
  onUpdateThinkingBudget,
  onUpdateReasoningEffort,
  onUpdateVerbosity,
}: ChatConfigProps) {
  const langStore = useLanguageStore();

  const modelTypeDetection = useModelTypeDetection({
    modelId,
    providerId,
    modelType,
  });

  const capabilities = useModelCapabilities({
    providerId,
    modelId,
  });

  const thinkingBudgetResult = useThinkingBudget({
    thinkingBudget,
    budgetRange: capabilities.budgetRange,
    modelReasoning: modelTypeDetection.modelReasoning,
    supportsReasoning: capabilities.supportsReasoning,
  });

  const formatSize = (size: number): string => {
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}M`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)}K`;
    return `${size}`;
  };

  const emit = {
    "update:temperature": (value: number) => onUpdateTemperature(value),
    "update:contextLength": (value: number) => onUpdateContextLength(value),
    "update:maxTokens": (value: number) => onUpdateMaxTokens(value),
    "update:thinkingBudget": (value: number | undefined) => onUpdateThinkingBudget(value),
    "update:reasoningEffort": (value: ReasoningEffort) => onUpdateReasoningEffort(value),
    "update:verbosity": (value: Verbosity) => onUpdateVerbosity(value),
  } as unknown as {
    (e: "update:temperature", value: number): void;
    (e: "update:contextLength", value: number): void;
    (e: "update:maxTokens", value: number): void;
    (e: "update:thinkingBudget", value: number | undefined): void;
    (e: "update:reasoningEffort", value: ReasoningEffort): void;
    (e: "update:verbosity", value: Verbosity): void;
  };

  const { sliderFields, inputFields, selectFields } = useChatConfigFields({
    temperature,
    contextLength,
    maxTokens,
    contextLengthLimit,
    maxTokensLimit,
    thinkingBudget,
    reasoningEffort,
    verbosity,
    providerId,
    supportsTemperatureControl: capabilities.supportsTemperatureControl,
    showThinkingBudget: thinkingBudgetResult.showThinkingBudget,
    thinkingBudgetError: thinkingBudgetResult.validationError,
    budgetRange: capabilities.budgetRange,
    formatSize,
    emit,
  });

  useEffect(() => {
    if ((modelType === "imageGeneration" || modelType === "videoGeneration") && systemPrompt) {
      onSystemPromptChange("");
    }
  }, [modelType]);

  const modelTypeIcon = useMemo(() => {
    const icons: Record<string, string> = {
      chat: "lucide:message-circle",
      imageGeneration: "lucide:image",
      videoGeneration: "lucide:clapperboard",
      tts: "lucide:volume-2",
      embedding: "lucide:layers",
      rerank: "lucide:arrow-up-down",
    };
    return icons[modelType || "chat"];
  }, [modelType]);

  const isImageGen = modelTypeDetection.isImageGenerationModel;
  const isVideoGen = modelTypeDetection.isVideoGenerationModel;

  return (
    <div className="pt-2 pb-6 px-2" dir={langStore.dir}>
      <div className="flex items-center gap-2 px-2 mb-2">
        <h2 className="text-xs text-muted-foreground">Model Settings</h2>
        <Icon icon={modelTypeIcon} className="w-3 h-3 text-muted-foreground" />
      </div>

      <div className="space-y-6">
        {!isImageGen && !isVideoGen && (
          <div className="space-y-2 px-2">
            <div className="flex items-center space-x-2 py-1.5">
              <Icon icon="lucide:terminal" className="w-4 h-4 text-muted-foreground" />
              <Label className="text-xs font-medium">System Prompt</Label>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger>
                    <Icon icon="lucide:help-circle" className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Custom instructions for the AI assistant</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Textarea
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="Enter system prompt..."
            />
          </div>
        )}

        {sliderFields.map((field) => (
          <ConfigSliderField
            key={field.key}
            modelValue={field.getValue()}
            icon={field.icon}
            label={field.label}
            description={field.description || ""}
            min={field.min}
            max={field.max}
            step={field.step}
            formatter={field.formatter}
            onModelValueChange={field.setValue}
          />
        ))}

        {inputFields.map((field) => (
          <ConfigInputField
            key={field.key}
            modelValue={field.getValue()}
            icon={field.icon}
            label={field.label}
            description={field.description}
            type={field.inputType}
            min={field.min}
            max={field.max}
            step={field.step}
            placeholder={field.placeholder}
            error={field.error?.()}
            hint={field.hint?.()}
            onModelValueChange={field.setValue}
          />
        ))}

        {selectFields.map((field) => (
          <ConfigSelectField
            key={field.key}
            modelValue={field.getValue()}
            icon={field.icon}
            label={field.label}
            description={field.description}
            options={typeof field.options === "function" ? field.options() : field.options}
            placeholder={field.placeholder}
            hint={field.hint}
            onModelValueChange={field.setValue}
          />
        ))}
      </div>
    </div>
  );
}
