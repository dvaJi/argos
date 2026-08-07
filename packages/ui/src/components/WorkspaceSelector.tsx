import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import {
  EditMachineDialog,
  type MachineEdit,
  type WorkspaceDraft,
} from "#/components/workspace/WorkspaceSelectorDialogs";
import { getHasActiveSession } from "#/stores/ui/session";
import { useWorkspaceStore, type WorkspaceEntry } from "#/stores/ui/workspace";
import { useRemoteSetupStore } from "#/stores/ui/remoteSetup";

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

function RemoteMachineActionItems({
  workspace,
  onRetry,
  onRename,
  onPairAgain,
  onEditAddress,
  onCopyDiagnostics,
  onRemove,
}: {
  workspace: WorkspaceEntry;
  onRetry: () => void | Promise<void>;
  onRename: () => void;
  onPairAgain: () => void;
  onEditAddress: () => void | Promise<void>;
  onCopyDiagnostics: () => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  const actions = [
    {
      title: "Retry machine connection",
      label: `Retry ${workspace.name} connection`,
      icon: "lucide:refresh-cw",
      run: onRetry,
    },
    { title: "Rename machine", label: `Rename ${workspace.name}`, icon: "lucide:pencil", run: onRename },
    { title: "Pair machine again", label: `Pair ${workspace.name} again`, icon: "lucide:key-round", run: onPairAgain },
    { title: "Edit machine address", label: `Edit ${workspace.name} address`, icon: "lucide:link", run: onEditAddress },
    {
      title: "Copy diagnostics",
      label: `Copy ${workspace.name} diagnostics`,
      icon: "lucide:clipboard-copy",
      run: onCopyDiagnostics,
    },
    { title: "Forget machine", label: `Forget ${workspace.name}`, icon: "lucide:x", run: onRemove, destructive: true },
  ];

  return (
    <>
      {actions.map((action) => (
        <DropdownMenuItem
          key={action.title}
          variant={action.destructive ? "destructive" : "default"}
          onClick={(event) => {
            event.stopPropagation();
            void Promise.resolve()
              .then(action.run)
              .catch((error) => {
                console.warn(`Action "${action.title}" failed:`, error);
              });
          }}
          aria-label={action.label}
        >
          <Icon icon={action.icon} className="size-3" />
          {action.title}
        </DropdownMenuItem>
      ))}
    </>
  );
}

async function copyMachineDiagnostics(workspace: WorkspaceEntry): Promise<void> {
  let endpoint: { transport: "http" | "https" | "unknown"; hostKind: "loopback" | "private" | "other" } = {
    transport: "unknown",
    hostKind: "other",
  };
  try {
    const parsed = new URL(workspace.remoteUrl);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLoopback =
      hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.") || hostname.endsWith(".localhost");
    const isPrivate =
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      hostname.startsWith("fe80:") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith(".local");
    endpoint = {
      transport: parsed.protocol === "https:" ? "https" : parsed.protocol === "http:" ? "http" : "unknown",
      hostKind: isLoopback ? "loopback" : isPrivate ? "private" : "other",
    };
  } catch {
    // Keep diagnostics useful without including an invalid raw endpoint.
  }
  const diagnostics = JSON.stringify(
    {
      machineId: workspace.id,
      name: workspace.name,
      endpoint,
      environmentId: workspace.environmentId ? workspace.environmentId.slice(0, 8) : null,
      serverVersion: workspace.lastKnownServerVersion ?? null,
      protocolVersion: workspace.lastKnownProtocolVersion ?? null,
      capabilities: workspace.lastKnownCapabilities ?? [],
      trustState: workspace.trustState ?? "pairing-required",
    },
    null,
    2,
  );
  await navigator.clipboard?.writeText(diagnostics);
}

export default function WorkspaceSelector() {
  const store = useWorkspaceStore();
  const remoteSetup = useRemoteSetupStore();
  const [machineOperationStatus, setMachineOperationStatus] = useState("");
  const [editMachine, setEditMachine] = useState<MachineEdit | null>(null);

  const activeWorkspace = store.activeWorkspace;
  const workspaces = store.workspaces;
  const remoteUrls = workspaces
    .filter((workspace) => workspace.mode === "remote")
    .map((workspace) => workspace.remoteUrl);

  const saveWorkspaceInternal = async (workspace: WorkspaceDraft) => {
    const existingByIdentity = workspace.environmentId
      ? workspaces.find(
          (candidate) => candidate.mode === "remote" && candidate.environmentId === workspace.environmentId,
        )
      : undefined;
    const existing =
      existingByIdentity ??
      workspaces.find((candidate) => candidate.mode === "remote" && candidate.remoteUrl === workspace.remoteUrl);
    if (existing) {
      store.updateWorkspace(existing.id, {
        name: workspace.name || existing.name,
        remoteUrl: workspace.remoteUrl,
        credentialRef: workspace.credentialRef,
        environmentId: workspace.environmentId,
        lastKnownServerVersion: workspace.daemonVersion,
        lastKnownProtocolVersion: workspace.protocolVersion,
        lastKnownCapabilities: workspace.capabilities,
        trustState: workspace.credentialRef ? "paired" : "pairing-required",
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
      lastKnownProtocolVersion: workspace.protocolVersion,
      lastKnownCapabilities: workspace.capabilities,
      trustState: workspace.credentialRef ? "paired" : "pairing-required",
    });
    return entry.id;
  };

  const handleSave = async (workspace: WorkspaceDraft) => {
    await saveWorkspaceInternal(workspace);
  };

  const handleSaveAndSwitch = async (workspace: WorkspaceDraft) => {
    const id = await saveWorkspaceInternal(workspace);
    await store.switchWorkspace(id);
  };

  useEffect(() => {
    remoteSetup.registerHandlers({
      remoteUrls,
      onSave: handleSave,
      onSaveAndSwitch: handleSaveAndSwitch,
    });
    // Keep the handlers registered for the app lifetime: the global AddRemoteMachineDialog
    // (rendered in MainLayout) stays open across sidebar collapse, which unmounts this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, store]);

  const handleSwitch = async (id: string) => {
    if (id === store.activeWorkspaceId) return;
    const target = store.getWorkspace(id);
    if (
      target?.mode === "remote" &&
      (target.trustState === "pairing-required" || target.trustState === "identity-changed")
    ) {
      remoteSetup.openRemoteDialog(target);
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

  const handleRemove = async (workspace: WorkspaceEntry) => {
    if (
      !window.confirm(
        `Forget ${workspace.name} from this computer? This removes its local pairing but does not delete data on the remote machine.`,
      )
    ) {
      return;
    }
    const revokeRemoteSession = window.confirm(
      `Also revoke this desktop session on ${workspace.name}? Choose Cancel to forget only from this computer.`,
    );
    setMachineOperationStatus(
      revokeRemoteSession
        ? `Revoking this desktop session on ${workspace.name} and forgetting the machine...`
        : `Forgetting ${workspace.name} from this computer...`,
    );
    try {
      const removal = await store.removeWorkspace(workspace.id, revokeRemoteSession);
      if (revokeRemoteSession && removal.remoteRevoked === false) {
        const message = `${workspace.name} was forgotten from this computer, but its remote session could not be revoked. Revoke it from Argos Server when the machine is reachable.`;
        setMachineOperationStatus(message);
        window.alert(message);
      } else {
        setMachineOperationStatus(
          revokeRemoteSession
            ? `${workspace.name} was forgotten and this desktop session was revoked.`
            : `${workspace.name} was forgotten from this computer. Remote server data was not deleted.`,
        );
      }
    } catch (error) {
      setMachineOperationStatus(
        error instanceof Error ? error.message : `Argos could not forget ${workspace.name}. Try again.`,
      );
    }
  };

  const handleRename = (workspace: WorkspaceEntry) => {
    setEditMachine({ kind: "rename", workspace, value: workspace.name });
  };

  const saveRename = async () => {
    if (!editMachine || editMachine.kind !== "rename") return;
    const { workspace } = editMachine;
    const nextName = editMachine.value.trim();
    if (!nextName || nextName === workspace.name) return;
    try {
      await window.argos?.workspace?.rename(workspace.id, nextName);
      store.renameWorkspace(workspace.id, nextName);
      setEditMachine(null);
    } catch (error) {
      setMachineOperationStatus(error instanceof Error ? error.message : `Could not rename ${workspace.name}.`);
    }
  };

  const handlePairAgain = (workspace: WorkspaceEntry) => {
    remoteSetup.openRemoteDialog(workspace);
  };

  const handleEditAddress = async (workspace: WorkspaceEntry) => {
    setEditMachine({ kind: "address", workspace, value: workspace.remoteUrl });
  };

  const saveAddress = async () => {
    if (!editMachine || editMachine.kind !== "address") return;
    const { workspace } = editMachine;
    const candidate = editMachine.value.trim();
    if (!candidate || candidate === workspace.remoteUrl) return;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      window.alert("Enter a valid HTTP or HTTPS address.");
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      window.alert("Enter a valid HTTP or HTTPS address.");
      return;
    }
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = "/";
    const normalized = parsed.toString().replace(/\/$/, "");
    if (
      !window.confirm(
        `Change ${workspace.name}'s address to ${normalized}? Argos will reconnect and require the same verified machine identity.`,
      )
    ) {
      return;
    }
    const updateEndpoint = window.argos?.workspace?.updateEndpoint;
    if (typeof updateEndpoint !== "function") {
      window.alert("Changing a machine address is not supported in this runtime.");
      return;
    }
    try {
      await updateEndpoint(workspace.id, normalized);
      store.updateWorkspace(workspace.id, { remoteUrl: normalized });
      setEditMachine(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Argos could not verify the machine at that address.");
    }
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent/50"
              data-testid="workspace-selector-trigger"
            />
          }
        >
          <span
            className={`size-2 shrink-0 rounded-full ${STATUS_COLORS[deriveConnectionStatus(activeWorkspace ?? workspaces[0], store.connections)]}`}
          />
          <span className="flex-1 truncate">{activeWorkspace?.name ?? "This computer"}</span>
          <Icon icon="lucide:chevrons-up-down" className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs">Machines</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workspaces.map((ws) => {
              const isActive = ws.id === store.activeWorkspaceId;
              const status = deriveConnectionStatus(ws, store.connections);
              if (ws.mode === "remote") {
                return (
                  <DropdownMenuSub key={ws.id}>
                    <DropdownMenuSubTrigger className={isActive ? "bg-accent" : ""}>
                      <span className={`size-2 shrink-0 rounded-full ${STATUS_COLORS[status]}`} />
                      <span className="flex-1 truncate text-sm">
                        {ws.name} <span className="text-[10px] text-muted-foreground">({status})</span>
                        {(ws.trustState === "pairing-required" || ws.trustState === "identity-changed") && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({ws.trustState === "identity-changed" ? "identity changed" : "pair again"})
                          </span>
                        )}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-48">
                      <DropdownMenuItem onClick={() => void handleSwitch(ws.id)}>
                        <Icon icon="lucide:monitor-up" className="size-3" />
                        {isActive ? "Active machine" : "Switch to machine"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <RemoteMachineActionItems
                        workspace={ws}
                        onRetry={() => window.argos?.workspace?.switchTo(ws.id)}
                        onRename={() => handleRename(ws)}
                        onPairAgain={() => handlePairAgain(ws)}
                        onEditAddress={() => handleEditAddress(ws)}
                        onCopyDiagnostics={() => copyMachineDiagnostics(ws)}
                        onRemove={() => handleRemove(ws)}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );
              }
              return (
                <DropdownMenuItem
                  key={ws.id}
                  className={`flex cursor-pointer items-center gap-2 ${isActive ? "bg-accent" : ""}`}
                  onClick={() => void handleSwitch(ws.id)}
                >
                  <span className={`size-2 shrink-0 rounded-full ${STATUS_COLORS[status]}`} />
                  <span className="flex-1 truncate text-sm">{ws.name}</span>
                  {isActive && <Icon icon="lucide:check" className="size-3.5 text-muted-foreground" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2"
            onClick={() => remoteSetup.openRemoteDialog(null)}
          >
            <Icon icon="lucide:plus" className="size-3.5" />
            <span className="text-sm">Connect a remote machine</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="px-3 pt-1 text-xs text-muted-foreground" role="status" aria-live="polite">
        {machineOperationStatus}
      </p>

      <EditMachineDialog
        edit={editMachine}
        onChange={(value) => setEditMachine((current) => (current ? { ...current, value } : current))}
        onClose={() => setEditMachine(null)}
        onSaveName={saveRename}
        onSaveAddress={saveAddress}
      />
    </>
  );
}
