import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { RemoteWorkspaceSetup } from "@/components/workspace/RemoteWorkspaceSetup";
import { useToast } from "@/components/use-toast";
import {
  readWorkspaceConfig,
  writeWorkspaceConfig,
  notifyWorkspaceConfigChanged,
  generateWorkspaceId,
  LOCAL_WORKSPACE_ID,
  type WorkspaceEntry,
} from "@shared/workspaceConfig";

type PairingResult = { pairingUrl: string; expiresAt: number } | null;

export default function ServerSettings() {
  const { toast } = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>(() => readWorkspaceConfig().workspaces);
  const [pairing, setPairing] = useState<PairingResult>(null);
  const [generating, setGenerating] = useState(false);

  const remoteWorkspaces = workspaces.filter((workspace) => workspace.mode === "remote");
  const remoteUrls = remoteWorkspaces.map((workspace) => workspace.remoteUrl);

  const handleAdd = (workspace: { name: string; remoteUrl: string; daemonVersion?: string }) => {
    const config = readWorkspaceConfig();
    const entry: WorkspaceEntry = {
      id: generateWorkspaceId(),
      name: workspace.name,
      mode: "remote",
      remoteUrl: workspace.remoteUrl,
      createdAt: Date.now(),
    };
    config.workspaces.push(entry);
    writeWorkspaceConfig(config);
    notifyWorkspaceConfigChanged();
    setWorkspaces(config.workspaces);
  };

  const handleRemove = (id: string) => {
    if (id === LOCAL_WORKSPACE_ID) return;
    const config = readWorkspaceConfig();
    config.workspaces = config.workspaces.filter((workspace) => workspace.id !== id);
    writeWorkspaceConfig(config);
    notifyWorkspaceConfigChanged();
    setWorkspaces(config.workspaces);
    toast({ title: "Workspace removed" });
  };

  const handleGeneratePairingUrl = async () => {
    setGenerating(true);
    let ok = false;
    try {
      const result = await window.electron.ipcRenderer.invoke("generate-pairing-url");
      if (result?.ok) {
        setPairing({ pairingUrl: result.pairingUrl, expiresAt: result.expiresAt });
        toast({ title: "Pairing URL generated" });
        ok = true;
      } else {
        toast({ title: result?.error?.message ?? "Failed to generate pairing URL", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to reach daemon", variant: "destructive" });
    }
    setGenerating(false);
  };

  return (
    <div data-testid="settings-server-page" className="h-full w-full">
      <ScrollArea className="h-full w-full">
        <div className="flex max-w-5xl flex-col gap-6 p-4">
          <div className="space-y-1">
            <div className="text-base font-medium">Workspaces</div>
            <div className="text-sm text-muted-foreground">
              Each workspace connects to a daemon, local or remote. Switch between them from the sidebar.
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border bg-background p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 size-2 rounded-full bg-green-600" />
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">Local</div>
                  <p className="text-pretty text-xs leading-5 text-muted-foreground">
                    The local daemon is managed automatically by the app and is always available as a workspace.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <Icon icon="lucide:server" className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">Remote</div>
                  <p className="text-pretty text-xs leading-5 text-muted-foreground">
                    Remote workspaces connect this app to an <code>argos-daemon</code> running on another machine.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Icon icon="lucide:smartphone" className="size-4 text-muted-foreground" />
              <div className="text-sm font-medium">Browser Access</div>
            </div>
            <p className="text-pretty text-xs leading-5 text-muted-foreground">
              Generate a one-time pairing URL to open Argos in a browser on this machine. The URL expires after 5
              minutes and can only be used once.
            </p>
            {pairing ? (
              <div className="space-y-2">
                <Input readOnly value={pairing.pairingUrl} className="font-mono text-xs" />
                <p className="text-xs tabular-nums text-muted-foreground">
                  Expires: {new Date(pairing.expiresAt).toLocaleTimeString()}
                </p>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={handleGeneratePairingUrl} disabled={generating}>
                <Icon icon="lucide:link" className="mr-1.5 size-3.5" />
                {generating ? "Generating..." : "Generate pairing URL"}
              </Button>
            )}
          </div>

          {remoteWorkspaces.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Saved Remote Workspaces</Label>
              <div className="grid gap-2">
                {remoteWorkspaces.map((workspace) => (
                  <div key={workspace.id} className="flex items-center justify-between gap-3 rounded-2xl border p-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="truncate text-sm font-medium">{workspace.name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{workspace.remoteUrl}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemove(workspace.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border p-4">
            <RemoteWorkspaceSetup existingRemoteUrls={remoteUrls} onAddWorkspace={handleAdd} compact />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`overflow-auto ${className || ""}`}>{children}</div>;
}
