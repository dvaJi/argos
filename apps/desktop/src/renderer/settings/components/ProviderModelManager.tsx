import { useMemo } from "react";
import { Label } from "@shadcn/components/ui/label";
import type { LLM_PROVIDER, RENDERER_MODEL_META } from "@shared/presenter";
import ProviderModelList from "./ProviderModelList";

interface ProviderModelManagerProps {
  provider: LLM_PROVIDER;
  enabledModels: RENDERER_MODEL_META[];
  totalModelsCount: number;
  providerModels: RENDERER_MODEL_META[];
  customModels: RENDERER_MODEL_META[];
  isModelListLoading?: boolean;
  onDisableAllModels?: () => void;
  onModelEnabledChange?: (model: RENDERER_MODEL_META, enabled: boolean) => void;
  onConfigChanged?: () => void;
  onCustomModelAdded?: () => void;
}

export default function ProviderModelManager({
  provider,
  enabledModels,
  totalModelsCount,
  providerModels,
  customModels,
  isModelListLoading,
  onModelEnabledChange,
  onCustomModelAdded,
  onConfigChanged,
}: ProviderModelManagerProps) {
  const providerModelGroups = useMemo(
    () => [{ providerId: provider.id, models: providerModels }],
    [provider.id, providerModels],
  );

  const providerOptions = useMemo(() => [{ id: provider.id, name: provider.name }], [provider.id, provider.name]);

  return (
    <div className="w-full relative">
      <div className="flex w-full justify-between items-center sticky top-0 z-30 backdrop-blur">
        <div className="flex flex-col w-full gap-2">
          <Label htmlFor={`${provider.id}-model`} className="flex-1">
            Model List
          </Label>
          <div className="text-xs text-muted-foreground">
            {enabledModels.length}/{totalModelsCount} models enabled
          </div>
        </div>
      </div>

      <div className="w-full">
        <ProviderModelList
          providerId={provider.id}
          providerModels={providerModelGroups}
          customModels={customModels}
          providers={providerOptions}
          onEnabledChange={(model, enabled) => onModelEnabledChange?.(model, enabled)}
          onSaved={onCustomModelAdded}
          onConfigChanged={onConfigChanged}
          isLoading={isModelListLoading}
        />
      </div>
    </div>
  );
}
