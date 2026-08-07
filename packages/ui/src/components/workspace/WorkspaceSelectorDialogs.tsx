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
import { useRemoteSetupStore } from "#/stores/ui/remoteSetup";
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

export function AddRemoteMachineDialog() {
  const remoteSetup = useRemoteSetupStore();
  const handlers = remoteSetup.handlers;

  return (
    <Dialog
      open={remoteSetup.open}
      onOpenChange={(open) => {
        if (!open) remoteSetup.closeRemoteDialog();
      }}
      modal={false}
    >
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect a remote machine</DialogTitle>
          <DialogDescription>
            Install Argos Server on another machine, pair it securely, and choose where work runs.
          </DialogDescription>
        </DialogHeader>
        {handlers ? (
          <RemoteWorkspaceSetup
            existingRemoteUrls={handlers.remoteUrls}
            initialRemoteUrl={remoteSetup.recoveryWorkspace?.remoteUrl}
            onAddWorkspace={remoteSetup.saveWorkspace}
            onSaveAndSwitch={handlers.onSaveAndSwitch ? remoteSetup.saveWorkspaceAndSwitch : undefined}
            onCancel={remoteSetup.closeRemoteDialog}
          />
        ) : (
          <div className="flex flex-col items-start gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Remote workspace management is temporarily unavailable. Re-open the machine list and try again.
            </p>
            <Button variant="outline" onClick={remoteSetup.closeRemoteDialog}>
              Close
            </Button>
          </div>
        )}
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
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void (edit?.kind === "rename" ? onSaveName() : onSaveAddress());
          }}
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
