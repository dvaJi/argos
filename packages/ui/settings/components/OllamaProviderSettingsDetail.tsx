import { useState, useEffect, useMemo, useCallback } from "react";
import { Label } from "#shadcn/components/ui/label";
import { Input } from "#shadcn/components/ui/input";
import { Button } from "#shadcn/components/ui/button";
import { Progress } from "#shadcn/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { Icon } from "@iconify/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { useModelStore } from "#/stores/modelStore";
import { useOllamaStore } from "#/stores/ollamaStore";
import { useProviderStore } from "#/stores/providerStore";
import { useModelCheckStore } from "#/stores/modelCheck";
import { createModelClient } from "../../api/ModelClient";
import type { LLM_PROVIDER, MODEL_META, OllamaModel, RENDERER_MODEL_META } from "@argos/shared/presenter";
import ModelConfigItem from "#/components/settings/ModelConfigItem";
import { ModelType } from "@argos/shared/model";

interface OllamaProviderSettingsDetailProps {
  provider: LLM_PROVIDER;
  onProviderConfigured?: () => void;
  onProviderModelEnabled?: () => void;
}

export default function OllamaProviderSettingsDetail({
  provider,
  onProviderConfigured,
  onProviderModelEnabled,
}: OllamaProviderSettingsDetailProps) {
  const modelStore = useModelStore();
  const ollamaStore = useOllamaStore();
  const providerStore = useProviderStore();
  const modelCheckStore = useModelCheckStore();
  const modelClient = createModelClient();

  const [apiHost, setApiHost] = useState(provider.baseUrl || "");
  const [apiKey, setApiKey] = useState(provider.apiKey || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPullModelDialog, setShowPullModelDialog] = useState(false);
  const [showCheckModelDialog, setShowCheckModelDialog] = useState(false);
  const [checkResult, setCheckResult] = useState(false);
  const [showDeleteProviderDialog, setShowDeleteProviderDialog] = useState(false);
  const [pullModelCatalog, setPullModelCatalog] = useState<MODEL_META[]>([]);
  const [isPullModelCatalogLoading, setIsPullModelCatalogLoading] = useState(false);

  const defaultBaseUrl = "http://127.0.0.1:11434";
  const hasDefaultBaseUrl = defaultBaseUrl.length > 0;

  const isProviderReadyForOnboarding = (p: Pick<LLM_PROVIDER, "apiKey" | "baseUrl" | "custom" | "enable">) => {
    if (!p.enable) return false;
    if (!(p.apiKey?.trim().length > 0)) return false;
    if (p.custom) return Boolean(p.baseUrl?.trim());
    return true;
  };

  const maybeEmitProviderConfigured = (p: LLM_PROVIDER) => {
    if (isProviderReadyForOnboarding(p)) {
      onProviderConfigured?.();
    }
  };

  const runningModels = useMemo(() => ollamaStore.getOllamaRunningModels(provider.id), [ollamaStore, provider.id]);
  const localModels = useMemo(() => ollamaStore.getOllamaLocalModels(provider.id), [ollamaStore, provider.id]);
  const pullingModels = useMemo(
    () => new Map(Object.entries(ollamaStore.getOllamaPullingModels(provider.id))),
    [ollamaStore, provider.id],
  );
  const providerCatalogModels = useMemo<MODEL_META[]>(
    () =>
      (modelStore.allProviderModels.find((p) => p.providerId === provider.id)?.models ?? []) as unknown as MODEL_META[],
    [modelStore.allProviderModels, provider.id],
  );

  const providerModelMetas = useMemo<RENDERER_MODEL_META[]>(() => {
    const localModelNames = new Set(localModels.map((model) => model.name));
    const catalogModelNames = new Set(providerCatalogModels.map((model) => model.id));
    const installedModelNames = localModelNames.size > 0 ? localModelNames : catalogModelNames;
    const providerEntry = modelStore.allProviderModels.find((item) => item.providerId === provider.id);
    const metaMap = new Map<string, RENDERER_MODEL_META>();

    for (const model of providerEntry?.models ?? []) {
      if (installedModelNames.has(model.id)) {
        metaMap.set(model.id, model);
      }
    }

    for (const model of providerCatalogModels) {
      if (!installedModelNames.has(model.id) || metaMap.has(model.id)) {
        continue;
      }

      metaMap.set(model.id, {
        id: model.id,
        name: model.name || model.id,
        group: model.group || "default",
        providerId: provider.id,
        enabled: (model as RENDERER_MODEL_META).enabled ?? true,
        isCustom: model.isCustom ?? false,
        contextLength: model.contextLength ?? 4096,
        maxTokens: model.maxTokens ?? 2048,
        vision: model.vision ?? false,
        functionCall: model.functionCall ?? false,
        explicitFunctionCall: (model as RENDERER_MODEL_META).explicitFunctionCall,
        reasoning: model.reasoning ?? false,
        enableSearch: (model as RENDERER_MODEL_META).enableSearch ?? false,
        type: (model.type ?? ModelType.Chat) as ModelType,
        supportedEndpointTypes: model.supportedEndpointTypes,
        endpointType: model.endpointType,
      });
    }

    return Array.from(metaMap.values());
  }, [localModels, providerCatalogModels, modelStore, provider.id]);

  const createFallbackLocalModel = useCallback(
    (meta: RENDERER_MODEL_META): OllamaModel => ({
      name: meta.id,
      model: meta.id,
      modified_at: new Date(),
      size: 0,
      digest: "",
      details: {
        format: "",
        family: "",
        families: [],
        parameter_size: "",
        quantization_level: "",
      },
      model_info: {
        context_length: meta.contextLength ?? 0,
        embedding_length: 0,
      },
      capabilities: [
        meta.type === ModelType.Embedding ? "embedding" : "completion",
        ...(meta.vision ? ["vision"] : []),
        ...(meta.functionCall ? ["tools"] : []),
        ...(meta.reasoning ? ["thinking"] : []),
      ],
    }),
    [],
  );

  const effectiveLocalModels = useMemo<OllamaModel[]>(() => {
    if (localModels.length > 0) {
      return localModels;
    }

    return providerCatalogModels.map((model) =>
      createFallbackLocalModel(
        providerModelMetas.find((meta) => meta.id === model.id) ?? {
          id: model.id,
          name: model.name || model.id,
          group: model.group || "default",
          providerId: provider.id,
          enabled: true,
          isCustom: model.isCustom ?? false,
          contextLength: model.contextLength ?? 4096,
          maxTokens: model.maxTokens ?? 2048,
          vision: model.vision ?? false,
          functionCall: model.functionCall ?? false,
          explicitFunctionCall: (model as RENDERER_MODEL_META).explicitFunctionCall,
          reasoning: model.reasoning ?? false,
          enableSearch: (model as RENDERER_MODEL_META).enableSearch ?? false,
          type: (model.type ?? ModelType.Chat) as ModelType,
          supportedEndpointTypes: model.supportedEndpointTypes,
          endpointType: model.endpointType,
        },
      ),
    );
  }, [localModels, providerCatalogModels, providerModelMetas, createFallbackLocalModel, provider.id]);

  type PullModelCatalogItem = { name: string };
  const availableModels = useMemo<PullModelCatalogItem[]>(() => {
    const localModelNames = new Set(effectiveLocalModels.map((model) => model.name));
    const pullingModelNames = new Set(Array.from(pullingModels.keys()));
    const seenModelNames = new Set<string>();

    return pullModelCatalog
      .map((model) => model.id || model.name)
      .filter((modelName): modelName is string => Boolean(modelName))
      .filter((modelName) => {
        if (seenModelNames.has(modelName)) return false;
        seenModelNames.add(modelName);
        return !localModelNames.has(modelName) && !pullingModelNames.has(modelName);
      })
      .map((modelName) => ({ name: modelName }));
  }, [effectiveLocalModels, pullingModels, pullModelCatalog]);

  const displayLocalModels = useMemo(() => {
    const metaMap = new Map<string, RENDERER_MODEL_META & { ollamaModel?: any }>(
      providerModelMetas.map((meta) => [meta.id, meta as RENDERER_MODEL_META & { ollamaModel?: any }]),
    );

    const models = effectiveLocalModels.map((model: any) => {
      const meta = metaMap.get(model.name);
      const capabilitySources: string[] = [];
      if (Array.isArray(model?.capabilities)) {
        capabilitySources.push(...model.capabilities);
      }
      if (meta?.ollamaModel && Array.isArray(meta.ollamaModel?.capabilities)) {
        capabilitySources.push(...(meta.ollamaModel.capabilities as string[]));
      }
      const capabilitySet = new Set(capabilitySources);

      const resolvedType = meta?.type ?? (capabilitySet.has("embedding") ? ModelType.Embedding : ModelType.Chat);

      return {
        ...model,
        meta,
        pulling: pullingModels.has(model.name),
        progress: pullingModels.get(model.name) || 0,
        enabled: meta?.enabled ?? true,
        vision: meta?.vision ?? capabilitySet.has("vision"),
        functionCall: meta?.functionCall ?? capabilitySet.has("tools"),
        explicitFunctionCall: meta?.explicitFunctionCall ?? (capabilitySet.has("tools") ? true : undefined),
        reasoning: meta?.reasoning ?? capabilitySet.has("thinking"),
        enableSearch: meta?.enableSearch ?? false,
        type: resolvedType,
      };
    });

    for (const [modelName, progress] of pullingModels.entries()) {
      if (!models.some((m: any) => m.name === modelName)) {
        const meta = metaMap.get(modelName);
        const capabilitySources: string[] = [];
        if (meta?.ollamaModel && Array.isArray(meta.ollamaModel?.capabilities)) {
          capabilitySources.push(...(meta.ollamaModel.capabilities as string[]));
        }
        const capabilitySet = new Set(capabilitySources);
        const resolvedType = meta?.type ?? (capabilitySet.has("embedding") ? ModelType.Embedding : ModelType.Chat);

        models.unshift({
          name: modelName,
          model: modelName,
          modified_at: new Date(),
          size: 0,
          digest: "",
          details: {
            format: "",
            family: "",
            families: [],
            parameter_size: "",
            quantization_level: "",
          },
          model_info: {
            context_length: meta?.contextLength ?? 0,
            embedding_length: 0,
          },
          capabilities: [],
          pulling: true,
          progress,
          meta,
          enabled: meta?.enabled ?? true,
          vision: meta?.vision ?? capabilitySet.has("vision"),
          functionCall: meta?.functionCall ?? capabilitySet.has("tools"),
          explicitFunctionCall: meta?.explicitFunctionCall ?? (capabilitySet.has("tools") ? true : undefined),
          reasoning: meta?.reasoning ?? capabilitySet.has("thinking"),
          enableSearch: meta?.enableSearch ?? false,
          type: resolvedType,
        });
      }
    }

    return models.sort((a: any, b: any) => {
      if (a.pulling && !b.pulling) return -1;
      if (!a.pulling && b.pulling) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [effectiveLocalModels, providerModelMetas, pullingModels]);

  useEffect(() => {
    void ollamaStore.ensureProviderReady(provider.id);
  }, [provider.id]);

  const loadPullModelCatalog = async () => {
    if (isPullModelCatalogLoading) return;
    setIsPullModelCatalogLoading(true);
    try {
      const models = await modelClient.getDbProviderModels(provider.id);
      setPullModelCatalog(models);
    } catch {
      setPullModelCatalog([]);
    } finally {
      setIsPullModelCatalogLoading(false);
    }
  };

  const refreshModels = async () => {
    await ollamaStore.refreshOllamaModels(provider.id);
  };

  const pullModel = async (modelName: string) => {
    try {
      const success = await ollamaStore.pullOllamaModel(provider.id, modelName);
      if (success) {
        setShowPullModelDialog(false);
      }
    } catch (error) {
      console.error(`Failed to pull model ${modelName}:`, error);
    }
  };

  const handleDeleteModel = async (modelName: string) => {
    try {
      await modelClient.removeCustomModel(provider.id, modelName);
      await refreshModels();
    } catch (error) {
      console.error(`Failed to delete model ${modelName}:`, error);
    }
  };

  const handleModelEnabledChange = async (modelName: string, enabled: boolean) => {
    try {
      await modelStore.updateModelStatus(provider.id, modelName, enabled);
      if (enabled) {
        onProviderModelEnabled?.();
      }
    } catch (error) {
      console.error(`Failed to update model status for ${modelName}:`, error);
    }
  };

  const formatModelSize = (sizeInBytes: number): string => {
    if (!sizeInBytes) return "";
    const GB = 1024 * 1024 * 1024;
    if (sizeInBytes >= GB) return `${(sizeInBytes / GB).toFixed(2)} GB`;
    const MB = 1024 * 1024;
    if (sizeInBytes >= MB) return `${(sizeInBytes / MB).toFixed(2)} MB`;
    const KB = 1024;
    return `${(sizeInBytes / KB).toFixed(2)} KB`;
  };

  const isModelLocal = (modelName: string): boolean => {
    return (
      ollamaStore.isOllamaModelLocal(provider.id, modelName) || providerModelMetas.some((meta) => meta.id === modelName)
    );
  };

  const handleApiHostChange = async (value: string) => {
    const result = await providerStore.updateProviderApi(provider.id, undefined, value);
    maybeEmitProviderConfigured(result.updated as LLM_PROVIDER);
  };

  const fillDefaultBaseUrl = async () => {
    if (!hasDefaultBaseUrl) return;
    setApiHost(defaultBaseUrl);
    await handleApiHostChange(defaultBaseUrl);
  };

  const handleApiKeyChange = async (value: string) => {
    const result = await providerStore.updateProviderApi(provider.id, value, undefined);
    maybeEmitProviderConfigured(result.updated as LLM_PROVIDER);
  };

  const handleApiKeyEnter = async (value: string) => {
    const inputElement = document.getElementById(`${provider.id}-apikey`);
    if (inputElement) {
      inputElement.blur();
    }
    const result = await providerStore.updateProviderApi(provider.id, value, undefined);
    maybeEmitProviderConfigured(result.updated as LLM_PROVIDER);
    await validateApiKey();
  };

  const validateApiKey = async () => {
    if (!provider.enable) return;
    try {
      const resp = await providerStore.checkProvider(provider.id);
      if (resp.isOk) {
        setCheckResult(true);
        setShowCheckModelDialog(true);
        await refreshModels();
      } else {
        setCheckResult(false);
        setShowCheckModelDialog(true);
      }
    } catch (error) {
      console.error("Failed to validate API key:", error);
      setCheckResult(false);
      setShowCheckModelDialog(true);
    }
  };

  const openModelCheckDialog = () => {
    if (!provider.enable) return;
    modelCheckStore.openDialog(provider.id);
  };

  const confirmDeleteProvider = async () => {
    try {
      await providerStore.removeProvider(provider.id);
      setShowDeleteProviderDialog(false);
    } catch (error) {
      console.error("Failed to delete provider:", error);
    }
  };

  useEffect(() => {
    setApiHost(provider.baseUrl || "");
    setApiKey(provider.apiKey || "");
    void ollamaStore.ensureProviderReady(provider.id);
  }, [provider]);

  return (
    <section className="w-full h-full">
      <div className="w-full h-full p-2 flex flex-col gap-2 overflow-y-auto">
        <div className="flex flex-col items-start p-2 gap-2">
          <div className="flex justify-between items-center w-full">
            <Label htmlFor={`${provider.id}-url`} className="flex-1">
              API URL
            </Label>
            {provider.custom && (
              <Button
                variant="destructive"
                size="sm"
                className="text-xs rounded-lg"
                onClick={() => setShowDeleteProviderDialog(true)}
              >
                <Icon icon="lucide:trash-2" className="w-4 h-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
          <Input
            id={`${provider.id}-url`}
            value={apiHost}
            onChange={(e) => setApiHost(e.target.value)}
            onBlur={(e) => void handleApiHostChange(String((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => {
              if (e.key === "Enter") void handleApiHostChange(apiHost);
            }}
            placeholder="Enter API URL"
          />
          <div className="text-xs text-muted-foreground">
            {hasDefaultBaseUrl ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                      aria-label="Fill default URL"
                      onClick={() => void fillDefaultBaseUrl()}
                    />
                  }
                >
                  Default: {defaultBaseUrl}
                </TooltipTrigger>
                <TooltipContent>Fill with default base URL</TooltipContent>
              </Tooltip>
            ) : (
              <span>Default: {defaultBaseUrl}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start p-2 gap-2">
          <Label htmlFor={`${provider.id}-apikey`} className="flex-1">
            API Key
          </Label>
          <div className="relative w-full">
            <Input
              data-testid="provider-api-key-input"
              id={`${provider.id}-apikey`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={(e) => void handleApiKeyChange(String((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => {
                if (e.key === "Enter") void handleApiKeyEnter(apiKey);
              }}
              type={showApiKey ? "text" : "password"}
              placeholder="Enter API Key"
              style={{ paddingRight: "2.5rem" }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              <Icon
                icon={showApiKey ? "lucide:eye-off" : "lucide:eye"}
                className="w-4 h-4 text-muted-foreground hover:text-foreground"
              />
            </Button>
          </div>
          <div className="flex flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-normal rounded-lg"
              disabled={!provider.enable}
              onClick={openModelCheckDialog}
            >
              <Icon icon="lucide:check-check" className="w-4 h-4 text-muted-foreground" />
              Verify
            </Button>
          </div>
        </div>

        <div className="flex flex-col items-start p-2 gap-2">
          <Label htmlFor={`${provider.id}-model`} className="flex-1">
            Model List
          </Label>
          <div className="flex flex-row gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-normal rounded-lg"
              onClick={() => {
                setShowPullModelDialog(true);
                void loadPullModelCatalog();
              }}
            >
              <Icon icon="lucide:download" className="w-4 h-4 text-muted-foreground" />
              Pull Models
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-normal rounded-lg"
              onClick={() => void refreshModels()}
            >
              <Icon icon="lucide:refresh-cw" className="w-4 h-4 text-muted-foreground" />
              Refresh
            </Button>
            <span className="text-xs text-muted-foreground">
              {runningModels.length}/{effectiveLocalModels.length} running
            </span>
          </div>

          <div className="flex flex-col w-full gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Running Models</h3>
            <div className="flex flex-col w-full border overflow-hidden rounded-lg">
              {runningModels.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No running models</div>
              ) : (
                runningModels.map((model) => (
                  <div
                    key={model.name}
                    className="flex flex-row items-center justify-between p-2 border-b last:border-b-0 hover:bg-accent"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{model.name}</span>
                      <span className="text-xs text-muted-foreground">{formatModelSize(model.size)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col w-full gap-2 mt-2">
            <h3 className="text-sm font-medium text-muted-foreground">Local Models</h3>
            <div className="flex flex-col w-full border overflow-hidden rounded-lg">
              {displayLocalModels.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No local models</div>
              ) : (
                displayLocalModels.map((model: any) => (
                  <div key={model.name} className="border-b last:border-b-0">
                    {!model.pulling ? (
                      <ModelConfigItem
                        modelName={model.name}
                        modelId={model.meta?.id ?? model.name}
                        providerId={provider.id}
                        type={model.type}
                        enabled={model.enabled}
                        vision={model.vision}
                        functionCall={model.functionCall}
                        explicitFunctionCall={model.explicitFunctionCall}
                        reasoning={model.reasoning}
                        enableSearch={model.enableSearch}
                        supportedEndpointTypes={model.meta?.supportedEndpointTypes}
                        endpointType={model.meta?.endpointType}
                        hideEnableToggle={true}
                        onEnabledChange={(enabled: boolean) => void handleModelEnabledChange(model.name, enabled)}
                        onDeleteModel={() => void handleDeleteModel(model.name)}
                        onConfigChanged={() => void refreshModels()}
                      />
                    ) : (
                      <div className="flex flex-row items-center justify-between p-2 hover:bg-accent">
                        <div className="flex flex-col grow">
                          <div className="flex flex-row items-center gap-1">
                            <span className="text-sm font-medium">{model.name}</span>
                            <span className="text-xs text-primary-foreground bg-primary px-1 py-0.5 rounded">
                              Pulling
                            </span>
                            <span className="w-[50px]">
                              <Progress value={pullingModels.get(model.name)} className="h-1.5" />
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">{formatModelSize(model.size)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showPullModelDialog} onOpenChange={setShowPullModelDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pull Model</DialogTitle>
            <DialogDescription>Select a model to pull from the Ollama registry.</DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-80 overflow-y-auto">
            <div className="grid grid-cols-1 gap-2">
              {availableModels.map((model) => (
                <div
                  key={model.name}
                  className={`flex flex-row items-center justify-between p-2 border rounded-lg hover:bg-accent ${
                    isModelLocal(model.name) ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{model.name}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs rounded-lg"
                    disabled={isModelLocal(model.name)}
                    onClick={() => void pullModel(model.name)}
                  >
                    <Icon icon="lucide:download" className="w-3.5 h-3.5 mr-1" />
                    Pull
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPullModelDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCheckModelDialog} onOpenChange={setShowCheckModelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{checkResult ? "Verification Successful" : "Verification Failed"}</DialogTitle>
            <DialogDescription>
              {checkResult
                ? "Your API key has been verified successfully."
                : "API key verification failed. Please check your key and try again."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckModelDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteProviderDialog} onOpenChange={setShowDeleteProviderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Provider</DialogTitle>
            <DialogDescription>Are you sure you want to delete &quot;{provider.name}&quot;?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteProviderDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDeleteProvider()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
