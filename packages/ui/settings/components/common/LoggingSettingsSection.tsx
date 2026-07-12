import { useState, useMemo } from "react";
import { useStore } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Switch } from "#shadcn/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { useLegacyPresenter } from "#api/legacy/presenters";
import { uiSettingsStore, setLoggingEnabled } from "#/stores/uiSettingsStore";
import { languageStore } from "#/stores/language";

export default function LoggingSettingsSection() {
  const configPresenter = useLegacyPresenter("configPresenter");
  const loggingEnabled = useStore(uiSettingsStore, (s) => s.loggingEnabled);

  const [isLoggingDialogOpen, setIsLoggingDialogOpen] = useState(false);
  const [newLoggingValue, setNewLoggingValue] = useState(false);

  const handleLoggingChange = (value: boolean) => {
    setNewLoggingValue(value);
    setIsLoggingDialogOpen(true);
  };

  const cancelLoggingChange = () => {
    setIsLoggingDialogOpen(false);
  };

  const confirmLoggingChange = () => {
    void setLoggingEnabled(newLoggingValue);
    setIsLoggingDialogOpen(false);
  };

  const openLogFolder = () => {
    configPresenter.openLoggingFolder();
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3 h-10">
        <div
          className="flex items-center gap-2 text-sm font-medium shrink-0 min-w-[220px]"
          dir={languageStore.state.dir}
        >
          <Icon icon="lucide:file-text" className="w-4 h-4 text-muted-foreground" />
          <span className="truncate">Enable logging</span>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 ltr:ml-2 rtl:mr-2"
            dir={languageStore.state.dir}
            onClick={openLogFolder}
          >
            <Icon icon="lucide:external-link" className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Open log folder</span>
          </Button>
        </div>
        <Switch
          id="logging-switch"
          className="ml-auto"
          checked={loggingEnabled}
          onCheckedChange={handleLoggingChange}
        />
      </div>

      <Dialog open={isLoggingDialogOpen} onOpenChange={(open) => !open && cancelLoggingChange()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change logging setting</DialogTitle>
            <DialogDescription>
              <div className="space-y-2">
                <p>
                  {newLoggingValue
                    ? "Logging will be enabled. Log files may contain sensitive information."
                    : "Logging will be disabled. Existing log files will be kept."}
                </p>
                <p>The change will take effect after restarting the application.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelLoggingChange}>
              Cancel
            </Button>
            <Button onClick={confirmLoggingChange}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
