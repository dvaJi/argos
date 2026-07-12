import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";

interface PromptSettingsHeaderProps {
  onImport: () => void;
  onExport: () => void;
}

export default function PromptSettingsHeader({ onImport, onExport }: PromptSettingsHeaderProps) {
  return (
    <div className="flex flex-row items-center justify-between">
      <span className="font-medium">Prompt Settings</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onExport}>
          <Icon icon="lucide:download" className="mr-1 h-4 w-4" />
          Export
        </Button>
        <Button variant="outline" size="sm" onClick={onImport}>
          <Icon icon="lucide:upload" className="mr-1 h-4 w-4" />
          Import
        </Button>
      </div>
    </div>
  );
}
