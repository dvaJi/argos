import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shadcn/components/ui/dialog";
import { ScrollArea } from "@shadcn/components/ui/scroll-area";
import { MemoryManagerPanel, type MemoryManagerPanelProps } from "./MemoryManagerPanel";

export interface MemoryManagerDialogProps extends MemoryManagerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName?: string;
}

export function MemoryManagerDialog({ open, onOpenChange, agentName, ...panelProps }: MemoryManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="text-left">
          <DialogTitle>Memory{agentName ? ` — ${agentName}` : ""}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <MemoryManagerPanel {...panelProps} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
