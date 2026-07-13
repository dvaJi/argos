import { Button } from "#shadcn/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import type { ProviderInstallPreview } from "@argos/shared/presenter";
import ModelIcon from "#/components/icons/ModelIcon";
import { useThemeStore } from "#/stores/theme";

interface ProviderDeeplinkImportDialogProps {
  open: boolean;
  preview: ProviderInstallPreview | null;
  confirmDisabled?: boolean;
  submitting?: boolean;
  onOpenChange: (value: boolean) => void;
  onConfirm?: () => void;
}

export default function ProviderDeeplinkImportDialog({
  open,
  preview,
  confirmDisabled = false,
  submitting = false,
  onOpenChange,
  onConfirm,
}: ProviderDeeplinkImportDialogProps) {
  const themeStore = useThemeStore();

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      onOpenChange(value);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Import Provider</DialogTitle>
          <DialogDescription>Confirm importing this provider configuration.</DialogDescription>
        </DialogHeader>

        {preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <ModelIcon modelId={preview.iconModelId} customClass="h-8 w-8 shrink-0" isDark={themeStore.isDark} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {preview.kind === "builtin" ? preview.id : preview.name}
                </div>
                {preview.kind === "custom" && (
                  <div className="truncate text-xs text-muted-foreground">Type: {preview.type}</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground">URL</div>
                <div className="break-all text-sm">{preview.baseUrl || "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">API Key</div>
                <div className="break-all text-sm">{preview.maskedApiKey || "-"}</div>
              </div>
            </div>

            {preview.kind === "builtin" && preview.willOverwrite && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                This will overwrite your existing configuration for this provider.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={confirmDisabled || submitting} onClick={onConfirm}>
            {submitting ? "Importing..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
