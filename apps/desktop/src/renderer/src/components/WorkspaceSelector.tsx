import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shadcn/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shadcn/components/ui/dialog";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { useWorkspaceStore, type WorkspaceEntry } from "@/stores/ui/workspace";

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
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newToken, setNewToken] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const activeWorkspace = store.activeWorkspace;
  const workspaces = store.workspaces;

  const handleSwitch = useCallback(
    async (id: string) => {
      if (id === store.activeWorkspaceId) return;
      await store.switchWorkspace(id);
    },
    [store],
  );

  const handleAdd = useCallback(async () => {
    if (!newUrl.trim()) return;
    setIsAdding(true);
    try {
      let displayName = newName.trim();
      if (!displayName) {
        try {
          displayName = new URL(newUrl.trim().replace(/\/$/, "")).hostname;
        } catch {
          displayName = "Remote";
        }
      }
      store.addWorkspace({
        name: displayName,
        mode: "remote",
        remoteUrl: newUrl.trim(),
        authToken: newToken.trim(),
      });
      setAddDialogOpen(false);
      setNewName("");
      setNewUrl("");
      setNewToken("");
    } finally {
      setIsAdding(false);
    }
  }, [newName, newUrl, newToken, store]);

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
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left text-sm font-medium text-foreground hover:bg-accent/50 transition-colors duration-150"
            data-testid="workspace-selector-trigger"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[deriveConnectionStatus(activeWorkspace ?? workspaces[0], store.connections)]}`}
            />
            <span className="truncate flex-1">{activeWorkspace?.name ?? "Local"}</span>
            <Icon icon="lucide:chevrons-up-down" className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
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
                className={`flex items-center gap-2 cursor-pointer ${isActive ? "bg-accent" : ""}`}
                onSelect={() => void handleSwitch(ws.id)}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[status]}`} />
                <span className="flex-1 truncate text-sm">{ws.name}</span>
                {isActive && <Icon icon="lucide:check" className="w-3.5 h-3.5 text-muted-foreground" />}
                {ws.mode === "remote" && (
                  <button
                    className="ml-1 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(ws.id);
                    }}
                    title="Remove workspace"
                  >
                    <Icon icon="lucide:x" className="w-3 h-3" />
                  </button>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="flex items-center gap-2 cursor-pointer" onSelect={() => setAddDialogOpen(true)}>
            <Icon icon="lucide:plus" className="w-3.5 h-3.5" />
            <span className="text-sm">Add Remote Workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Remote Workspace</DialogTitle>
            <DialogDescription>Connect to a daemon running on another machine.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleAdd()} disabled={!newUrl.trim() || isAdding}>
              {isAdding ? "Connecting..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
