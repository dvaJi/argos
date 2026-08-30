import { Button } from "#shadcn/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "#shadcn/components/ui/dialog";
import type { LLM_PROVIDER, RENDERER_MODEL_META } from "@argos/shared/presenter";

/** The confirmation dialogs are mutually exclusive; only one can be open at a time. */
export type ProviderDialogKind = "confirm" | "checkModel" | "disableAll" | "deleteProvider";

interface ProviderDialogContainerProps {
  provider: LLM_PROVIDER;
  modelToDisable: RENDERER_MODEL_META | null;
  checkResult: boolean;
  /** Which confirmation dialog is currently open (at most one). */
  activeDialog: ProviderDialogKind | null;
  onActiveDialogChange: (dialog: ProviderDialogKind | null) => void;
  onConfirmDisableModel?: () => void;
  onConfirmDisableAllModels?: () => void;
  onConfirmDeleteProvider?: () => void;
}

export default function ProviderDialogContainer({
  provider,
  modelToDisable,
  checkResult,
  activeDialog,
  onActiveDialogChange,
  onConfirmDisableModel,
  onConfirmDisableAllModels,
  onConfirmDeleteProvider,
}: ProviderDialogContainerProps) {
  return (
    <div>
      <Dialog open={activeDialog === "confirm"} onOpenChange={(open) => onActiveDialogChange(open ? "confirm" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Model</DialogTitle>
            <DialogDescription>
              Are you sure you want to disable "{modelToDisable?.name}"? This model will no longer be available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onActiveDialogChange(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmDisableModel}>
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeDialog === "checkModel"}
        onOpenChange={(open) => onActiveDialogChange(open ? "checkModel" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{checkResult ? "Verification Successful" : "Verification Failed"}</DialogTitle>
            <DialogDescription>
              {checkResult
                ? "Your API key has been verified successfully."
                : "API key verification failed. Please check your key and try again."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onActiveDialogChange(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeDialog === "disableAll"}
        onOpenChange={(open) => onActiveDialogChange(open ? "disableAll" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable All Models</DialogTitle>
            <DialogDescription>Are you sure you want to disable all models for "{provider.name}"?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onActiveDialogChange(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmDisableAllModels}>
              Disable All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeDialog === "deleteProvider"}
        onOpenChange={(open) => onActiveDialogChange(open ? "deleteProvider" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Provider</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{provider.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onActiveDialogChange(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmDeleteProvider}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
