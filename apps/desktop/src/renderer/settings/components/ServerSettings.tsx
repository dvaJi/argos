import { useState, useEffect, useCallback } from "react";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { Switch } from "@shadcn/components/ui/switch";
import { useToast } from "@/components/use-toast";
import { notifyChanged } from "@shared/serverConfig";

type ServerMode = "local" | "remote";

type ServerConfig = {
  mode: ServerMode;
  remoteUrl: string;
  authToken: string;
};

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

const STORAGE_KEY = "argos-server-config";

function loadConfig(): ServerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { mode: "local", remoteUrl: "", authToken: "" };
}

function saveConfig(config: ServerConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export default function ServerSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ServerConfig>(loadConfig);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [isTesting, setIsTesting] = useState(false);

  const handleModeChange = (local: boolean) => {
    const newConfig = { ...config, mode: local ? ("local" as const) : ("remote" as const) };
    setConfig(newConfig);
    saveConfig(newConfig);
    notifyChanged();
    setStatus("disconnected");
  };

  const handleUrlChange = (url: string) => {
    const newConfig = { ...config, remoteUrl: url };
    setConfig(newConfig);
    saveConfig(newConfig);
    notifyChanged();
  };

  const handleTokenChange = (token: string) => {
    const newConfig = { ...config, authToken: token };
    setConfig(newConfig);
    saveConfig(newConfig);
    notifyChanged();
  };

  const handleTestConnection = useCallback(async () => {
    if (!config.remoteUrl) {
      toast({ title: "Enter a server URL first", variant: "destructive" });
      return;
    }

    setIsTesting(true);
    setStatus("connecting");

    try {
      const url = config.remoteUrl.replace(/\/$/, "");
      const headers: Record<string, string> = {};
      if (config.authToken) {
        headers["Authorization"] = `Bearer ${config.authToken}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${url}/health`, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const body = await response.json();
        if (body.status === "ok") {
          setStatus("connected");
          toast({ title: `Connected to daemon v${body.version}` });
        } else {
          setStatus("error");
          toast({ title: "Server returned unhealthy status", variant: "destructive" });
        }
      } else {
        setStatus("error");
        toast({ title: `Connection failed: HTTP ${response.status}`, variant: "destructive" });
      }
    } catch (error) {
      setStatus("error");
      const msg = error instanceof Error ? error.message : String(error);
      toast({ title: "Connection failed", description: msg, variant: "destructive" });
    } finally {
      setIsTesting(false);
    }
  }, [config.remoteUrl, config.authToken, toast]);

  return (
    <div data-testid="settings-server-page" className="h-full w-full">
      <ScrollArea className="h-full w-full">
        <div className="flex flex-col gap-6 p-4 max-w-2xl">
          <div className="space-y-1">
            <div className="text-base font-medium">Server Connection</div>
            <div className="text-sm text-muted-foreground">Configure how this app connects to the backend daemon</div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Local Mode</Label>
                <p className="text-xs text-muted-foreground">Run the daemon as a sidecar process managed by this app</p>
                <p className="text-xs text-muted-foreground">
                  Attaching to a remote server does not stop the local daemon. The local daemon continues to run in the
                  background; switch back to Local at any time.
                </p>
              </div>
              <Switch checked={config.mode === "local"} onCheckedChange={handleModeChange} />
            </div>
          </div>

          {config.mode === "remote" && (
            <div className="rounded-lg border p-4 space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Remote Server</Label>
                <p className="text-xs text-muted-foreground">
                  Connect to a daemon running on another machine (e.g. via Tailscale)
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="server-url">Server URL</Label>
                  <Input
                    id="server-url"
                    placeholder="http://192.168.1.100:9527 or http://myhost.tailnet:9527"
                    value={config.remoteUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auth-token">Auth Token</Label>
                  <Input
                    id="auth-token"
                    type="password"
                    placeholder="Optional: required for remote connections"
                    value={config.authToken}
                    onChange={(e) => handleTokenChange(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={isTesting || !config.remoteUrl}
                  >
                    {isTesting ? "Testing..." : "Test Connection"}
                  </Button>

                  {status === "connected" && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-600" />
                      Connected
                    </span>
                  )}
                  {status === "error" && (
                    <span className="text-sm text-red-600 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-600" />
                      Failed
                    </span>
                  )}
                  {status === "connecting" && <span className="text-sm text-muted-foreground">Connecting...</span>}
                </div>
              </div>
            </div>
          )}

          {config.mode === "local" && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-green-600" />
                <span className="font-medium">Local daemon managed by app</span>
              </div>
              <p className="text-xs text-muted-foreground">
                The daemon runs automatically as a sidecar process. No configuration needed.
              </p>
            </div>
          )}

          <div className="rounded-lg border p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Auth Token</Label>
              <p className="text-xs text-muted-foreground">
                Token for authenticating remote connections. Set via --token flag or ARGOS_TOKEN env var.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input readOnly value={config.authToken || "(not set)"} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (config.authToken) {
                    navigator.clipboard.writeText(config.authToken);
                    toast({ title: "Token copied" });
                  }
                }}
                disabled={!config.authToken}
              >
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              For remote connections, the server must be started with --token or ARGOS_TOKEN. Local connections do not
              require a token.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`overflow-auto ${className || ""}`}>{children}</div>;
}
