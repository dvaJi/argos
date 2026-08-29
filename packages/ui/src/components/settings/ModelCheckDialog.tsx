import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "#shadcn/components/ui/dialog";
import { useModelStore } from "#/stores/modelStore";
import { useProviderStore } from "#/stores/providerStore";
interface ModelCheckDialogProps {
  open: boolean;
  providerId: string;
  onOpenChange: (value: boolean) => void;
}
export default function ModelCheckDialog({ open, providerId, onOpenChange }: ModelCheckDialogProps) {
  const modelStore = useModelStore();
  const providerStore = useProviderStore();
  const [isOpen, setIsOpen] = useState(open);
  const [isChecking, setIsChecking] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [result, setResult] = useState<{
    isOk: boolean;
    errorMsg: string | null;
  } | null>(null);
  const availableModels = (() => {
    const providerModels = modelStore.allProviderModels.find((p) => p.providerId === providerId);
    return providerModels?.models || [];
  })();
  const hasModels = availableModels.length > 0;
  const resetDialog = () => {
    setSelectedModelId("");
    setResult(null);
    setIsChecking(false);
  };

  // Mirror the parent-driven `open` prop into the local isOpen state using a
  // prev-compare adjustment during render (no effect-triggered cascade).
  const [syncedOpen, setSyncedOpen] = useState(open);
  if (syncedOpen !== open) {
    setSyncedOpen(open);
    if (open && !isOpen) {
      resetDialog();
    }
    setIsOpen(open);
  }

  // Notify the parent whenever the local open state changes. The latest
  // callback is kept in a ref so the effect only fires on isOpen changes.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);
  useEffect(() => {
    onOpenChangeRef.current(isOpen);
  }, [isOpen]);
  const handleOpenChange = (value: boolean) => {
    setIsOpen(value);
    if (!value) resetDialog();
  };
  const closeDialog = () => {
    setIsOpen(false);
  };
  const handleCheck = async () => {
    if (!selectedModelId) return;
    try {
      setIsChecking(true);
      setResult(null);
      const checkResult = await providerStore.checkProvider(providerId, selectedModelId);
      setResult(checkResult);
    } catch (error) {
      setResult({
        isOk: false,
        errorMsg: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
    setIsChecking(false);
  };
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="model-check-dialog"
        className="sm:max-w-[500px] max-h-[80vh] overflow-hidden flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>Model Check</DialogTitle>
          <DialogDescription>Select a model to verify the provider connection</DialogDescription>
        </DialogHeader>

        {result && (
          <div className="mb-4 shrink-0">
            {result.isOk ? (
              <div
                data-testid="model-check-result"
                data-success="true"
                className="p-4 bg-green-50 border border-green-200 rounded-lg"
              >
                <div className="flex items-center">
                  <Icon icon="lucide:check-circle" className="w-5 h-5 text-green-600 mr-2 shrink-0" />
                  <span className="text-green-800 font-medium">Connection successful</span>
                </div>
              </div>
            ) : (
              <div
                data-testid="model-check-result"
                data-success="false"
                className="p-4 bg-red-50 border border-red-200 rounded-lg"
              >
                <div className="flex items-start">
                  <Icon icon="lucide:x-circle" className="w-5 h-5 text-red-600 mr-2 mt-0.5 shrink-0" />
                  <div className="text-red-800 min-w-0 flex-1">
                    <div className="font-medium">Connection failed</div>
                    <div className="text-sm mt-1 break-words whitespace-pre-wrap overflow-y-auto max-h-40">
                      {result.errorMsg}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {!hasModels && !result && (
            <div className="py-6">
              <div className="text-center text-muted-foreground">
                <Icon icon="lucide:info" className="w-8 h-8 mx-auto mb-2" />
                <p>No models available for this provider</p>
              </div>
            </div>
          )}

          {!result && hasModels && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="model" className="text-right">
                  Model
                </Label>
                <Select value={selectedModelId} onValueChange={(v) => setSelectedModelId(v ?? "")}>
                  <SelectTrigger data-testid="model-check-select" className="col-span-3">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {availableModels.map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                        data-testid="model-check-option"
                        data-model-id={model.id}
                      >
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isChecking && (
            <div className="flex items-center justify-center py-6">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3" />
                <span className="text-muted-foreground">Checking...</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={closeDialog}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && hasModels && (
            <Button
              data-testid="model-check-submit"
              type="button"
              disabled={!selectedModelId || isChecking}
              onClick={handleCheck}
            >
              {isChecking && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />}
              {isChecking ? "Checking..." : "Test Connection"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
