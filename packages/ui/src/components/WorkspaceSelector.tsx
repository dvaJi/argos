import { useCallback, useState } from "react";
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
import { useWorkspaceStore, type WorkspaceEntry } from "#/stores/ui/workspace";

function deriveConnectionStatus(
  entry: WorkspaceEntry,
  connections: Record<string, any>,
): "connected" | "connecting" | "disconnected" {
  if (entry.mode === "local") return "connected";
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

  const activeWorkspace = store.activeWorkspace;
  const workspaces = store.workspaces;
  const remoteUrls = workspaces
    .filter((workspace) => workspace.mode === "remote")
    .map((workspace) => workspace.remoteUrl);

  const handleSwitch = useCallback(
    async (id: string) => {
      if (id === store.activeWorkspaceId) return;
      await store.switchWorkspace(id);
    },
    [store],
  );

  const handleAdd = useCallback(
    async (workspace: { name: string; remoteUrl: string }) => {
      const entry = store.addWorkspace({
        name: workspace.name,
        mode: "remote",
        remoteUrl: workspace.remoteUrl,
      });
      await store.switchWorkspace(entry.id);
      setAddDialogOpen(false);
    },
    [store],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      store.removeWorkspace(id);
    },
    [store],
  );

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
            <span className="flex-1 truncate">{activeWorkspace?.name ?? "Local"}</span>
            <Icon icon="lucide:chevrons-up-down" className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs">Workspaces</DropdownMenuLabel>
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
                <span className="flex-1 truncate text-sm">{ws.name}</span>
                {isActive && <Icon icon="lucide:check" className="size-3.5 text-muted-foreground" />}
                {ws.mode === "remote" && (
                  <button
                    className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleRemove(ws.id);
                    }}
                    title="Remove workspace"
                  >
                    <Icon icon="lucide:x" className="size-3" />
                  </button>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="flex cursor-pointer items-center gap-2" onSelect={() => setAddDialogOpen(true)}>
            <Icon icon="lucide:plus" className="size-3.5" />
            <span className="text-sm">Add Remote Workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Remote Workspace</DialogTitle>
            <DialogDescription>Install or verify an Argos daemon, then connect this app to it.</DialogDescription>
          </DialogHeader>
          <RemoteWorkspaceSetup
            existingRemoteUrls={remoteUrls}
            onAddWorkspace={handleAdd}
            onCancel={() => setAddDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
