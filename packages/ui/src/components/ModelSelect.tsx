import { useState, useMemo, useCallback } from "react";
import { Input } from "#shadcn/components/ui/input";
import type { RENDERER_MODEL_META } from "@argos/shared/presenter";
import { ModelType } from "@argos/shared/model";
import ModelIcon from "./icons/ModelIcon";
import { useProviderStore, getSortedProviders } from "#/stores/providerStore";
import { useModelStore } from "#/stores/modelStore";
import { useThemeStore } from "#/stores/theme";
import { useLanguageStore } from "#/stores/language";
import { useChatMode } from "#/components/chat-input/composables/useChatMode";

interface ModelSelectProps {
  type?: ModelType[];
  respectChatMode?: boolean;
  excludeProviders?: string[];
  visionOnly?: boolean;
  selectedProviderId?: string;
  selectedModelId?: string;
  onUpdateModel: (model: RENDERER_MODEL_META, providerId: string) => void;
}

export default function ModelSelect({
  type,
  respectChatMode = true,
  excludeProviders = [],
  visionOnly = false,
  selectedProviderId = "",
  selectedModelId = "",
  onUpdateModel,
}: ModelSelectProps) {
  const [keyword, setKeyword] = useState("");
  const providerStore = useProviderStore();
  const modelStore = useModelStore();
  const themeStore = useThemeStore();
  const langStore = useLanguageStore();
  const chatMode = useChatMode();

  const sortedProviders = getSortedProviders();
  const providers = useMemo(() => {
    const enabledModels = modelStore.enabledModels;
    const currentMode = chatMode.currentMode;
    const excludeSet = new Set(excludeProviders);
    const typeSet = type && type.length > 0 ? new Set<ModelType>(type) : undefined;

    return sortedProviders
      .map((provider) => {
        if (!provider.enable || excludeSet.has(provider.id)) return null;
        if (respectChatMode) {
          if (currentMode === "acp agent" && provider.id !== "acp") return null;
          if (currentMode !== "acp agent" && provider.id === "acp") return null;
        }

        const enabledProvider = enabledModels.find((item) => item.providerId === provider.id);
        if (!enabledProvider || enabledProvider.models.length === 0) return null;

        const filteredModels = enabledProvider.models.filter((model) => {
          const matchType =
            !typeSet || typeSet.size === 0 || (model.type !== undefined && typeSet.has(model.type as ModelType));
          const matchVision = !visionOnly || Boolean(model.vision);
          return matchType && matchVision;
        });

        if (filteredModels.length === 0) return null;

        return { id: provider.id, name: provider.name, models: filteredModels };
      })
      .filter((provider): provider is { id: string; name: string; models: RENDERER_MODEL_META[] } => provider !== null);
  }, [
    sortedProviders,
    modelStore.enabledModels,
    chatMode.currentMode,
    type,
    respectChatMode,
    excludeProviders,
    visionOnly,
  ]);

  const filteredProviders = useMemo(() => {
    if (!keyword) return providers;
    const lowerKeyword = keyword.toLowerCase();
    return providers.flatMap((provider) => {
      const models = provider.models.filter((model) => model.name.toLowerCase().includes(lowerKeyword));
      return models.length > 0 ? [{ ...provider, models }] : [];
    });
  }, [providers, keyword]);

  const isSelected = useCallback(
    (providerId: string, modelId: string) => selectedProviderId === providerId && selectedModelId === modelId,
    [selectedProviderId, selectedModelId],
  );

  const handleModelSelect = useCallback(
    (providerId: string, model: RENDERER_MODEL_META) => {
      onUpdateModel(model, providerId);
    },
    [onUpdateModel],
  );

  return (
    <div className="space-y-2" dir={langStore.dir}>
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="w-full rounded-b-none border-none border-b text-sm ring-0 focus-visible:ring-0"
        placeholder="Search models..."
      />
      <div className="flex max-h-64 flex-col overflow-y-auto">
        {filteredProviders.map((provider) => (
          <div key={provider.id}>
            <div className="px-2 text-xs text-muted-foreground">{provider.name}</div>
            <div className="p-1">
              {provider.models.map((model) => (
                <button
                  type="button"
                  key={`${provider.id}-${model.id}`}
                  className={`flex w-full flex-row items-center gap-1 rounded-md p-2 text-left hover:bg-muted dark:hover:bg-accent${
                    isSelected(provider.id, model.id) ? " bg-muted" : ""
                  }`}
                  onClick={() => handleModelSelect(provider.id, model)}
                >
                  <ModelIcon modelId={provider.id === "acp" ? model.id : provider.id} isDark={themeStore.isDark} />
                  <span className="flex-1 truncate text-xs font-bold">{model.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
