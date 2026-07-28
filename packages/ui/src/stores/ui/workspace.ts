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
} from "@argos/shared/workspaceConfig";
import type { ConnectionState } from "@argos/shared-contracts/connection";
import { clearSessionContextForMachineSwitch, fetchSessions as originalFetchSessions } from "./session";

export type { WorkspaceEntry, WorkspaceMode };

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

export async function removeWorkspace(
  id: string,
  revokeRemoteSession = false,
): Promise<{ localRemoved: boolean; remoteRevoked: boolean | null }> {
  if (id === LOCAL_WORKSPACE_ID) return { localRemoved: false, remoteRevoked: null };

  let removal = { localRemoved: true, remoteRevoked: null as boolean | null };
  try {
    removal =
      (await window.argos?.workspace?.remove(id, revokeRemoteSession)) ??
      ({ localRemoved: true, remoteRevoked: null } as const);
  } catch (err) {
    console.warn("[workspaceStore] Preload remove failed:", err);
    removal = { localRemoved: true, remoteRevoked: revokeRemoteSession ? false : null };
  }

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
  return removal;
}

export function renameWorkspace(id: string, name: string): void {
  workspaceStore.setState((prev) => ({
    ...prev,
    workspaces: prev.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
  }));
  persist();
}

export function updateWorkspace(id: string, patch: Partial<Omit<WorkspaceEntry, "id" | "createdAt">>): void {
  workspaceStore.setState((prev) => ({
    ...prev,
    workspaces: prev.workspaces.map((workspace) => (workspace.id === id ? { ...workspace, ...patch } : workspace)),
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
    return;
  }

  clearSessionContextForMachineSwitch();

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
    updateWorkspace,
    switchWorkspace,
    updateConnectionState,
  };
}
