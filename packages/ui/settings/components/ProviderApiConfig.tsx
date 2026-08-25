import { useState, useEffect, useCallback, type FocusEvent } from "react";
import { Label } from "#shadcn/components/ui/label";
import { Input } from "#shadcn/components/ui/input";
import { Button } from "#shadcn/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { Icon } from "@iconify/react";
import GitHubCopilotOAuth from "./GitHubCopilotOAuth";
import { createProviderClient } from "#api/ProviderClient";
import { useToast } from "#/components/use-toast";
import { useModelCheckStore } from "#/stores/modelCheck";
import type { LLM_PROVIDER, KeyStatus } from "@argos/shared/presenter";
import { isProviderDbBackedProvider } from "@argos/shared/providerDeeplink";

const providerClient = createProviderClient();

interface ProviderWebsites {
  official: string;
  apiKey: string;
  docs: string;
  models: string;
  defaultBaseUrl: string;
}

interface ProviderApiConfigProps {
  provider: LLM_PROVIDER;
  providerWebsites?: ProviderWebsites;
  onApiHostChange?: (value: string) => void;
  onApiKeyChange?: (value: string) => void;
  onValidateKey?: (value: string) => void;
  onDeleteProvider?: () => void;
  onOAuthSuccess?: () => void;
  onOAuthError?: (error: string) => void;
}

const EDITABLE_BASE_URL_PROVIDER_IDS = new Set([
  "openai",
  "openai-responses",
  "new-api",
  "anthropic",
  "gemini",
  "ollama",
  "lmstudio",
  "azure-openai",
  "vertex",
]);

