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
  pendingCredentialRef: string | null;
}

const remoteSetupStore = new Store<RemoteSetupState>({
  open: false,
  recoveryWorkspace: null,
  handlers: null,
  pendingCredentialRef: null,
});

export function registerHandlers(handlers: RemoteSetupHandlers): void {
  const previous = remoteSetupStore.state.handlers;
  if (
    previous &&
    previous.onSave === handlers.onSave &&
    previous.onSaveAndSwitch === handlers.onSaveAndSwitch &&
    previous.remoteUrls.length === handlers.remoteUrls.length &&
    previous.remoteUrls.every((url, index) => url === handlers.remoteUrls[index])
  ) {
    return;
  }
  remoteSetupStore.setState((prev) => ({ ...prev, handlers }));
}

function openRemoteDialog(workspace?: WorkspaceEntry | null): void {
  remoteSetupStore.setState((prev) => ({
    ...prev,
    open: true,
    recoveryWorkspace: workspace ?? null,
  }));
}

function setPendingCredentialRef(credentialRef: string | null): void {
  remoteSetupStore.setState((prev) => ({ ...prev, pendingCredentialRef: credentialRef }));
}

async function closeRemoteDialog(): Promise<void> {
  const { pendingCredentialRef } = remoteSetupStore.state;
  if (pendingCredentialRef) {
    try {
      await window.argos?.workspace?.discardCredential?.(pendingCredentialRef);
    } catch {
      // The stored credential is revocable; failing to revoke here is non-fatal.
    }
  }
  remoteSetupStore.setState((prev) => ({
    ...prev,
    open: false,
    recoveryWorkspace: null,
    pendingCredentialRef: null,
  }));
}

async function saveWorkspace(workspace: WorkspaceDraft): Promise<void> {
  const { handlers, pendingCredentialRef } = remoteSetupStore.state;
  if (!handlers) {
    if (pendingCredentialRef) await closeRemoteDialog();
    return;
  }
  await handlers.onSave(workspace);
  remoteSetupStore.setState((prev) => ({ ...prev, pendingCredentialRef: null }));
  closeRemoteDialog().catch(() => undefined);
}

async function saveWorkspaceAndSwitch(workspace: WorkspaceDraft): Promise<void> {
  const { handlers, pendingCredentialRef } = remoteSetupStore.state;
  if (!handlers?.onSaveAndSwitch) {
    if (pendingCredentialRef) await closeRemoteDialog();
    return;
  }
  await handlers.onSaveAndSwitch(workspace);
  remoteSetupStore.setState((prev) => ({ ...prev, pendingCredentialRef: null }));
  closeRemoteDialog().catch(() => undefined);
}

export function useRemoteSetupStore() {
  const state = useStore(remoteSetupStore);
  return {
    ...state,
    registerHandlers,
    openRemoteDialog,
    setPendingCredentialRef,
    closeRemoteDialog,
    saveWorkspace,
    saveWorkspaceAndSwitch,
  };
}
