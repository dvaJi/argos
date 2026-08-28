import { useState, useEffect, useMemo, useRef, type FocusEvent } from "react";
import { Label } from "#shadcn/components/ui/label";
import { Input } from "#shadcn/components/ui/input";
import { Button } from "#shadcn/components/ui/button";
import { Icon } from "@iconify/react";
import { createOAuthClient } from "#api/OAuthClient";
import { useProviderStore } from "#/stores/providerStore";
import type { LLM_PROVIDER } from "@argos/shared/presenter";
import { useModelCheckStore } from "#/stores/modelCheck";

const oauthClient = createOAuthClient();

interface GitHubCopilotOAuthProps {
  provider: LLM_PROVIDER;
  onAuthSuccess?: () => void;
  onAuthError?: (error: string) => void;
}

export default function GitHubCopilotOAuth({ provider, onAuthSuccess, onAuthError }: GitHubCopilotOAuthProps) {
  const providerStore = useProviderStore();
  const modelCheckStore = useModelCheckStore();

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [copilotClientId, setCopilotClientId] = useState(provider.copilotClientId || "");
  // Keep the local client ID draft in sync when the provider identity changes
  // (prev-compare during render — no effect needed).
  const [syncedProvider, setSyncedProvider] = useState(provider);
  if (syncedProvider !== provider) {
    setSyncedProvider(provider);
    setCopilotClientId(provider.copilotClientId || "");
  }
  const clearTimerRef = useRef<number | null>(null);

  const hasToken = useMemo(() => !!(provider.apiKey && provider.apiKey.trim()), [provider.apiKey]);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (validationResult) {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
      clearTimerRef.current = window.setTimeout(() => {
        setValidationResult(null);
      }, 5000);
    }
  }, [validationResult]);

  const saveClientId = async (value: string) => {
    const next = value.trim();
    setCopilotClientId(next);
    try {
      await providerStore.updateProviderConfig(provider.id, { copilotClientId: next });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setValidationResult({ success: false, message });
    }
  };

  const handleClientIdBlur = (event: FocusEvent<HTMLInputElement>) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    void saveClientId(target.value);
  };

  const startDeviceFlowLogin = async () => {
    setIsLoggingIn(true);
    setValidationResult(null);

    try {
      const success = await oauthClient.startGitHubCopilotDeviceFlowLogin(provider.id);

      if (success) {
        onAuthSuccess?.();
        setValidationResult({ success: true, message: "Login successful" });
      } else {
        onAuthError?.("Login failed");
        setValidationResult({ success: false, message: "Login failed" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      onAuthError?.(message);
      setValidationResult({ success: false, message });
    }
    setIsLoggingIn(false);
  };

  const startOAuthLogin = async () => {
    setIsLoggingIn(true);
    setValidationResult(null);

    try {
      const success = await oauthClient.startGitHubCopilotLogin(provider.id);

      if (success) {
        onAuthSuccess?.();
        setValidationResult({ success: true, message: "Login successful" });
      } else {
        onAuthError?.("Login failed");
        setValidationResult({ success: false, message: "Login failed" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      onAuthError?.(message);
      setValidationResult({ success: false, message });
    }
    setIsLoggingIn(false);
  };

  const openModelCheckDialog = () => {
    if (!provider.enable) {
      return;
    }

    modelCheckStore.openDialog(provider.id);
  };

  const disconnect = async () => {
    try {
      await providerStore.updateProviderApi(provider.id, "", undefined);
      setValidationResult({ success: true, message: "Disconnected" });
    } catch (error) {
      setValidationResult({
        success: false,
        message: error instanceof Error ? error.message : "Disconnect failed",
      });
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Label className="flex-1">GitHub Copilot Authentication</Label>

      <div className="w-full space-y-1">
        <Label htmlFor={`${provider.id}-copilot-client-id`} className="text-xs text-muted-foreground">
          Client ID
        </Label>
        <Input
          id={`${provider.id}-copilot-client-id`}
          value={copilotClientId}
          onChange={(e) => setCopilotClientId(String(e.target.value))}
          onBlur={handleClientIdBlur}
          onKeyUp={(e) => {
            if (e.key === "Enter") void saveClientId(copilotClientId);
          }}
        />
        <div className="text-xs text-muted-foreground">
          Override the default GitHub Copilot OAuth Client ID if needed.
        </div>
      </div>

      {hasToken ? (
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <Icon icon="lucide:check-circle" className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm text-green-700 dark:text-green-300">Connected</span>
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
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-normal rounded-lg text-destructive"
              onClick={disconnect}
            >
              <Icon icon="lucide:unlink" className="w-4 h-4 text-destructive" />
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <Icon icon="lucide:info" className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm text-yellow-700 dark:text-yellow-300">Not connected</span>
          </div>
          <Button variant="default" size="sm" className="w-full" disabled={isLoggingIn} onClick={startDeviceFlowLogin}>
            <Icon
              icon={isLoggingIn ? "lucide:loader-2" : "lucide:smartphone"}
              className={`w-4 h-4 mr-2${isLoggingIn ? " animate-spin" : ""}`}
            />
            {isLoggingIn ? "Logging in..." : "Device Flow Login (Recommended)"}
          </Button>

          <Button variant="outline" size="sm" className="w-full" disabled={isLoggingIn} onClick={startOAuthLogin}>
            <Icon
              icon={isLoggingIn ? "lucide:loader-2" : "lucide:github"}
              className={`w-4 h-4 mr-2${isLoggingIn ? " animate-spin" : ""}`}
            />
            {isLoggingIn ? "Logging in..." : "Traditional OAuth Login"}
          </Button>
          <div className="text-xs text-muted-foreground">
            Device Flow is recommended for desktop applications. You can also use traditional OAuth.
          </div>
        </div>
      )}

      {validationResult && (
        <div className="w-full">
          <div
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              validationResult.success
                ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
            }`}
          >
            <Icon
              icon={validationResult.success ? "lucide:check-circle" : "lucide:x-circle"}
              className={`w-4 h-4 ${
                validationResult.success ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            />
            <span
              className={`text-sm ${
                validationResult.success ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"
              }`}
            >
              {validationResult.message}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
