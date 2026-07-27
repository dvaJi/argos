import { useState } from "react";
import { Icon } from "@iconify/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#shadcn/components/ui/dialog";
import { RemoteWorkspaceSetup } from "#/components/workspace/RemoteWorkspaceSetup";
import { getHasActiveSession } from "#/stores/ui/session";
import { useWorkspaceStore, type WorkspaceEntry } from "#/stores/ui/workspace";

function deriveConnectionStatus(
  entry: WorkspaceEntry,
  connections: Record<string, any>,
): "connected" | "connecting" | "disconnected" {
  if (entry.mode === "local") return "connected";
  if (entry.trustState === "pairing-required" || entry.trustState === "identity-changed" || !entry.credentialRef) {
    return "disconnected";
  }
  const conn = connections[entry.id];
  if (!conn) return "disconnected";
  if (conn.connected) return "connected";
  if (conn.lastError) return "disconnected";
  return "connecting";
}

const STATUS_COLORS: Record<string, string> = {
  connected: "bg-green-500",
  connecting: "bg-yellow-500",
  disconnected: "bg-gray-400",
};

export default function WorkspaceSelector() {
  const store = useWorkspaceStore();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [recoveryWorkspace, setRecoveryWorkspace] = useState<WorkspaceEntry | null>(null);

  const activeWorkspace = store.activeWorkspace;
  const workspaces = store.workspaces;
  const remoteUrls = workspaces
    .filter((workspace) => workspace.mode === "remote")
    .map((workspace) => workspace.remoteUrl);

  const handleSwitch = async (id: string) => {
    if (id === store.activeWorkspaceId) return;
    const target = store.getWorkspace(id);
    if (
      target?.mode === "remote" &&
      (target.trustState === "pairing-required" || target.trustState === "identity-changed")
    ) {
      setRecoveryWorkspace(target);
      setAddDialogOpen(true);
      return;
    }
    if (
      target &&
      getHasActiveSession() &&
      !window.confirm(
        `Switch active machine to ${target.name}? Your current chat stays on its current machine and will not be moved.`,
      )
    ) {
      return;
    }
    await store.switchWorkspace(id);
  };

  const saveWorkspace = async (workspace: {
    name: string;
    remoteUrl: string;
    credentialRef?: string;
    environmentId?: string;
    daemonVersion?: string;
  }) => {
    const existingByIdentity = workspace.environmentId
      ? workspaces.find(
          (candidate) => candidate.mode === "remote" && candidate.environmentId === workspace.environmentId,
        )
      : undefined;
    const existing =
      existingByIdentity ??
      workspaces.find((candidate) => candidate.mode === "remote" && candidate.remoteUrl === workspace.remoteUrl);
    if (existing) {
      const identityChanged = Boolean(
        existing.environmentId && workspace.environmentId && existing.environmentId !== workspace.environmentId,
      );
      store.updateWorkspace(existing.id, {
        name: workspace.name || existing.name,
        remoteUrl: workspace.remoteUrl,
        credentialRef: workspace.credentialRef,
        environmentId: workspace.environmentId,
        lastKnownServerVersion: workspace.daemonVersion,
        trustState: identityChanged ? "identity-changed" : workspace.credentialRef ? "paired" : "pairing-required",
      });
      return existing.id;
    }
    const entry = store.addWorkspace({
      name: workspace.name,
      mode: "remote",
      remoteUrl: workspace.remoteUrl,
      credentialRef: workspace.credentialRef,
      environmentId: workspace.environmentId,
      lastKnownServerVersion: workspace.daemonVersion,
      trustState: workspace.credentialRef ? "paired" : "pairing-required",
    });
    return entry.id;
  };

  const handleSave = async (workspace: {
    name: string;
    remoteUrl: string;
    credentialRef?: string;
    environmentId?: string;
    daemonVersion?: string;
  }) => {
    await saveWorkspace(workspace);
    setAddDialogOpen(false);
  };

  const handleSaveAndSwitch = async (workspace: {
    name: string;
    remoteUrl: string;
    credentialRef?: string;
    environmentId?: string;
    daemonVersion?: string;
  }) => {
    const id = await saveWorkspace(workspace);
    await store.switchWorkspace(id);
    setAddDialogOpen(false);
  };

  const handleRemove = async (workspace: WorkspaceEntry) => {
    if (
      !window.confirm(
        `Forget ${workspace.name}? This removes its pairing from this computer but does not delete data on the remote machine.`,
      )
    ) {
      return;
    }
    store.removeWorkspace(workspace.id);
  };

  const handleRename = (workspace: WorkspaceEntry) => {
    const nextName = window.prompt("Machine name", workspace.name)?.trim();
    if (!nextName || nextName === workspace.name) return;
    window.argos?.workspace?.rename(workspace.id, nextName);
    store.renameWorkspace(workspace.id, nextName);
  };

  const handleCopyDiagnostics = async (workspace: WorkspaceEntry) => {
    const diagnostics = JSON.stringify(
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
    );
    await navigator.clipboard?.writeText(diagnostics);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent/50"
            data-testid="workspace-selector-trigger"
          >
            <span
              className={`size-2 shrink-0 rounded-full ${STATUS_COLORS[deriveConnectionStatus(activeWorkspace ?? workspaces[0], store.connections)]}`}
            />
            <span className="flex-1 truncate">{activeWorkspace?.name ?? "This computer"}</span>
            <Icon icon="lucide:chevrons-up-down" className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs">Machines</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((ws) => {
            const isActive = ws.id === store.activeWorkspaceId;
            const status = deriveConnectionStatus(ws, store.connections);
            return (
              <DropdownMenuItem
                key={ws.id}
                className={`flex cursor-pointer items-center gap-2 ${isActive ? "bg-accent" : ""}`}
                onSelect={() => void handleSwitch(ws.id)}
              >
                <span className={`size-2 shrink-0 rounded-full ${STATUS_COLORS[status]}`} />
                <span className="flex-1 truncate text-sm">
                  {ws.name}
                  {ws.mode === "remote" &&
                    (ws.trustState === "pairing-required" || ws.trustState === "identity-changed") && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({ws.trustState === "identity-changed" ? "identity changed" : "pair again"})
                      </span>
                    )}
                </span>
                {isActive && <Icon icon="lucide:check" className="size-3.5 text-muted-foreground" />}
                {ws.mode === "remote" && (
                  <span className="ml-1 flex items-center gap-0.5">
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleSwitch(ws.id);
                      }}
                      title="Retry connection"
                    >
                      <Icon icon="lucide:refresh-cw" className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRename(ws);
                      }}
                      title="Rename machine"
                    >
                      <Icon icon="lucide:pencil" className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCopyDiagnostics(ws);
                      }}
                      title="Copy diagnostics"
                    >
                      <Icon icon="lucide:clipboard-copy" className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRemove(ws);
                      }}
                      title="Forget machine"
                    >
                      <Icon icon="lucide:x" className="size-3" />
                    </button>
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="flex cursor-pointer items-center gap-2" onSelect={() => setAddDialogOpen(true)}>
            <Icon icon="lucide:plus" className="size-3.5" />
            <span className="text-sm">Connect a remote machine</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect a remote machine</DialogTitle>
            <DialogDescription>
              Install Argos Server on another machine, pair it securely, and choose where work runs.
            </DialogDescription>
          </DialogHeader>
          <RemoteWorkspaceSetup
            existingRemoteUrls={remoteUrls}
            initialRemoteUrl={recoveryWorkspace?.remoteUrl}
            onAddWorkspace={async (workspace) => {
              await handleSave(workspace);
              setRecoveryWorkspace(null);
            }}
            onSaveAndSwitch={async (workspace) => {
              await handleSaveAndSwitch(workspace);
              setRecoveryWorkspace(null);
            }}
            onCancel={() => {
              setRecoveryWorkspace(null);
              setAddDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
