import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import {
  type WorkspaceEntry,
  type WorkspaceConfig,
  type WorkspaceMode,
  LOCAL_WORKSPACE_ID,
  DEFAULT_WORKSPACE_CONFIG,
  readWorkspaceConfig,
  writeWorkspaceConfig,
  notifyWorkspaceConfigChanged,
  generateWorkspaceId,
} from "@shared/workspaceConfig";
import type { ConnectionState } from "@shared/contracts/connection";
import { fetchSessions as originalFetchSessions } from "./session";

export type { WorkspaceEntry, WorkspaceMode };

declare global {
  interface Window {
    argos?: {
      workspace?: {
        switchTo: (id: string) => Promise<void>;
        list: () => WorkspaceEntry[];
        getActive: () => WorkspaceEntry | undefined;
        add: (entry: Omit<WorkspaceEntry, "id" | "createdAt">) => WorkspaceEntry;
        remove: (id: string) => void;
        rename: (id: string, name: string) => void;
      };
    };
  }
}

export const workspaceStore = new Store<WorkspaceConfig>({
  ...DEFAULT_WORKSPACE_CONFIG,
});

const connectionStore = new Store({
  connections: {} as Record<string, ConnectionState>,
});

function persist(): void {
  writeWorkspaceConfig(workspaceStore.state);
  notifyWorkspaceConfigChanged();
}

export function initWorkspaceStore(): void {
  const config = readWorkspaceConfig();
  workspaceStore.setState(() => ({
    workspaces: config.workspaces,
    activeWorkspaceId: config.activeWorkspaceId,
  }));
}

export function getActiveWorkspace(): WorkspaceEntry | undefined {
  return workspaceStore.state.workspaces.find((w) => w.id === workspaceStore.state.activeWorkspaceId);
}

export function getWorkspaces(): WorkspaceEntry[] {
  return workspaceStore.state.workspaces;
}

export function getConnectionState(workspaceId: string): ConnectionState | undefined {
  return connectionStore.state.connections[workspaceId];
}

export function updateConnectionState(workspaceId: string, state: ConnectionState): void {
  connectionStore.setState((prev) => ({
    connections: { ...prev.connections, [workspaceId]: state },
  }));
}

export function addWorkspace(entry: Omit<WorkspaceEntry, "id" | "createdAt">): WorkspaceEntry {
  const newEntry: WorkspaceEntry = {
    ...entry,
    id: entry.mode === "local" ? LOCAL_WORKSPACE_ID : generateWorkspaceId(),
    createdAt: Date.now(),
  };

  workspaceStore.setState((prev) => ({
    ...prev,
    workspaces: [...prev.workspaces, newEntry],
  }));
  persist();
  return newEntry;
}

export function removeWorkspace(id: string): void {
  if (id === LOCAL_WORKSPACE_ID) return;

  workspaceStore.setState((prev) => {
    const nextWorkspaces = prev.workspaces.filter((w) => w.id !== id);
    const nextActiveId = prev.activeWorkspaceId === id ? LOCAL_WORKSPACE_ID : prev.activeWorkspaceId;
    return {
      ...prev,
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextActiveId,
    };
  });
  persist();
}

export function renameWorkspace(id: string, name: string): void {
  workspaceStore.setState((prev) => ({
    ...prev,
    workspaces: prev.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
  }));
  persist();
}

export async function switchWorkspace(id: string): Promise<void> {
  const target = workspaceStore.state.workspaces.find((w) => w.id === id);
  if (!target) return;
  if (id === workspaceStore.state.activeWorkspaceId) return;

  try {
    await window.argos?.workspace?.switchTo(id);
  } catch (err) {
    console.warn("[workspaceStore] Preload switchTo failed:", err);
  }

  workspaceStore.setState((prev) => ({
    ...prev,
    activeWorkspaceId: id,
  }));

  try {
    await originalFetchSessions();
  } catch (err) {
    console.warn("[workspaceStore] Failed to fetch sessions after switch:", err);
  }
}

export function useWorkspaceStore() {
  const state = useStore(workspaceStore);
  const connState = useStore(connectionStore);
  return {
    ...state,
    connections: connState.connections,
    activeWorkspace: getActiveWorkspace(),
    getWorkspace: (id: string) => state.workspaces.find((w) => w.id === id),
    getConnection: (id: string) => connState.connections[id],
    addWorkspace,
    removeWorkspace,
    renameWorkspace,
    switchWorkspace,
    updateConnectionState,
  };
}
