import { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { useToast } from "#/components/use-toast";
import { createNowledgeMemClient } from "#api/NowledgeMemClient";

export default function NowledgeMemSettings() {
  const nowledgeMemClient = useMemo(() => createNowledgeMemClient(), []);
  const { toast } = useToast();

  const [testingConnection, setTestingConnection] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const [config, setConfig] = useState({
    baseUrl: "http://127.0.0.1:14242",
    apiKey: "",
    timeout: 30000,
  });

  const [isEditingTimeout, setIsEditingTimeout] = useState(false);

  const minTimeoutSeconds = 5;
  const maxTimeoutSeconds = 120;
  const timeoutStep = 5;

  const timeoutSeconds = Math.round(config.timeout / 1000);

  const handleTimeoutChange = (value: string | number) => {
    const numericValue = typeof value === "string" ? parseInt(value, 10) : value;
    if (isNaN(numericValue)) return;
    const clampedValue = Math.min(Math.max(numericValue, minTimeoutSeconds), maxTimeoutSeconds);
    setConfig((prev) => ({ ...prev, timeout: clampedValue * 1000 }));
  };

  const loadConfiguration = async () => {
    try {
      const savedConfig = await nowledgeMemClient.getConfig();
      if (savedConfig) {
        setConfig((prev) => ({
          ...prev,
          ...savedConfig,
          timeout: savedConfig.timeout && !isNaN(savedConfig.timeout) ? savedConfig.timeout : prev.timeout,
        }));
      }
    } catch (error) {
      console.error("Failed to load nowledge-mem config:", error);
    }
  };

  useEffect(() => {
    loadConfiguration();
  }, []);

  const testConnection = async () => {
    setTestingConnection(true);
    try {
      const result = await nowledgeMemClient.testConnection();
      toast({
        title: "Test Connection",
        description: result.error || (result.success ? "Connection successful" : "Connection test failed"),
        variant: result.success ? undefined : "destructive",
      });
    } catch (error) {
      toast({
        title: "Test Connection",
        description: error instanceof Error ? error.message : "Connection test failed",
        variant: "destructive",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const saveConfiguration = async () => {
    setSavingConfig(true);
    try {
      await nowledgeMemClient.updateConfig({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        timeout: config.timeout,
      });
    } catch (error) {
      console.error("Failed to save nowledge-mem config:", error);
    } finally {
      setSavingConfig(false);
    }
  };

  const resetConfiguration = async () => {
    try {
      const defaultConfig = {
        baseUrl: "http://127.0.0.1:14242",
        apiKey: "",
        timeout: 30000,
      };
      await nowledgeMemClient.updateConfig(defaultConfig);
      setConfig(defaultConfig);
    } catch (error) {
      console.error("Failed to reset nowledge-mem config:", error);
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center p-4 hover:bg-accent cursor-default"
        onClick={() => setShowConfigPanel(!showConfigPanel)}
      >
        <div className="flex-1">
          <div className="flex items-center">
            <img src={"/src/renderer/src/assets/images/nowledge-mem.png"} className="h-5 mr-2" alt="" />
            <span className="text-base font-medium">Nowledge-Mem</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Local knowledge base powered by Nowledge-Mem</p>
        </div>
      </div>
      {showConfigPanel && (
        <div className="border-t p-4 space-y-4">
          <div className="space-y-3">
            <div className="text-sm font-medium">Configuration</div>

            <div className="space-y-2">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                value={config.baseUrl}
                onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                type="url"
                placeholder="http://127.0.0.1:14242"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  value={config.apiKey}
                  onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                  type={showApiKey ? "text" : "password"}
                  placeholder="Your API key (optional)"
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
              <p className="text-xs text-muted-foreground">
                Optional. Only needed if your Nowledge-Mem instance requires authentication.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="timeout" className="flex-1">
                  Timeout
                </Label>
                <div className="shrink-0 flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleTimeoutChange(timeoutSeconds - timeoutStep)}
                    disabled={timeoutSeconds <= minTimeoutSeconds}
                  >
                    <Icon icon="lucide:minus" className="h-3 w-3" />
                  </Button>
                  <div className="relative">
                    <div
                      className="min-w-16 h-8 flex items-center justify-center text-sm font-semibold hover:bg-accent rounded px-2"
                      onClick={() => setIsEditingTimeout(true)}
                    >
                      {timeoutSeconds}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleTimeoutChange(timeoutSeconds + timeoutStep)}
                    disabled={timeoutSeconds >= maxTimeoutSeconds}
                  >
                    <Icon icon="lucide:plus" className="h-3 w-3" />
                  </Button>
                  <span className="text-xs text-muted-foreground ml-1">seconds</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={saveConfiguration}
                disabled={savingConfig}
                variant="default"
                size="sm"
                className="text-xs"
              >
                {savingConfig ? "Saving..." : "Save Configuration"}
              </Button>
              <Button onClick={resetConfiguration} variant="outline" size="sm" className="text-xs">
                Reset
              </Button>
              <Button
                onClick={testConnection}
                disabled={testingConnection}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                {testingConnection ? "Testing..." : "Test Connection"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
