import { useState, useEffect, useRef } from "react";
import { useProviderStore } from "#/stores/providerStore";
import { useModelStore } from "#/stores/modelStore";
import { useUiSettingsStore } from "#/stores/uiSettingsStore";
import type { LLM_PROVIDER, RENDERER_MODEL_META, VERTEX_PROVIDER } from "@argos/shared/presenter";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import ProviderApiConfig from "./ProviderApiConfig";
import AzureProviderConfig from "./AzureProviderConfig";
import GeminiSafetyConfig from "./GeminiSafetyConfig";
import VertexProviderSettingsDetail from "./VertexProviderSettingsDetail";
import ProviderRateLimitConfig from "./ProviderRateLimitConfig";
import ModelScopeMcpSync from "./ModelScopeMcpSync";
import ProviderModelManager from "./ProviderModelManager";
import ProviderDialogContainer from "./ProviderDialogContainer";
import { useModelCheckStore } from "#/stores/modelCheck";
import { levelToValueMap, safetyCategories } from "#/lib/gemini";
import type { SafetyCategoryKey, SafetySettingValue } from "#/lib/gemini";
import VoiceAIProviderConfig from "./VoiceAIProviderConfig";
import { Badge } from "#shadcn/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#shadcn/components/ui/tabs";
interface ProviderWebsites {
  official: string;
  apiKey: string;
  docs: string;
  models: string;
  defaultBaseUrl: string;
}
const valueToLevelMap: Record<SafetySettingValue, number> = {
  BLOCK_NONE: 0,
  BLOCK_LOW_AND_ABOVE: 1,
  BLOCK_MEDIUM_AND_ABOVE: 2,
  BLOCK_ONLY_HIGH: 3,
  HARM_BLOCK_THRESHOLD_UNSPECIFIED: 2,
};
interface ModelProviderSettingsDetailProps {
  provider: LLM_PROVIDER;
  activeOnboardingStepId?: string | null;
  onProviderConfigured?: () => void;
  onProviderModelEnabled?: () => void;
}
const emptyModels: RENDERER_MODEL_META[] = [];
export default function ModelProviderSettingsDetail({
  provider,
  activeOnboardingStepId,
  onProviderConfigured,
  onProviderModelEnabled,
}: ModelProviderSettingsDetailProps) {
  const providerStore = useProviderStore();
  const modelStore = useModelStore();
  const uiSettingsStore = useUiSettingsStore();
  const modelCheckStore = useModelCheckStore();
  const [azureApiVersion, setAzureApiVersion] = useState("");
  const [geminiSafetyLevels, setGeminiSafetyLevels] = useState<Record<string, number>>({});
  const [providerModels, setProviderModels] = useState<RENDERER_MODEL_META[]>([]);
  const [customModels, setCustomModels] = useState<RENDERER_MODEL_META[]>([]);
  const [isModelListLoading, setIsModelListLoading] = useState(true);
  const [hasInitializedModelList, setHasInitializedModelList] = useState(false);
  const [modelToDisable, setModelToDisable] = useState<RENDERER_MODEL_META | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDisableAllConfirmDialog, setShowDisableAllConfirmDialog] = useState(false);
  const [showDeleteProviderDialog, setShowDeleteProviderDialog] = useState(false);
  const [checkResult, setCheckResult] = useState(false);
  const [showCheckModelDialog, setShowCheckModelDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<"connection" | "models" | "advanced">("connection");
  const enabledModels = (() => {
    const enabledModelsList = [...customModels.filter((m) => m.enabled), ...providerModels.filter((m) => m.enabled)];
    const uniqueModels = new Map<string, RENDERER_MODEL_META>();
    enabledModelsList.forEach((model) => {
      if (!uniqueModels.has(model.id)) {
        uniqueModels.set(model.id, model);
      }
    });
    return Array.from(uniqueModels.values());
  })();
  const providerWebsites = providerStore.defaultProviders.find((p) => p.id === provider.id)?.websites as
    | ProviderWebsites
    | undefined;
  const providerModelsSource =
    modelStore.allProviderModels.find((p) => p.providerId === provider.id)?.models ?? emptyModels;
  const customModelsSource = modelStore.customModels.find((p) => p.providerId === provider.id)?.models ?? emptyModels;
  const isProviderReadyForOnboarding = (p: Pick<LLM_PROVIDER, "apiKey" | "baseUrl" | "custom" | "enable">) => {
    if (!p.enable) return false;
    if (!(p.apiKey?.trim().length > 0)) return false;
    if (p.custom) return Boolean(p.baseUrl?.trim());
    return true;
  };
  const maybeEmitProviderConfigured = (prov: LLM_PROVIDER) => {
    if (isProviderReadyForOnboarding(prov)) {
      onProviderConfigured?.();
    }
  };
  const syncModels = () => {
    if (!hasInitializedModelList) {
      setIsModelListLoading(true);
    }
    setProviderModels(providerModelsSource);
    setCustomModels(customModelsSource);
    if (!hasInitializedModelList) {
      setHasInitializedModelList(true);
    }
    setIsModelListLoading(false);
  };
  useEffect(() => {
    void Promise.resolve().then(() => syncModels());
  }, [syncModels]);
  const initProviderSettings = async (providerId: string) => {
    await providerStore.ensureDefaultProvidersReady();
    if (providerId === "azure-openai") {
      try {
        const version = await providerStore.getAzureApiVersion();
        setAzureApiVersion(version);
      } catch (error) {
        console.error("Failed to fetch Azure API Version:", error);
        setAzureApiVersion("2024-02-01");
      }
    }
    if (providerId === "gemini") {
      const categoryKeys = Object.keys(safetyCategories);
      const savedValues = await Promise.all(
        categoryKeys.map((categoryKey) =>
          providerStore
            .getGeminiSafety(categoryKey)
            .then((v) => ({ categoryKey, savedValue: v as string }))
            .catch((err) => {
              console.error(`Failed to fetch Gemini safety setting for ${categoryKey}:`, err);
              return { categoryKey, savedValue: null as string | null };
            }),
        ),
      );
      const newLevels: Record<string, number> = {};
      for (const { categoryKey, savedValue } of savedValues) {
        newLevels[categoryKey] =
          valueToLevelMap[savedValue as SafetySettingValue] ??
          safetyCategories[categoryKey as SafetyCategoryKey].defaultLevel;
      }
      setGeminiSafetyLevels(newLevels);
    }
  };
  const initProviderSettingsRef = useRef(initProviderSettings);
  useEffect(() => {
    initProviderSettingsRef.current = initProviderSettings;
  }, [initProviderSettings]);
  useEffect(() => {
    void Promise.resolve().then(() => {
      setActiveTab(activeOnboardingStepId === "provider-model" ? "models" : "connection");
    });
    void initProviderSettingsRef.current(provider.id);
  }, [activeOnboardingStepId, provider.id]);
  const handleApiKeyChange = async (value: string) => {
    const result = await providerStore.updateProviderApi(provider.id, value, undefined);
    maybeEmitProviderConfigured(result.updated as LLM_PROVIDER);
  };
  const handleApiHostChange = async (value: string) => {
    const result = await providerStore.updateProviderApi(provider.id, undefined, value);
    maybeEmitProviderConfigured(result.updated as LLM_PROVIDER);
  };
  const handleModelEnabledChange = async (model: RENDERER_MODEL_META, enabled: boolean, confirm: boolean = false) => {
    if (!enabled && confirm) {
      setModelToDisable(model);
      setShowConfirmDialog(true);
      return;
    }
    await modelStore.updateModelStatus(provider.id, model.id, enabled);
    if (enabled) {
      onProviderModelEnabled?.();
    }
  };
  const confirmDisable = async () => {
    if (!modelToDisable) return;
    try {
      await modelStore.updateModelStatus(provider.id, modelToDisable.id, false);
    } catch (error) {
      console.error("Failed to disable model:", error);
    }
    setShowConfirmDialog(false);
    setModelToDisable(null);
  };
  const confirmDisableAll = async () => {
    try {
      await modelStore.disableAllModels(provider.id);
      setShowDisableAllConfirmDialog(false);
    } catch (error) {
      console.error("Failed to disable all models:", error);
    }
  };
  const confirmDeleteProvider = async () => {
    try {
      await providerStore.removeProvider(provider.id);
      setShowDeleteProviderDialog(false);
    } catch (error) {
      console.error("Failed to delete provider:", error);
    }
  };
  const handleAzureApiVersionChange = async (value: string) => {
    const trimmedValue = value.trim();
    if (trimmedValue) {
      setAzureApiVersion(trimmedValue);
      await providerStore.setAzureApiVersion(trimmedValue);
    }
  };
  const handleSafetySettingChange = async (key: SafetyCategoryKey, level: number) => {
    const value = levelToValueMap[level];
    if (value) {
      setGeminiSafetyLevels((prev) => ({
        ...prev,
        [key]: level,
      }));
      await providerStore.setGeminiSafety(key, value);
    }
  };
  const handleOAuthSuccess = async () => {
    await initProviderSettings(provider.id);
    syncModels();
    const resp = await providerStore.checkProvider(provider.id);
    if (resp.isOk) {
      onProviderConfigured?.();
    }
  };
  const handleOAuthError = (error: string) => {
    console.error("OAuth authentication failed:", error);
  };
  const handleConfigChanged = () => {
    return modelStore.refreshProviderModels(provider.id);
  };
  const openModelCheckDialog = () => {
    if (!provider.enable) return;
    modelCheckStore.openDialog(provider.id);
  };
  const handleAddModelSaved = () => modelStore.refreshProviderModels(provider.id);
  const geminiSafetyLevelsForChild = {
    ...geminiSafetyLevels,
  };
  return (
    <section className="w-full h-full">
      <ScrollArea className="w-full h-full">
        <div className="flex flex-col gap-4 p-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{provider.name}</h2>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {provider.baseUrl || "No API URL configured"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Badge variant="outline">{enabledModels.length} models enabled</Badge>
              </div>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger data-testid="provider-connection-tab-trigger" value="connection">
                Connection
              </TabsTrigger>
              <TabsTrigger data-testid="provider-models-tab-trigger" value="models">
                Models
              </TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="connection" className="mt-0">
              <ProviderApiConfig
                provider={provider}
                providerWebsites={providerWebsites}
                onApiHostChange={handleApiHostChange}
                onApiKeyChange={handleApiKeyChange}
                onValidateKey={openModelCheckDialog}
                onDeleteProvider={() => setShowDeleteProviderDialog(true)}
                onOAuthSuccess={handleOAuthSuccess}
                onOAuthError={handleOAuthError}
              />
            </TabsContent>

            <TabsContent value="models" className="mt-0">
              <ProviderModelManager
                data-testid="provider-model-manager"
                provider={provider}
                enabledModels={enabledModels}
                totalModelsCount={providerModels.length + customModels.length}
                providerModels={providerModels}
                customModels={customModels}
                isModelListLoading={isModelListLoading}
                onCustomModelAdded={handleAddModelSaved}
                onModelEnabledChange={handleModelEnabledChange}
                onConfigChanged={handleConfigChanged}
              />
            </TabsContent>

            <TabsContent value="advanced" className="mt-0">
              <div className="flex flex-col gap-4">
                <ProviderRateLimitConfig provider={provider} onConfigChanged={handleConfigChanged} />

                {provider.apiType === "vertex" && (
                  <VertexProviderSettingsDetail
                    provider={provider as VERTEX_PROVIDER}
                    onConfigUpdated={handleConfigChanged}
                    onValidateProvider={async () => {
                      if (!provider.enable) return;
                      try {
                        const resp = await providerStore.checkProvider(provider.id);
                        setCheckResult(resp.isOk);
                        setShowCheckModelDialog(true);
                        if (resp.isOk) await modelStore.refreshProviderModels(provider.id);
                      } catch {
                        setCheckResult(false);
                        setShowCheckModelDialog(true);
                      }
                    }}
                  />
                )}

                {provider.id === "azure-openai" && (
                  <AzureProviderConfig
                    provider={provider}
                    initialValue={azureApiVersion}
                    onApiVersionChange={handleAzureApiVersionChange}
                  />
                )}

                {provider.id === "gemini" && (
                  <GeminiSafetyConfig
                    provider={provider}
                    initialSafetyLevels={geminiSafetyLevelsForChild}
                    onSafetySettingChange={handleSafetySettingChange}
                  />
                )}

                {provider.id === "voiceai" && <VoiceAIProviderConfig provider={provider} />}

                {provider.id === "modelscope" && <ModelScopeMcpSync provider={provider} />}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      <ProviderDialogContainer
        provider={provider}
        modelToDisable={modelToDisable}
        checkResult={checkResult}
        showConfirmDialog={showConfirmDialog}
        showCheckModelDialog={showCheckModelDialog}
        showDisableAllConfirmDialog={showDisableAllConfirmDialog}
        showDeleteProviderDialog={showDeleteProviderDialog}
        onShowConfirmDialogChange={setShowConfirmDialog}
        onShowCheckModelDialogChange={setShowCheckModelDialog}
        onShowDisableAllConfirmDialogChange={setShowDisableAllConfirmDialog}
        onShowDeleteProviderDialogChange={setShowDeleteProviderDialog}
        onConfirmDisableModel={confirmDisable}
        onConfirmDisableAllModels={confirmDisableAll}
        onConfirmDeleteProvider={confirmDeleteProvider}
      />
    </section>
  );
}
