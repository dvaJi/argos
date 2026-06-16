import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shadcn/components/ui/dialog";
import { Button } from "@shadcn/components/ui/button";
import { Checkbox } from "@shadcn/components/ui/checkbox";
import { useLegacyPresenter } from "@api/legacy/presenters";
import type { NewDiscovery } from "@shared/types/skillSync";
import { SKILL_SYNC_EVENTS } from "@/events";

interface SyncPromptDialogProps {
  onImport: (toolIds: string[]) => void;
  onClose: () => void;
}

const toolIcons: Record<string, string> = {
  "claude-code": "simple-icons:anthropic",
  cursor: "simple-icons:cursor",
  windsurf: "lucide:wind",
  copilot: "simple-icons:github",
  "copilot-user": "simple-icons:github",
  kiro: "lucide:sparkles",
  antigravity: "lucide:rocket",
  codex: "simple-icons:openai",
  opencode: "lucide:code-2",
  goose: "lucide:bird",
  kilocode: "lucide:binary",
};

const toolIconBgs: Record<string, string> = {
  "claude-code": "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  cursor: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  windsurf: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400",
  copilot: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  "copilot-user": "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  kiro: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
  antigravity: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  codex: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  opencode: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
  goose: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  kilocode: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
};

export default function SyncPromptDialog({ onImport, onClose }: SyncPromptDialogProps) {
  const skillSyncPresenter = useLegacyPresenter("skillSyncPresenter");
  const [isOpen, setIsOpen] = useState(false);
  const [discoveries, setDiscoveries] = useState<NewDiscovery[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const handleSkip = async () => {
    if (dontShowAgain) {
      await skillSyncPresenter.acknowledgeDiscoveries();
    }
    setIsOpen(false);
    onClose();
  };

  const handleImportAction = async () => {
    await skillSyncPresenter.acknowledgeDiscoveries();
    setIsOpen(false);
    onImport(Array.from(selectedTools));
  };

  useEffect(() => {
    const handler = (_event: unknown, data: { discoveries: NewDiscovery[] }) => {
      if (data.discoveries?.length) {
        setDiscoveries(data.discoveries);
        setSelectedTools(new Set(data.discoveries.map((d) => d.toolId)));
        setIsOpen(true);
      }
    };

    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on(SKILL_SYNC_EVENTS.NEW_DISCOVERIES, handler);
      return () => {
        window.electron.ipcRenderer.removeListener(SKILL_SYNC_EVENTS.NEW_DISCOVERIES, handler);
      };
    }
    return;
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="lucide:wand-sparkles" className="w-5 h-5 text-primary" />
            New Skills Detected
          </DialogTitle>
          <DialogDescription>The following tools have skills that can be imported</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {discoveries.map((discovery) => (
            <div key={discovery.toolId} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${toolIconBgs[discovery.toolId] || "bg-gray-100 text-gray-600"}`}
                >
                  <Icon icon={toolIcons[discovery.toolId] || "lucide:box"} className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-medium text-sm">{discovery.toolName}</div>
                  <div className="text-xs text-muted-foreground">
                    {discovery.newSkills.length} skill{discovery.newSkills.length !== 1 ? "s" : ""} available
                  </div>
                </div>
              </div>
              <Checkbox
                checked={selectedTools.has(discovery.toolId)}
                onCheckedChange={() => toggleTool(discovery.toolId)}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={dontShowAgain} onCheckedChange={(v) => setDontShowAgain(!!v)} />
          <span>Don't show again</span>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleSkip}>
            Skip
          </Button>
          <Button disabled={selectedTools.size === 0} onClick={handleImportAction}>
            <Icon icon="lucide:download" className="w-4 h-4 mr-1" />
            Import Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
