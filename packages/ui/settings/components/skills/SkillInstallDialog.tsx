import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#shadcn/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#shadcn/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#shadcn/components/ui/alert-dialog";
import { useToast } from "#/components/use-toast";
import { useSkillsStore, installFromFolder, installFromZip, installFromUrl } from "#/stores/skillsStore";
import { createDeviceClient } from "#api/DeviceClient";

interface SkillInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void;
}

export default function SkillInstallDialog({ open, onOpenChange, onInstalled }: SkillInstallDialogProps) {
  const { toast } = useToast();
  const skillsStore = useSkillsStore();
  const deviceClient = useMemo(() => createDeviceClient(), []);

  const [activeTab, setActiveTab] = useState("folder");
  const [installUrl, setInstallUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictSkillName, setConflictSkillName] = useState("");
  const [pendingInstallAction, setPendingInstallAction] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!open) {
      setPendingInstallAction(null);
      setConflictDialogOpen(false);
      setConflictSkillName("");
    }
  }, [open]);

  const handleInstallResult = (
    result: { success: boolean; error?: string; skillName?: string },
    retryWithOverwrite: () => Promise<void>,
  ) => {
    if (result.success) {
      toast({
        title: "Installed successfully",
        description: `Skill "${result.skillName}" installed`,
      });
      onInstalled();
      onOpenChange(false);
    } else if (result.error?.includes("already exists")) {
      const name = result.error.match(/"([^"]+)"/)?.[1] || "";
      setConflictSkillName(name);
      setPendingInstallAction(() => retryWithOverwrite);
      setConflictDialogOpen(true);
    } else {
      toast({ title: "Installation failed", description: result.error, variant: "destructive" });
    }
  };

  const selectFolder = async () => {
    if (installing) return;
    try {
      const result = await deviceClient.selectDirectory();
      if (!result.canceled && result.filePaths.length > 0) {
        await tryInstallFromFolder(result.filePaths[0]);
      }
    } catch (error) {
      showError(error);
    }
  };

  const tryInstallFromFolder = async (folderPath: string, overwrite = false) => {
    setInstalling(true);
    try {
      const result = await installFromFolder(folderPath, { overwrite });
      handleInstallResult(result, () => tryInstallFromFolder(folderPath, true));
    } finally {
      setInstalling(false);
    }
  };

  const selectZip = async () => {
    if (installing) return;
    try {
      const result = await deviceClient.selectFiles({
        filters: [{ name: "ZIP Files", extensions: ["zip"] }],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        await tryInstallFromZip(result.filePaths[0]);
      }
    } catch (error) {
      showError(error);
    }
  };

  const tryInstallFromZip = async (zipPath: string, overwrite = false) => {
    setInstalling(true);
    try {
      const result = await installFromZip(zipPath, { overwrite });
      handleInstallResult(result, () => tryInstallFromZip(zipPath, true));
    } finally {
      setInstalling(false);
    }
  };

  const isValidUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  const handleInstallFromUrl = async () => {
    if (!installUrl || installing) return;
    if (!isValidUrl(installUrl)) {
      toast({
        title: "Installation failed",
        description: "Invalid URL format.",
        variant: "destructive",
      });
      return;
    }
    await tryInstallFromUrl(installUrl);
  };

  const tryInstallFromUrl = async (url: string, overwrite = false) => {
    setInstalling(true);
    try {
      const result = await installFromUrl(url, { overwrite });
      handleInstallResult(result, () => tryInstallFromUrl(url, true));
      if (result.success) setInstallUrl("");
    } finally {
      setInstalling(false);
    }
  };

  const handleConflictCancel = () => {
    setConflictDialogOpen(false);
    setPendingInstallAction(null);
    setConflictSkillName("");
  };

  const handleConflictOverwrite = async () => {
    setConflictDialogOpen(false);
    if (pendingInstallAction) {
      await pendingInstallAction();
      setPendingInstallAction(null);
    }
    setConflictSkillName("");
  };

  const showError = (error: unknown) => {
    toast({ title: "Installation failed", description: String(error), variant: "destructive" });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Install Skill</DialogTitle>
            <DialogDescription>Install a skill from a folder, ZIP file, or URL</DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="folder">
                <Icon icon="lucide:folder" className="w-4 h-4 mr-1" />
                Folder
              </TabsTrigger>
              <TabsTrigger value="zip">
                <Icon icon="lucide:file-archive" className="w-4 h-4 mr-1" />
                ZIP
              </TabsTrigger>
              <TabsTrigger value="url">
                <Icon icon="lucide:link" className="w-4 h-4 mr-1" />
                URL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="folder" className="mt-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={selectFolder}
              >
                <Icon
                  icon={installing ? "lucide:loader-2" : "lucide:folder-open"}
                  className={`w-10 h-10 mx-auto text-muted-foreground mb-2 ${installing ? "animate-spin" : ""}`}
                />
                <p className="text-sm text-muted-foreground">Click to select a skill folder</p>
              </div>
              <p className="text-xs text-muted-foreground/70 mt-2">Select a folder containing a SKILL.md file</p>
            </TabsContent>

            <TabsContent value="zip" className="mt-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={selectZip}
              >
                <Icon
                  icon={installing ? "lucide:loader-2" : "lucide:file-archive"}
                  className={`w-10 h-10 mx-auto text-muted-foreground mb-2 ${installing ? "animate-spin" : ""}`}
                />
                <p className="text-sm text-muted-foreground">Click to select a ZIP file</p>
              </div>
            </TabsContent>

            <TabsContent value="url" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Input
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                  placeholder="https://example.com/skill.zip"
                  disabled={installing}
                />
                <p className="text-xs text-muted-foreground/70">Enter a URL to a skill ZIP file or Git repository</p>
              </div>
              <Button className="w-full" disabled={!installUrl || installing} onClick={handleInstallFromUrl}>
                {installing && <Icon icon="lucide:loader-2" className="w-4 h-4 mr-2 animate-spin" />}
                Install
              </Button>
            </TabsContent>
          </Tabs>

          {installing && (
            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" />
                <span>Installing...</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skill Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              A skill named "{conflictSkillName}" already exists. Overwrite?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleConflictCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConflictOverwrite}>Overwrite</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
