import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import type { WorkspaceDraft } from "#/components/workspace/WorkspaceSelectorDialogs";
import type { WorkspaceEntry } from "@argos/shared/workspaceConfig";

export type { WorkspaceDraft };

export interface RemoteSetupHandlers {
  remoteUrls: string[];
  onSave: (workspace: WorkspaceDraft) => Promise<void>;
  onSaveAndSwitch?: (workspace: WorkspaceDraft) => Promise<void>;
}

interface RemoteSetupState {
  open: boolean;
  recoveryWorkspace: WorkspaceEntry | null;
  handlers: RemoteSetupHandlers | null;
}

const remoteSetupStore = new Store<RemoteSetupState>({
  open: false,
  recoveryWorkspace: null,
  handlers: null,
});

function registerHandlers(handlers: RemoteSetupHandlers): void {
  remoteSetupStore.setState((prev) => ({ ...prev, handlers }));
}

function clearHandlers(): void {
  remoteSetupStore.setState((prev) => ({ ...prev, handlers: null }));
}

function openRemoteDialog(workspace?: WorkspaceEntry | null): void {
  remoteSetupStore.setState((prev) => ({
    ...prev,
    open: true,
    recoveryWorkspace: workspace ?? null,
  }));
}

function closeRemoteDialog(): void {
  remoteSetupStore.setState((prev) => ({
    ...prev,
    open: false,
    recoveryWorkspace: null,
  }));
}

async function saveWorkspace(workspace: WorkspaceDraft): Promise<void> {
  const { handlers } = remoteSetupStore.state;
  if (!handlers) return;
  await handlers.onSave(workspace);
  closeRemoteDialog();
}

async function saveWorkspaceAndSwitch(workspace: WorkspaceDraft): Promise<void> {
  const { handlers } = remoteSetupStore.state;
  if (!handlers?.onSaveAndSwitch) return;
  await handlers.onSaveAndSwitch(workspace);
  closeRemoteDialog();
}

export function useRemoteSetupStore() {
  const state = useStore(remoteSetupStore);
  return {
    ...state,
    registerHandlers,
    clearHandlers,
    openRemoteDialog,
    closeRemoteDialog,
    saveWorkspace,
    saveWorkspaceAndSwitch,
  };
}
