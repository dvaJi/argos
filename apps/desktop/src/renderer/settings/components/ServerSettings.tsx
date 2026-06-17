import { useState, useCallback } from "react";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { useToast } from "@/components/use-toast";
import {
  readWorkspaceConfig,
  writeWorkspaceConfig,
  notifyWorkspaceConfigChanged,
  generateWorkspaceId,
  buildRemoteWsUrl,
  LOCAL_WORKSPACE_ID,
  type WorkspaceEntry,
} from "@shared/workspaceConfig";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export default function ServerSettings() {
  const { toast } = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>(() => readWorkspaceConfig().workspaces);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newToken, setNewToken] = useState("");
  const [testStatus, setTestStatus] = useState<ConnectionStatus>("disconnected");
  const [isTesting, setIsTesting] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!newUrl.trim()) return;
    setIsTesting(true);
    setTestStatus("connecting");

    try {
      const url = newUrl.trim().replace(/\/$/, "");
      const headers: Record<string, string> = {};
      if (newToken.trim()) {
        headers["Authorization"] = `Bearer ${newToken.trim()}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${url}/health`, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const body = await response.json();
        if (body.status === "ok") {
          let displayName = newName.trim();
          if (!displayName) {
            try {
              displayName = new URL(url).hostname;
            } catch {
              displayName = "Remote";
            }
          }

          const config = readWorkspaceConfig();
          const entry: WorkspaceEntry = {
            id: generateWorkspaceId(),
            name: displayName,
            mode: "remote",
            remoteUrl: url,
            authToken: newToken.trim(),
            createdAt: Date.now(),
          };
          config.workspaces.push(entry);
          writeWorkspaceConfig(config);
          notifyWorkspaceConfigChanged();
          setWorkspaces(config.workspaces);
          setNewName("");
          setNewUrl("");
          setNewToken("");
          setTestStatus("connected");
          toast({ title: `Connected to daemon v${body.version}` });
        } else {
          setTestStatus("error");
          toast({ title: "Server returned unhealthy status", variant: "destructive" });
        }
      } else {
        setTestStatus("error");
        toast({ title: `Connection failed: HTTP ${response.status}`, variant: "destructive" });
      }
    } catch (error) {
      setTestStatus("error");
      const msg = error instanceof Error ? error.message : String(error);
      toast({ title: "Connection failed", description: msg, variant: "destructive" });
    } finally {
      setIsTesting(false);
    }
  }, [newName, newUrl, newToken, toast]);

  const handleRemove = useCallback(
    (id: string) => {
      if (id === LOCAL_WORKSPACE_ID) return;
      const config = readWorkspaceConfig();
      config.workspaces = config.workspaces.filter((w) => w.id !== id);
      writeWorkspaceConfig(config);
      notifyWorkspaceConfigChanged();
      setWorkspaces(config.workspaces);
      toast({ title: "Workspace removed" });
    },
    [toast],
  );

  return (
    <div data-testid="settings-server-page" className="h-full w-full">
      <ScrollArea className="h-full w-full">
        <div className="flex flex-col gap-6 p-4 max-w-2xl">
          <div className="space-y-1">
            <div className="text-base font-medium">Workspaces</div>
            <div className="text-sm text-muted-foreground">
              Each workspace connects to a daemon — local or remote. Switch between them from the sidebar.
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-600" />
              <span className="font-medium">Local</span>
              <span className="text-xs text-muted-foreground">— daemon managed by app</span>
            </div>
            <p className="text-xs text-muted-foreground">
              The local daemon runs automatically as a sidecar process. Always available as a workspace.
            </p>
          </div>

          {workspaces.filter((w) => w.mode === "remote").length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Remote Workspaces</Label>
              {workspaces
                .filter((w) => w.mode === "remote")
                .map((ws) => (
                  <div key={ws.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{ws.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{ws.remoteUrl}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemove(ws.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
            </div>
          )}

          <div className="rounded-lg border p-4 space-y-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Add Remote Workspace</Label>
              <p className="text-xs text-muted-foreground">Connect to a daemon running on another machine</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="ws-name">Name</Label>
                <Input
                  id="ws-name"
                  placeholder="My Server"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ws-url">Server URL</Label>
                <Input
                  id="ws-url"
                  placeholder="http://192.168.1.100:9527"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ws-token">Auth Token</Label>
                <Input
                  id="ws-token"
                  type="password"
                  placeholder="Optional"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleAdd()}
                  disabled={isTesting || !newUrl.trim()}
                >
                  {isTesting ? "Testing..." : "Add & Test"}
                </Button>

                {testStatus === "connected" && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-600" />
                    Connected
                  </span>
                )}
                {testStatus === "error" && (
                  <span className="text-sm text-red-600 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-600" />
                    Failed
                  </span>
                )}
                {testStatus === "connecting" && <span className="text-sm text-muted-foreground">Connecting...</span>}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`overflow-auto ${className || ""}`}>{children}</div>;
}