export default function ProviderApiConfig({
  provider,
  providerWebsites,
  onApiHostChange,
  onApiKeyChange,
  onValidateKey,
  onDeleteProvider,
  onOAuthSuccess,
  onOAuthError,
}: ProviderApiConfigProps) {
  const modelCheckStore = useModelCheckStore();
  const { toast } = useToast();

  const [apiKey, setApiKey] = useState(provider.apiKey || "");
  const [apiHost, setApiHost] = useState(provider.baseUrl || "");
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrlUnlocked, setBaseUrlUnlocked] = useState(false);

  const defaultBaseUrl = providerWebsites?.defaultBaseUrl?.trim() || "";
  const hasDefaultBaseUrl = defaultBaseUrl.length > 0;
  const isBaseUrlEditableByDefault = provider.custom || EDITABLE_BASE_URL_PROVIDER_IDS.has(provider.id);
  const showLockedBaseUrl = !isBaseUrlEditableByDefault && !baseUrlUnlocked;
  const shouldRefreshProviderDbFirst = isProviderDbBackedProvider(provider.id);

  const providerApiKeyUrl = (() => {
    if (provider.id !== "new-api") {
      return providerWebsites?.apiKey || "";
    }

    const normalizedHost = apiHost.trim() || defaultBaseUrl;
    if (!normalizedHost) {
      return providerWebsites?.apiKey || "";
    }

    try {
      const parsedUrl = new URL(normalizedHost);
      return `${parsedUrl.origin}/console/token`;
    } catch {
      return providerWebsites?.apiKey || "";
    }
  })();

  const canVerifyProvider = provider.enable;

  useEffect(() => {
    setApiKey(provider.apiKey || "");
    setApiHost(provider.baseUrl || "");
    setBaseUrlUnlocked(false);
  }, [provider]);

  const handleApiKeyBlur = (event: FocusEvent<HTMLInputElement>) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    onApiKeyChange?.(target.value);
  };

  const handleApiHostChange = (value: string) => {
    onApiHostChange?.(value);
  };

  const handleApiHostBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (showLockedBaseUrl) return;
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    handleApiHostChange(target.value);
  };

  const fillDefaultBaseUrl = () => {
    if (!hasDefaultBaseUrl) return;
    setApiHost(defaultBaseUrl);
    handleApiHostChange(defaultBaseUrl);
  };

  const extractRefreshErrorMessage = (error: unknown): string | null => {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const normalizedMessage = rawMessage.trim();

    if (!normalizedMessage) {
      return null;
    }

    try {
      const parsed = JSON.parse(normalizedMessage) as {
        error?: { message?: string };
        message?: string;
      };

      if (typeof parsed.error?.message === "string" && parsed.error.message.trim()) {
        return parsed.error.message.trim();
      }

      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // ignore JSON parse errors
    }

    return normalizedMessage;
  };

  const getKeyStatus = useCallback(async () => {
    if (
      ["ppio", "openrouter", "siliconcloud", "silicon", "deepseek", "302ai", "cherryin"].includes(provider.id) &&
      provider.apiKey
    ) {
      try {
        const status = await providerClient.getKeyStatus(provider.id);
        setKeyStatus(status);
      } catch (error) {
        console.error("Failed to get key status:", error);
        setKeyStatus(null);
      }
    }
  }, [provider.id, provider.apiKey, providerClient]);

  const refreshModels = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      await providerClient.refreshModels(provider.id);
      toast({
        title: "Models refreshed",
        description: shouldRefreshProviderDbFirst
          ? "Model list and metadata updated successfully."
          : "Model list updated successfully.",
        duration: 4000,
      });
    } catch (error) {
      console.error("Failed to refresh models:", error);
      const fallbackDescription = shouldRefreshProviderDbFirst
        ? "Failed to refresh models with metadata."
        : "Failed to refresh models.";
      const errorMessage = extractRefreshErrorMessage(error);
      toast({
        title: "Refresh failed",
        description: errorMessage ? `${fallbackDescription}: ${errorMessage}` : fallbackDescription,
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const openModelCheckDialog = () => {
    if (!canVerifyProvider) {
      return;
    }

    modelCheckStore.openDialog(provider.id);
  };

  useEffect(() => {
    void getKeyStatus();
  }, [getKeyStatus]);

  return (
    <div className="flex flex-col gap-4">
      {provider.id === "openai" && (
        <div className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          <div className="flex items-start gap-2">
            <Icon icon="lucide:triangle-alert" className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm font-medium leading-5">
              OpenAI Responses API is used by default. You can switch to Chat Completions in the model settings.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col items-start gap-2">
        <div className="flex justify-between items-center w-full">
          <Label htmlFor={`${provider.id}-url`} className="flex-1">
            API URL
          </Label>
          {provider.custom && (
            <Button variant="destructive" size="sm" className="text-xs rounded-lg" onClick={() => onDeleteProvider?.()}>
              <Icon icon="lucide:trash-2" className="w-4 h-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
        {showLockedBaseUrl ? (
          <div className="flex w-full items-center gap-2">
            <div
              id={`${provider.id}-url`}
              className="flex h-9 flex-1 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
            >
              <span className="truncate">{apiHost || "Enter API URL"}</span>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => setBaseUrlUnlocked(true)}>
              Modify
            </Button>
          </div>
        ) : (
          <Input
            id={`${provider.id}-url`}
            value={apiHost}
            onChange={(e) => setApiHost(String(e.target.value))}
            onBlur={handleApiHostBlur}
            onKeyUp={(e) => {
              if (e.key === "Enter") handleApiHostChange(apiHost);
            }}
            placeholder="Enter API URL"
          />
        )}
        <div className="text-xs text-muted-foreground">
          {hasDefaultBaseUrl && !showLockedBaseUrl ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                    aria-label="Fill default URL"
                    onClick={fillDefaultBaseUrl}
                  />
                }
              >
                Default: {defaultBaseUrl}
              </TooltipTrigger>
              <TooltipContent>Fill with default base URL</TooltipContent>
            </Tooltip>
          ) : showLockedBaseUrl ? (
            <span>Base URL is locked for this provider.</span>
          ) : (
            <span>Default: {defaultBaseUrl}</span>
          )}
        </div>
      </div>

      {provider.id === "github-copilot" ? (
        <GitHubCopilotOAuth
          provider={provider}
          onAuthSuccess={() => onOAuthSuccess?.()}
          onAuthError={(error) => onOAuthError?.(error)}
        />
      ) : (
        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-col gap-2 w-full">
            <Label htmlFor={`${provider.id}-apikey`} className="w-full">
              API Key
            </Label>
            <div className="relative w-full">
              <Input
                data-testid="provider-api-key-input"
                id={`${provider.id}-apikey`}
                value={apiKey}
                onChange={(e) => setApiKey(String(e.target.value))}
                onBlur={handleApiKeyBlur}
                onKeyUp={(e) => {
                  if (e.key === "Enter") {
                    if (!canVerifyProvider) return;
                    onValidateKey?.(apiKey);
                  }
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
            {keyStatus && (keyStatus.usage !== undefined || keyStatus.limit_remaining !== undefined) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {keyStatus.usage !== undefined && (
                  <div className="flex items-center gap-1">
                    <Icon icon="lucide:activity" className="w-3 h-3" />
                    <span>Usage: {keyStatus.usage}</span>
                  </div>
                )}
                {keyStatus.limit_remaining !== undefined && (
                  <div className="flex items-center gap-1">
                    <Icon icon="lucide:coins" className="w-3 h-3" />
                    <span>Remaining: {keyStatus.limit_remaining}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-row gap-2">
            <Button
              data-testid="provider-verify-button"
              variant="outline"
              size="sm"
              className="text-xs text-normal rounded-lg"
              disabled={!canVerifyProvider}
              onClick={openModelCheckDialog}
            >
              <Icon icon="lucide:check-check" className="w-4 h-4 text-muted-foreground" />
              Verify
            </Button>
            <Button
              data-testid="provider-refresh-models-button"
              variant="outline"
              size="sm"
              className="text-xs text-normal rounded-lg"
              disabled={isRefreshing}
              onClick={refreshModels}
            >
              <Icon
                icon={isRefreshing ? "lucide:loader-2" : "lucide:refresh-cw"}
                className={`w-4 h-4 text-muted-foreground${isRefreshing ? " animate-spin" : ""}`}
              />
              {isRefreshing ? "Refreshing..." : "Refresh Models"}
            </Button>
          </div>
          {shouldRefreshProviderDbFirst && (
            <p className="text-xs leading-5 text-muted-foreground">
              Refresh models to get the latest metadata and capabilities.
            </p>
          )}
          {!provider.custom && (
            <div className="text-xs text-muted-foreground">
              Get your API key from:{" "}
              <a href={providerApiKeyUrl} target="_blank" className="text-primary">
                {provider.name}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
