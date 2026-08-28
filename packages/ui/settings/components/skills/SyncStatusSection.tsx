import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { useToast } from "#/components/use-toast";
import { createSkillSyncClient } from "#api/SkillSyncClient";
import type { ScanResult } from "@argos/shared/types/skillSync";
import SyncStatusCard from "./SyncStatusCard";

const skillSyncClient = createSkillSyncClient();

interface SyncStatusSectionProps {
  onImport: (toolId: string, skills: string[]) => void;
}

export default function SyncStatusSection({ onImport }: SyncStatusSectionProps) {
  const { toast } = useToast();

  const [tools, setTools] = useState<ScanResult[]>([]);
  // Starts true so the initial scan (kicked off by the mount effect below)
  // shows the scanning indicator from the first paint.
  const [scanning, setScanning] = useState(true);

  const sortedTools = [...tools]
    .filter((tool) => !tool.toolId.includes("project") && tool.available && tool.skills.length > 0)
    .sort((a, b) => (b.skills?.length ?? 0) - (a.skills?.length ?? 0));

  const refresh = async () => {
    setScanning(true);
    try {
      const results = await skillSyncClient.scanExternalTools();
      setTools(Array.isArray(results) ? results : []);
    } catch (error) {
      console.error("Failed to scan external tools:", error);
      toast({
        title: "Scan Error",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
    setScanning(false);
  };

  const handleSync = (toolId: string) => {
    const tool = tools.find((t) => t.toolId === toolId);
    if (!tool || !tool.available) return;

    onImport(
      toolId,
      tool.skills.map((s) => s.name),
    );
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const results = await skillSyncClient.scanExternalTools();
        if (cancelled) return;
        setTools(Array.isArray(results) ? results : []);
      } catch (error) {
        console.error("Failed to scan external tools:", error);
        if (cancelled) return;
        toast({
          title: "Scan Error",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
      if (!cancelled) setScanning(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 pr-4">
          <h3 className="text-sm font-medium text-balance">External Skill Sources</h3>
          <p className="text-xs text-muted-foreground text-pretty">
            Compatible skill folders found in other coding tools. Importing copies them into Argos; these are not ACP
            agents.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={scanning}
          aria-label="Scan external skill sources"
          title="Scan external skill sources"
          onClick={refresh}
        >
          <Icon
            icon={scanning ? "lucide:loader-2" : "lucide:refresh-cw"}
            aria-hidden="true"
            className={`size-4 ${scanning ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {scanning && tools.length === 0 ? (
        <div className="flex items-center justify-center py-6">
          <Icon icon="lucide:loader-2" aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Scanning…</span>
        </div>
      ) : sortedTools.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-6 text-center">
          <Icon icon="lucide:inbox" aria-hidden="true" className="size-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">No External Skills Detected</p>
            <p className="text-xs text-muted-foreground text-pretty">
              Argos did not find compatible skills in supported tool folders.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={scanning} onClick={refresh}>
            Scan Again
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          {sortedTools.map((tool) => (
            <SyncStatusCard key={tool.toolId} tool={tool} onSync={handleSync} />
          ))}
        </div>
      )}
    </div>
  );
}
