import { useState, useMemo } from "react";
import { AWS_BEDROCK_PROVIDER, RENDERER_MODEL_META } from "@argos/shared/presenter";
import { useProviderStore } from "#/stores/providerStore";
import { useModelStore } from "#/stores/modelStore";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { Label } from "#shadcn/components/ui/label";
import { Input } from "#shadcn/components/ui/input";
import { Button } from "#shadcn/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { Icon } from "@iconify/react";
import ProviderModelManager from "./ProviderModelManager";
import ProviderDialogContainer from "./ProviderDialogContainer";

interface BedrockProviderSettingsDetailProps {
  provider: AWS_BEDROCK_PROVIDER;
  onProviderConfigured?: () => void;
  onProviderModelEnabled?: () => void;
}

export default function BedrockProviderSettingsDetail({
  provider,
  onProviderConfigured,
  onProviderModelEnabled,
}: BedrockProviderSettingsDetailProps) {
  const providerStore = useProviderStore();
  const modelStore = useModelStore();

  const [accessKeyId, setAccessKeyId] = useState(provider.credential?.accessKeyId || "");
  const [secretAccessKey, setSecretAccessKey] = useState(provider.credential?.secretAccessKey || "");
  const [region, setRegion] = useState(provider.credential?.region || "");
  const [showAccessKeyId, setShowAccessKeyId] = useState(false);
  const [showSecretAccessKey, setShowSecretAccessKey] = useState(false);
  const [checkResult, setCheckResult] = useState(false);
  const [modelToDisable, setModelToDisable] = useState<RENDERER_MODEL_META | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCheckModelDialog, setShowCheckModelDialog] = useState(false);
  const [showDisableAllConfirmDialog, setShowDisableAllConfirmDialog] = useState(false);
  const [showDeleteProviderDialog, setShowDeleteProviderDialog] = useState(false);

  const customModels = useMemo(() => {
    const providerCustomModels = modelStore.customModels.find((entry) => entry.providerId === provider.id);
    return providerCustomModels?.models || [];
  }, [modelStore.customModels, provider.id]);

  const providerModels = useMemo(() => {
    const providerData = modelStore.allProviderModels.find((p) => p.providerId === provider.id);
    if (!providerData) {
      return [];
    }
    return [...providerData.models].sort(
      (a, b) => a.group.localeCompare(b.group) || a.providerId.localeCompare(b.providerId),
    );
  }, [modelStore.allProviderModels, provider.id]);

  // Reset the credential drafts whenever the provider identity changes.
  const [syncedCredentialProvider, setSyncedCredentialProvider] = useState(provider);
  if (syncedCredentialProvider !== provider) {
    setSyncedCredentialProvider(provider);
    setAccessKeyId(provider.credential?.accessKeyId || "");
    setSecretAccessKey(provider.credential?.secretAccessKey || "");
    setRegion(provider.credential?.region || "");
  }

  const isProviderReadyForOnboarding = (p: Pick<AWS_BEDROCK_PROVIDER, "credential" | "enable">) => {
    if (!p.enable) return false;
    const credential = p.credential;
    return Boolean(
      credential?.accessKeyId?.trim() && credential?.secretAccessKey?.trim() && credential?.region?.trim(),
    );
  };

  const maybeEmitProviderConfigured = (p: AWS_BEDROCK_PROVIDER) => {
    if (isProviderReadyForOnboarding(p)) {
      onProviderConfigured?.();
    }
  };

  const enabledModels = useMemo(() => {
    const enabledCustom = customModels.filter((m) => m.enabled);
    const enabledBuiltIn = providerModels.filter((m) => m.enabled);
    const uniqueModels = new Map<string, RENDERER_MODEL_META>();
    const merged = [...enabledCustom, ...enabledBuiltIn];
    merged.forEach((model) => {
      if (!uniqueModels.has(model.id)) {
        uniqueModels.set(model.id, model);
      }
    });
    return Array.from(uniqueModels.values());
  }, [customModels, providerModels]);

  const handleAccessKeyIdChange = async (value: string) => {
    const result = await providerStore.updateAwsBedrockProviderConfig(provider.id, {
      credential: {
        accessKeyId: value,
        secretAccessKey: secretAccessKey,
        region: region,
      },
    });
    maybeEmitProviderConfigured(result.updated as AWS_BEDROCK_PROVIDER);
  };

  const handleSecretAccessKeyChange = async (value: string) => {
    const result = await providerStore.updateAwsBedrockProviderConfig(provider.id, {
      credential: {
        accessKeyId: accessKeyId,
        secretAccessKey: value,
        region: region,
      },
    });
    maybeEmitProviderConfigured(result.updated as AWS_BEDROCK_PROVIDER);
  };

  const handleRegionChange = async (value: string) => {
    const result = await providerStore.updateAwsBedrockProviderConfig(provider.id, {
      credential: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        region: value || undefined,
      },
    });
    maybeEmitProviderConfigured(result.updated as AWS_BEDROCK_PROVIDER);
  };

  const validateCredential = async () => {
    if (!provider.enable) return;
    try {
      const resp = await providerStore.checkProvider(provider.id);
      if (resp.isOk) {
        setCheckResult(true);
        setShowCheckModelDialog(true);
        await modelStore.refreshProviderModels(provider.id);
      } else {
        setCheckResult(false);
        setShowCheckModelDialog(true);
      }
    } catch {
      setCheckResult(false);
      setShowCheckModelDialog(true);
    }
  };

  const handleVerifyCredential = async (updates: Partial<AWS_BEDROCK_PROVIDER>) => {
    const result = await providerStore.updateAwsBedrockProviderConfig(provider.id, updates);
    maybeEmitProviderConfigured(result.updated as AWS_BEDROCK_PROVIDER);
    await validateCredential();
  };

  const confirmDisable = async () => {
    if (modelToDisable) {
      try {
        await modelStore.updateModelStatus(provider.id, modelToDisable.id, false);
      } catch (error) {
        console.error("Failed to disable model:", error);
      }
      setShowConfirmDialog(false);
      setModelToDisable(null);
    }
  };

  const handleModelEnabledChange = async (model: RENDERER_MODEL_META, enabled: boolean, confirm: boolean = false) => {
    if (!enabled && confirm) {
      setModelToDisable(model);
      setShowConfirmDialog(true);
    } else {
      await modelStore.updateModelStatus(provider.id, model.id, enabled);
      if (enabled) {
        onProviderModelEnabled?.();
      }
    }
  };

  const confirmDisableAll = async () => {
    try {
      await modelStore.disableAllModels(provider.id);
      setShowDisableAllConfirmDialog(false);
    } catch (error) {
      console.error("Failed to disable all models:", error);
    }
  };

  // providerModels derive live from the model store, so a config change only
  // needs the store itself to update; there is nothing local to re-read.
  const handleConfigChanged = async () => {};

  const handleAddModelSaved = async () => {
    await modelStore.refreshProviderModels(provider.id);
  };

  return (
    <section className="w-full h-full">
      <ScrollArea className="w-full h-full p-2 flex flex-col gap-2">
        <div className="flex flex-col gap-4 p-2">
          <div className="flex flex-col items-start gap-2">
            <Label htmlFor={`${provider.id}-accessKeyId`} className="flex-1">
              AWS Access Key Id
            </Label>
            <div className="relative w-full">
              <Input
                data-testid="provider-api-key-input"
                id={`${provider.id}-accessKeyId`}
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(String(e.target.value))}
                onBlur={(ev) => void handleAccessKeyIdChange(String((ev.target as HTMLInputElement).value))}
                onKeyUp={(e) => {
                  if (e.key === "Enter") void handleAccessKeyIdChange(accessKeyId);
                }}
                type={showAccessKeyId ? "text" : "password"}
                placeholder="Enter Access Key ID"
                style={{ paddingRight: "2.5rem" }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent"
                onClick={() => setShowAccessKeyId(!showAccessKeyId)}
              >
                <Icon
                  icon={showAccessKeyId ? "lucide:eye-off" : "lucide:eye"}
                  className="w-4 h-4 text-muted-foreground hover:text-foreground"
                />
              </Button>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Label htmlFor={`${provider.id}-secretAccessKey`} className="flex-1">
              AWS Secret Access Key
            </Label>
            <div className="relative w-full">
              <Input
                id={`${provider.id}-secretAccessKey`}
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(String(e.target.value))}
                onBlur={(ev) => void handleSecretAccessKeyChange(String((ev.target as HTMLInputElement).value))}
                onKeyUp={(e) => {
                  if (e.key === "Enter") void handleSecretAccessKeyChange(secretAccessKey);
                }}
                type={showSecretAccessKey ? "text" : "password"}
                placeholder="Enter Secret Access Key"
                style={{ paddingRight: "2.5rem" }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent"
                onClick={() => setShowSecretAccessKey(!showSecretAccessKey)}
              >
                <Icon
                  icon={showSecretAccessKey ? "lucide:eye-off" : "lucide:eye"}
                  className="w-4 h-4 text-muted-foreground hover:text-foreground"
                />
              </Button>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Label htmlFor={`${provider.id}-region`} className="flex-1">
              AWS Region
            </Label>
            <Input
              id={`${provider.id}-region`}
              value={region}
              onChange={(e) => setRegion(String(e.target.value))}
              onBlur={(ev) => void handleRegionChange(String((ev.target as HTMLInputElement).value))}
              onKeyUp={(e) => {
                if (e.key === "Enter") void handleRegionChange(region);
              }}
              placeholder="e.g., us-east-1"
            />
          </div>
          <div className="flex flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-normal rounded-lg"
              disabled={!provider.enable}
              onClick={() =>
                void handleVerifyCredential({
                  credential: { accessKeyId, secretAccessKey, region },
                })
              }
            >
              <Icon icon="lucide:check-check" className="w-4 h-4 text-muted-foreground" />
              Verify
            </Button>
            <Tooltip>
              <TooltipTrigger>
                <Icon icon="lucide:help-circle" className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Verifies your AWS credentials and lists available Bedrock models.</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="text-xs leading-4 text-muted-foreground">
            AWS Bedrock may have limited model availability depending on your region and account.
          </div>

          <ProviderModelManager
            provider={provider}
            enabledModels={enabledModels}
            totalModelsCount={providerModels.length + customModels.length}
            providerModels={providerModels}
            customModels={customModels}
            onCustomModelAdded={() => void handleAddModelSaved()}
            onModelEnabledChange={handleModelEnabledChange}
            onConfigChanged={() => void handleConfigChanged()}
          />
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
        onConfirmDeleteProvider={() => {}}
      />
    </section>
  );
}
