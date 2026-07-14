import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import type { ScanResult } from "@argos/shared/types/skillSync";

interface SyncStatusCardProps {
  tool: ScanResult;
  onSync: (toolId: string) => void;
}

const getToolIcon = (toolId: string): string => {
  const icons: Record<string, string> = {
    "claude-code": "simple-icons:anthropic",
    cursor: "simple-icons:cursor",
    "cursor-project": "simple-icons:cursor",
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
  return icons[toolId] || "lucide:box";
};

const getToolIconBg = (toolId: string): string => {
  const bgs: Record<string, string> = {
    "claude-code": "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    cursor: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    "cursor-project": "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
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
  return bgs[toolId] || "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400";
};

export default function SyncStatusCard({ tool, onSync }: SyncStatusCardProps) {
  const skillCount = tool.skills?.length ?? 0;

  return (
    <div className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent">
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative shrink-0">
          <div className={`flex size-8 items-center justify-center rounded ${getToolIconBg(tool.toolId)}`}>
            <Icon icon={getToolIcon(tool.toolId)} aria-hidden="true" className="size-4" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{tool.toolName}</div>
          <div className="text-xs text-muted-foreground">
            {skillCount} skill{skillCount === 1 ? "" : "s"} found
          </div>
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="ml-2 h-7 shrink-0 px-2 text-xs"
        aria-label={`Import skills from ${tool.toolName}`}
        onClick={() => onSync(tool.toolId)}
      >
        <Icon icon="lucide:download" aria-hidden="true" className="mr-1 size-3.5" />
        Import
      </Button>
    </div>
  );
}
