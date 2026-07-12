import { useState, useEffect, useMemo } from "react";
import { useStore } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { ChevronDown } from "lucide-react";
import ModelSelect from "#/components/ModelSelect";
import ModelIcon from "#/components/icons/ModelIcon";
import { themeStore } from "#/stores/theme";
import { modelStore } from "#/stores/modelStore";
import { useLegacyPresenter } from "#api/legacy/presenters";
import type { RENDERER_MODEL_META } from "@argos/shared/presenter";

interface SelectedModel {
  providerId: string;
  model: RENDERER_MODEL_META;
}

export default function DefaultModelSettingsSection() {
  const configPresenter = useLegacyPresenter("configPresenter");
  const isDark = useStore(themeStore, (s) => s.isDark);
  const enabledModels = useStore(modelStore, (s) => s.enabledModels);

  const [assistantModelSelectOpen, setAssistantModelSelectOpen] = useState(false);
  const [chatModelSelectOpen, setChatModelSelectOpen] = useState(false);
  const [selectedAssistantModel, setSelectedAssistantModel] = useState<SelectedModel | null>(null);
  const [selectedChatModel, setSelectedChatModel] = useState<SelectedModel | null>(null);
  let isSyncingModelDefaults = false;

  const selectBySetting = (
    setting: { providerId: string; modelId: string } | undefined,
    predicate?: (model: RENDERER_MODEL_META, providerId: string) => boolean,
  ): SelectedModel | null => {
    if (!setting?.providerId || !setting?.modelId) {
      return null;
    }
    const providerEntry = enabledModels.find((item) => item.providerId === setting.providerId);
    if (!providerEntry) {
      return null;
    }
    const matchedModel = providerEntry.models.find(
      (model) => model.id === setting.modelId && (!predicate || predicate(model, setting.providerId)),
    );
    if (!matchedModel) {
      return null;
    }
    return { providerId: setting.providerId, model: matchedModel };
  };

  const persistModelSetting = async (
    key: "assistantModel" | "defaultModel",
    previous: { providerId: string; modelId: string } | undefined,
    current: SelectedModel | null,
  ): Promise<void> => {
    if (!current) {
      return;
    }
    if (previous?.providerId === current.providerId && previous?.modelId === current.model.id) {
      return;
    }
    await configPresenter.setSetting(key, {
      providerId: current.providerId,
      modelId: current.model.id,
    });
  };

  const handleAssistantModelSelect = async (model: RENDERER_MODEL_META, providerId: string) => {
    setSelectedAssistantModel({ providerId, model });
    await configPresenter.setSetting("assistantModel", { providerId, modelId: model.id });
    setAssistantModelSelectOpen(false);
  };

  const handleChatModelSelect = async (model: RENDERER_MODEL_META, providerId: string) => {
    setSelectedChatModel({ providerId, model });
    await configPresenter.setSetting("defaultModel", { providerId, modelId: model.id });
    setChatModelSelectOpen(false);
  };

  const syncModelSelections = async () => {
    if (isSyncingModelDefaults) {
      return;
    }
    isSyncingModelDefaults = true;
    try {
      const assistantModelSetting = (await configPresenter.getSetting("assistantModel")) as
        | { providerId: string; modelId: string }
        | undefined;
      const defaultModelSetting = (await configPresenter.getSetting("defaultModel")) as
        | { providerId: string; modelId: string }
        | undefined;

      const chatSelection = selectBySetting(defaultModelSetting, (_model, providerId) => providerId !== "acp");
      const assistantSelection = selectBySetting(assistantModelSetting, (_model, providerId) => providerId !== "acp");

      setSelectedChatModel(chatSelection);
      setSelectedAssistantModel(assistantSelection);

      await persistModelSetting("defaultModel", defaultModelSetting, chatSelection);
      await persistModelSetting("assistantModel", assistantModelSetting, assistantSelection);
    } catch (error) {
      console.error("Failed to sync model selections:", error);
    } finally {
      isSyncingModelDefaults = false;
    }
  };

  useEffect(() => {
    syncModelSelections();
  }, []);

  useEffect(() => {
    syncModelSelections();
  }, [enabledModels]);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 h-10 text-sm font-medium text-muted-foreground">
        <Icon icon="lucide:sparkles" className="w-4 h-4" />
        <span>Default Model</span>
      </div>

      <div className="flex items-center gap-3 h-10">
        <span className="text-sm font-medium shrink-0 min-w-[220px]">Search assistant model</span>
        <div className="ml-auto flex items-center gap-2">
          <Popover open={assistantModelSelectOpen} onOpenChange={setAssistantModelSelectOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-[320px] justify-between text-sm border-border hover:bg-accent">
                <div className="flex items-center gap-2 min-w-0">
                  {selectedAssistantModel && <ModelIcon modelId={selectedAssistantModel.providerId} isDark={isDark} />}
                  <span className="truncate">{selectedAssistantModel?.model?.name || "Select model"}</span>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="end">
              <ModelSelect
                excludeProviders={["acp"]}
                respectChatMode={false}
                onUpdateModel={handleAssistantModelSelect}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex items-center gap-3 h-10">
        <span className="text-sm font-medium shrink-0 min-w-[220px]">Chat model</span>
        <div className="ml-auto flex items-center gap-2">
          <Popover open={chatModelSelectOpen} onOpenChange={setChatModelSelectOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-[320px] justify-between text-sm border-border hover:bg-accent">
                <div className="flex items-center gap-2 min-w-0">
                  {selectedChatModel && <ModelIcon modelId={selectedChatModel.providerId} isDark={isDark} />}
                  <span className="truncate">{selectedChatModel?.model?.name || "Select model"}</span>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="end">
              <ModelSelect excludeProviders={["acp"]} respectChatMode={false} onUpdateModel={handleChatModelSelect} />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </section>
  );
}
