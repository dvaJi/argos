import { useState, type FocusEvent } from "react";
import { Label } from "#shadcn/components/ui/label";
import { Input } from "#shadcn/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { Button } from "#shadcn/components/ui/button";
import { Icon } from "@iconify/react";
import type { VERTEX_PROVIDER } from "@argos/shared/presenter";
import { useProviderStore } from "#/stores/providerStore";

interface VertexProviderSettingsDetailProps {
  provider: VERTEX_PROVIDER;
  onConfigUpdated?: () => void;
  onValidateProvider?: () => void;
}

export default function VertexProviderSettingsDetail({
  provider,
  onConfigUpdated,
  onValidateProvider,
}: VertexProviderSettingsDetailProps) {
  const providerStore = useProviderStore();

  const [projectId, setProjectId] = useState(provider.projectId || "");
  const [location, setLocation] = useState(provider.location || "");
  const [apiVersion, setApiVersion] = useState(provider.apiVersion || "v1");
  const [endpointMode, setEndpointMode] = useState(provider.endpointMode || "standard");
  const [accountClientEmail, setAccountClientEmail] = useState(provider.accountClientEmail || "");
  const [accountPrivateKey, setAccountPrivateKey] = useState(provider.accountPrivateKey || "");
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  // Re-sync draft fields whenever a different provider object arrives (render-phase
  // adjustment, replacing a setState-in-effect).
  const [syncedProvider, setSyncedProvider] = useState(provider);
  if (syncedProvider !== provider) {
    setSyncedProvider(provider);
    setProjectId(provider.projectId || "");
    setLocation(provider.location || "");
    setApiVersion(provider.apiVersion || "v1");
    setEndpointMode(provider.endpointMode || "standard");
    setAccountClientEmail(provider.accountClientEmail || "");
    setAccountPrivateKey(provider.accountPrivateKey || "");
  }

  const updateConfig = async (updates: Partial<VERTEX_PROVIDER>) => {
    await providerStore.updateVertexProviderConfig(provider.id, updates);
    onConfigUpdated?.();
  };

  const handleProjectIdChange = async (value: string) => {
    const nextValue = value.trim();
    setProjectId(nextValue);
    await updateConfig({ projectId: nextValue });
  };

  const handleLocationChange = async (value: string) => {
    const nextValue = value.trim();
    setLocation(nextValue);
    await updateConfig({ location: nextValue });
  };

  const handleApiVersionChange = async (value: string) => {
    if (value && typeof value === "string") {
      setApiVersion(value as "v1" | "v1beta1");
      await updateConfig({ apiVersion: value as "v1" | "v1beta1" });
    }
  };

  const handleEndpointModeChange = async (value: string) => {
    if (value && typeof value === "string") {
      setEndpointMode(value as "standard" | "express");
      await updateConfig({ endpointMode: value as "standard" | "express" });
    }
  };

  const handleServiceEmailChange = async (value: string) => {
    const nextValue = value.trim();
    setAccountClientEmail(nextValue);
    await updateConfig({ accountClientEmail: nextValue });
  };

  const handlePrivateKeyChange = async (value: string) => {
    setAccountPrivateKey(value);
    await updateConfig({ accountPrivateKey: value });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-2">
        <Label htmlFor={`${provider.id}-projectId`} className="flex-1">
          Project ID
        </Label>
        <Input
          id={`${provider.id}-projectId`}
          value={projectId}
          onChange={(e) => setProjectId(String(e.target.value))}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            void handleProjectIdChange(String((e.target as HTMLInputElement).value))
          }
          onKeyUp={(e) => {
            if (e.key === "Enter") void handleProjectIdChange(projectId);
          }}
          placeholder="Enter Google Cloud Project ID"
        />
      </div>

      <div className="flex flex-col items-start gap-2">
        <Label htmlFor={`${provider.id}-location`} className="flex-1">
          Location
        </Label>
        <Input
          id={`${provider.id}-location`}
          value={location}
          onChange={(e) => setLocation(String(e.target.value))}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            void handleLocationChange(String((e.target as HTMLInputElement).value))
          }
          onKeyUp={(e) => {
            if (e.key === "Enter") void handleLocationChange(location);
          }}
          placeholder="e.g., us-central1"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col items-start gap-2">
          <Label htmlFor={`${provider.id}-apiVersion`} className="flex-1">
            API Version
          </Label>
          <Select value={apiVersion} onValueChange={(v) => void handleApiVersionChange(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="v1" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="v1">v1</SelectItem>
              <SelectItem value="v1beta1">v1beta1</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col items-start gap-2">
          <Label htmlFor={`${provider.id}-endpointMode`} className="flex-1">
            Endpoint Mode
          </Label>
          <Select value={endpointMode} onValueChange={(v) => void handleEndpointModeChange(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Endpoint Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="express">Express</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col items-start gap-2">
        <Label htmlFor={`${provider.id}-serviceEmail`} className="flex-1">
          Service Account Email
        </Label>
        <Input
          id={`${provider.id}-serviceEmail`}
          value={accountClientEmail}
          onChange={(e) => setAccountClientEmail(String(e.target.value))}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            void handleServiceEmailChange(String((e.target as HTMLInputElement).value))
          }
          onKeyUp={(e) => {
            if (e.key === "Enter") void handleServiceEmailChange(accountClientEmail);
          }}
          placeholder="Enter service account email"
        />
      </div>

      <div className="flex flex-col items-start gap-2">
        <Label htmlFor={`${provider.id}-privateKey`} className="flex-1">
          Private Key
        </Label>
        <div className="relative w-full">
          <Input
            id={`${provider.id}-privateKey`}
            value={accountPrivateKey}
            onChange={(e) => setAccountPrivateKey(String(e.target.value))}
            onBlur={(e: FocusEvent<HTMLInputElement>) =>
              void handlePrivateKeyChange(String((e.target as HTMLInputElement).value))
            }
            onKeyUp={(e) => {
              if (e.key === "Enter") void handlePrivateKeyChange(accountPrivateKey);
            }}
            type={showPrivateKey ? "text" : "password"}
            placeholder="Enter private key"
            style={{ paddingRight: "2.5rem" }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent"
            onClick={() => setShowPrivateKey(!showPrivateKey)}
          >
            <Icon
              icon={showPrivateKey ? "lucide:eye-off" : "lucide:eye"}
              className="w-4 h-4 text-muted-foreground hover:text-foreground"
            />
          </Button>
        </div>
      </div>

      <div className="flex flex-row gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs text-normal rounded-lg"
          disabled={!provider.enable}
          onClick={() => onValidateProvider?.()}
        >
          <Icon icon="lucide:check-check" className="w-4 h-4 text-muted-foreground" />
          Verify
        </Button>
      </div>
    </div>
  );
}
