import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { RemoteWorkspaceSetup } from "./RemoteWorkspaceSetup";
import type { WorkspaceEntry } from "#/stores/ui/workspace";

export type WorkspaceDraft = {
  name: string;
  remoteUrl: string;
  credentialRef?: string;
  environmentId?: string;
  daemonVersion?: string;
  protocolVersion?: number;
  capabilities?: string[];
};

export type MachineEdit = {
  kind: "rename" | "address";
  workspace: WorkspaceEntry;
  value: string;
};

export function AddRemoteMachineDialog({
  open,
  remoteUrls,
  recoveryWorkspace,
  onOpenChange,
  onSave,
  onSaveAndSwitch,
  onCancel,
}: {
  open: boolean;
  remoteUrls: string[];
  recoveryWorkspace: WorkspaceEntry | null;
  onOpenChange: (open: boolean) => void;
  onSave: (workspace: WorkspaceDraft) => Promise<void>;
  onSaveAndSwitch: (workspace: WorkspaceDraft) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          onAddWorkspace={onSave}
          onSaveAndSwitch={onSaveAndSwitch}
          onCancel={onCancel}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditMachineDialog({
  edit,
  onChange,
  onClose,
  onSaveName,
  onSaveAddress,
}: {
  edit: MachineEdit | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSaveName: () => void;
  onSaveAddress: () => Promise<void>;
}) {
  return (
    <Dialog open={Boolean(edit)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit?.kind === "rename" ? "Rename remote machine" : "Edit machine address"}</DialogTitle>
          <DialogDescription>
            {edit?.kind === "rename"
              ? "Choose the name shown in Argos Desktop."
              : "Argos verifies the same server identity before saving a new address."}
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="machine-edit-value">
          {edit?.kind === "rename" ? "Machine name" : "Remote machine address"}
        </Label>
        <Input
          id="machine-edit-value"
          value={edit?.value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void (edit?.kind === "rename" ? onSaveName() : onSaveAddress())}>
            {edit?.kind === "rename" ? "Save name" : "Verify and save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
