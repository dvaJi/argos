import { useState, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Badge } from "#shadcn/components/ui/badge";
import { Button } from "#shadcn/components/ui/button";
import { Card, CardContent } from "#shadcn/components/ui/card";
import { Input } from "#shadcn/components/ui/input";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { useProviderStore, getSortedProviders } from "#/stores/providerStore";
import { useModelStore } from "#/stores/modelStore";
import { useThemeStore } from "#/stores/theme";
import { useLanguageStore } from "#/stores/language";
import ModelIcon from "#/components/icons/ModelIcon";
import { ModelType } from "@argos/shared/model";
import type { RENDERER_MODEL_META } from "@argos/shared/presenter";
import { useChatMode } from "#/components/chat-input/composables/useChatMode";

interface ModelChooserProps {
  type?: ModelType[];
  requiresVision?: boolean;
  selectedProviderId?: string;
  selectedModelId?: string;
  onUpdateModel: (model: RENDERER_MODEL_META, providerId: string) => void;
}

export default function ModelChooser({
  type,
  requiresVision = false,
  selectedProviderId = "",
  selectedModelId = "",
  onUpdateModel,
}: ModelChooserProps) {
  const [keyword, setKeyword] = useState("");
  const providerStore = useProviderStore();
  const modelStore = useModelStore();
  const themeStore = useThemeStore();
  const langStore = useLanguageStore();
  const chatMode = useChatMode();

  const providers = useMemo(() => {
    const sortedProviders = getSortedProviders();
    const enabledModels = modelStore.enabledModels;
    const currentMode = chatMode.currentMode;

    return sortedProviders
      .filter((provider) => provider.enable)
      .map((provider) => {
        if (currentMode === "acp agent" && provider.id !== "acp") return null;
        if (currentMode !== "acp agent" && provider.id === "acp") return null;

        const enabledProvider = enabledModels.find((entry) => entry.providerId === provider.id);
        if (!enabledProvider || enabledProvider.models.length === 0) return null;

        const models =
          !type || type.length === 0
            ? enabledProvider.models
            : enabledProvider.models.filter(
                (model) => model.type !== undefined && type.includes(model.type as ModelType),
              );

        const eligibleModels = requiresVision ? models.filter((model) => model.vision) : models;
        if (!eligibleModels || eligibleModels.length === 0) return null;

        return { id: provider.id, name: provider.name, models: eligibleModels };
      })
      .filter((provider): provider is { id: string; name: string; models: RENDERER_MODEL_META[] } => provider !== null);
  }, [getSortedProviders(), modelStore.enabledModels, chatMode.currentMode, type, requiresVision]);

  const filteredProviders = useMemo(() => {
    if (!keyword) return providers;
    return providers
      .map((provider) => ({
        ...provider,
        models: provider.models.filter((model) => model.name.toLowerCase().includes(keyword.toLowerCase())),
      }))
      .filter((provider) => provider.models.length > 0);
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
    <Card className="w-full border-border bg-card shadow-sm" dir={langStore.dir}>
      <CardContent className="flex flex-col gap-4 p-4">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search models..."
          className="h-9 w-full text-sm"
        />
        <ScrollArea className="h-72 pr-2">
          <div className="flex flex-col gap-5">
            {filteredProviders.map((provider) => (
              <div key={provider.id} className="flex flex-col gap-2">
                <Badge
                  variant="outline"
                  className="w-fit uppercase tracking-[0.18em] text-[10px] font-semibold text-muted-foreground"
                >
                  {provider.name}
                </Badge>
                <div className="flex flex-col gap-1.5" role="listbox" aria-orientation="vertical">
                  {provider.models.map((model) => (
                    <Button
                      key={`${provider.id}-${model.id}`}
                      type="button"
                      variant="outline"
                      className={`group w-full justify-start gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition${
                        isSelected(provider.id, model.id)
                          ? " border-primary bg-primary/10 text-foreground/90 dark:bg-primary/15"
                          : ""
                      }`}
                      role="option"
                      aria-selected={isSelected(provider.id, model.id)}
                      data-selected={isSelected(provider.id, model.id)}
                      onClick={() => handleModelSelect(provider.id, model)}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground transition group-data-[selected=true]:border-primary group-data-[selected=true]:bg-primary/20 group-data-[selected=true]:text-primary">
                        <ModelIcon
                          modelId={provider.id === "acp" ? model.id : provider.id}
                          isDark={themeStore.isDark}
                        />
                      </div>
                      <span className="flex-1 truncate">{model.name}</span>
                      {isSelected(provider.id, model.id) && (
                        <Icon
                          icon="lucide:check"
                          className="h-4 w-4 shrink-0 text-primary dark:text-primary/80"
                          aria-hidden="true"
                        />
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
