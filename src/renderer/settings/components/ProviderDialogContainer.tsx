import { Button } from '@shadcn/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@shadcn/components/ui/dialog'
import type { LLM_PROVIDER, RENDERER_MODEL_META } from '@shared/presenter'

interface ProviderDialogContainerProps {
  provider: LLM_PROVIDER
  modelToDisable: RENDERER_MODEL_META | null
  checkResult: boolean
  showConfirmDialog: boolean
  showCheckModelDialog: boolean
  showDisableAllConfirmDialog: boolean
  showDeleteProviderDialog: boolean
  onShowConfirmDialogChange: (value: boolean) => void
  onShowCheckModelDialogChange: (value: boolean) => void
  onShowDisableAllConfirmDialogChange: (value: boolean) => void
  onShowDeleteProviderDialogChange: (value: boolean) => void
  onConfirmDisableModel?: () => void
  onConfirmDisableAllModels?: () => void
  onConfirmDeleteProvider?: () => void
}

export default function ProviderDialogContainer({
  provider,
  modelToDisable,
  checkResult,
  showConfirmDialog,
  showCheckModelDialog,
  showDisableAllConfirmDialog,
  showDeleteProviderDialog,
  onShowConfirmDialogChange,
  onShowCheckModelDialogChange,
  onShowDisableAllConfirmDialogChange,
  onShowDeleteProviderDialogChange,
  onConfirmDisableModel,
  onConfirmDisableAllModels,
  onConfirmDeleteProvider
}: ProviderDialogContainerProps) {
  return (
    <div>
      <Dialog open={showConfirmDialog} onOpenChange={onShowConfirmDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Model</DialogTitle>
            <DialogDescription>
              Are you sure you want to disable "{modelToDisable?.name}"? This model will no longer
              be available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onShowConfirmDialogChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmDisableModel}>
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCheckModelDialog} onOpenChange={onShowCheckModelDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {checkResult ? 'Verification Successful' : 'Verification Failed'}
            </DialogTitle>
            <DialogDescription>
              {checkResult
                ? 'Your API key has been verified successfully.'
                : 'API key verification failed. Please check your key and try again.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onShowCheckModelDialogChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDisableAllConfirmDialog} onOpenChange={onShowDisableAllConfirmDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable All Models</DialogTitle>
            <DialogDescription>
              Are you sure you want to disable all models for "{provider.name}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onShowDisableAllConfirmDialogChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmDisableAllModels}>
              Disable All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteProviderDialog} onOpenChange={onShowDeleteProviderDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Provider</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{provider.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onShowDeleteProviderDialogChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmDeleteProvider}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
