import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { RemoteWorkspaceSetup } from "#/components/workspace/RemoteWorkspaceSetup";
import { useToast } from "#/components/use-toast";
import {
  readWorkspaceConfig,
  writeWorkspaceConfig,
  notifyWorkspaceConfigChanged,
  generateWorkspaceId,
  LOCAL_WORKSPACE_ID,
  type WorkspaceEntry,
} from "@argos/shared/workspaceConfig";

type PairingResult = { pairingUrl: string; expiresAt: number } | null;

export default function ServerSettings() {
  const { toast } = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>(() => readWorkspaceConfig().workspaces);
  const [pairing, setPairing] = useState<PairingResult>(null);
  const [generating, setGenerating] = useState(false);
  const [recoveryWorkspace, setRecoveryWorkspace] = useState<WorkspaceEntry | null>(null);

  const remoteWorkspaces = workspaces.filter((workspace) => workspace.mode === "remote");
  const remoteUrls = remoteWorkspaces.map((workspace) => workspace.remoteUrl);

  const handleAdd = (workspace: {
    name: string;
    remoteUrl: string;
    daemonVersion?: string;
    credentialRef?: string;
    environmentId?: string;
  }) => {
    const config = readWorkspaceConfig();
    const existing = workspace.environmentId
      ? config.workspaces.find(
          (candidate) => candidate.mode === "remote" && candidate.environmentId === workspace.environmentId,
        )
      : config.workspaces.find(
          (candidate) => candidate.mode === "remote" && candidate.remoteUrl === workspace.remoteUrl,
        );
    if (existing) {
      const identityChanged = Boolean(
        existing.environmentId && workspace.environmentId && existing.environmentId !== workspace.environmentId,
      );
      config.workspaces = config.workspaces.map((candidate) =>
        candidate.id === existing.id
          ? {
              ...candidate,
              name: workspace.name || candidate.name,
              remoteUrl: workspace.remoteUrl,
              credentialRef: workspace.credentialRef,
              environmentId: workspace.environmentId,
              lastKnownServerVersion: workspace.daemonVersion,
              trustState: identityChanged
                ? "identity-changed"
                : workspace.credentialRef
                  ? "paired"
                  : "pairing-required",
            }
          : candidate,
      );
      writeWorkspaceConfig(config);
      notifyWorkspaceConfigChanged();
      setWorkspaces(config.workspaces);
      return;
    }
    const entry: WorkspaceEntry = {
      id: generateWorkspaceId(),
      name: workspace.name,
      mode: "remote",
      remoteUrl: workspace.remoteUrl,
      createdAt: Date.now(),
      credentialRef: workspace.credentialRef,
      environmentId: workspace.environmentId,
      lastKnownServerVersion: workspace.daemonVersion,
      trustState: workspace.credentialRef ? "paired" : "pairing-required",
    };
    config.workspaces.push(entry);
    writeWorkspaceConfig(config);
    notifyWorkspaceConfigChanged();
    setWorkspaces(config.workspaces);
  };

  const handleRemove = async (id: string) => {
    if (id === LOCAL_WORKSPACE_ID) return;
    await window.argos?.workspace?.remove(id);
    const config = readWorkspaceConfig();
    config.workspaces = config.workspaces.filter((workspace) => workspace.id !== id);
    writeWorkspaceConfig(config);
    notifyWorkspaceConfigChanged();
    setWorkspaces(config.workspaces);
    toast({ title: "Workspace removed" });
  };

  const handleRename = (workspace: WorkspaceEntry) => {
    const name = window.prompt("Machine name", workspace.name)?.trim();
    if (!name || name === workspace.name) return;
    window.argos?.workspace?.rename(workspace.id, name);
    const config = readWorkspaceConfig();
    config.workspaces = config.workspaces.map((entry) => (entry.id === workspace.id ? { ...entry, name } : entry));
    writeWorkspaceConfig(config);
    notifyWorkspaceConfigChanged();
    setWorkspaces(config.workspaces);
  };

  const handleCopyDiagnostics = async (workspace: WorkspaceEntry) => {
    await navigator.clipboard?.writeText(
      JSON.stringify(
        {
          machineId: workspace.id,
          name: workspace.name,
          endpoint: workspace.remoteUrl,
          environmentId: workspace.environmentId ?? null,
          serverVersion: workspace.lastKnownServerVersion ?? null,
          trustState: workspace.trustState ?? "pairing-required",
        },
        null,
        2,
      ),
    );
    toast({ title: "Diagnostics copied" });
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
            <div className="text-base font-medium">Machines</div>
            <div className="text-sm text-muted-foreground">
              Each machine is backed by Argos Desktop locally or Argos Server remotely. Switch machines from the
              sidebar.
            </div>
            <a
              href="https://github.com/dvaJi/argos/blob/master/docs/guides/remote-machines.md"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open the remote-machine guide
            </a>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border bg-background p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 size-2 rounded-full bg-green-600" />
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">This computer</div>
                  <p className="text-pretty text-xs leading-5 text-muted-foreground">
                    Argos Desktop manages the local server automatically. Most users only need this machine.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <Icon icon="lucide:server" className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">Argos Server</div>
                  <p className="text-pretty text-xs leading-5 text-muted-foreground">
                    Install <code>argos-daemon</code> on another machine when agents and project files should run there.
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
              <Label className="text-sm font-medium">Saved remote machines</Label>
              <div className="grid gap-2">
                {remoteWorkspaces.map((workspace) => (
                  <div key={workspace.id} className="flex items-center justify-between gap-3 rounded-2xl border p-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="truncate text-sm font-medium">{workspace.name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{workspace.remoteUrl}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {workspace.lastKnownServerVersion
                          ? `Argos Server v${workspace.lastKnownServerVersion}`
                          : "Pairing verification required"}
                        {workspace.environmentId ? ` · ${workspace.environmentId.slice(0, 8)}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setRecoveryWorkspace(workspace)}>
                        Edit address
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleRename(workspace)}>
                        Rename
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void handleCopyDiagnostics(workspace)}>
                        Diagnostics
                      </Button>
                      {(workspace.trustState === "pairing-required" || workspace.trustState === "identity-changed") && (
                        <Button variant="outline" size="sm" onClick={() => setRecoveryWorkspace(workspace)}>
                          Pair again
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void handleRemove(workspace.id)}>
                        Forget
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border p-4">
            <RemoteWorkspaceSetup
              existingRemoteUrls={remoteUrls}
              initialRemoteUrl={recoveryWorkspace?.remoteUrl}
              onAddWorkspace={(workspace) => {
                handleAdd(workspace);
                if (recoveryWorkspace) {
                  void handleRemove(recoveryWorkspace.id);
                  setRecoveryWorkspace(null);
                }
              }}
              compact
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`overflow-auto ${className || ""}`}>{children}</div>;
}
