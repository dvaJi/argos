import { useState } from "react";
import { Badge } from "@shadcn/components/ui/badge";
import { Icon } from "@iconify/react";
import type { ArgosTapeViewManifestRecord } from "@shared/types/tape-view-manifest";

interface ManifestPanelProps {
  record: ArgosTapeViewManifestRecord;
}

function refKey(messageId: string | null, entryId: number | null, reason: string): string {
  return `${messageId ?? "n"}-${entryId ?? "n"}-${reason}`;
}

export default function ManifestPanel({ record }: ManifestPanelProps) {
  const [showRefs, setShowRefs] = useState(false);
  const { manifest, integrity } = record;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={integrity === "valid" ? "default" : integrity === "invalid" ? "destructive" : "secondary"}>
          {integrity === "valid" ? "Intact" : integrity === "invalid" ? "Tampered" : "Unverified"}
        </Badge>
        <span className="text-xs text-muted-foreground font-mono">{manifest.viewId}</span>
        {manifest.parentViewId && (
          <span className="text-xs text-muted-foreground">
            <Icon icon="lucide:arrow-left" className="inline w-3 h-3" /> {manifest.parentViewId}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Task: <span className="text-foreground">{manifest.taskType}</span>
        </span>
        <span>
          Policy: <span className="text-foreground">{manifest.policy}</span>
        </span>
        <span>
          Budget: <span className="text-foreground">{manifest.tokenBudget.estimatedPromptTokens}</span> /{" "}
          {manifest.tokenBudget.contextLength} tokens
        </span>
        <span>
          Hash: <span className="text-foreground font-mono">{manifest.hashes.manifestHash.slice(0, 12)}</span>
        </span>
      </div>

      <div className="text-xs">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition"
          onClick={() => setShowRefs(!showRefs)}
        >
          {manifest.included.length} included, {manifest.excluded.length} excluded{" "}
          <Icon icon={showRefs ? "lucide:chevron-up" : "lucide:chevron-down"} className="inline w-3 h-3" />
        </button>
        {showRefs && (
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
            {manifest.included.length > 0 && (
              <div>
                <div className="font-semibold text-foreground mb-1">Included</div>
                {manifest.included.map((ref) => (
                  <div
                    key={refKey(ref.messageId, ref.entryId, ref.reason)}
                    className="flex items-center gap-2 pl-2 text-muted-foreground"
                  >
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      {ref.role ?? "—"}
                    </Badge>
                    <span>{ref.reason}</span>
                    <span className="text-[10px]">({ref.source})</span>
                    {ref.messageId && <span className="font-mono text-[10px]">{ref.messageId.slice(0, 12)}</span>}
                  </div>
                ))}
              </div>
            )}
            {manifest.excluded.length > 0 && (
              <div>
                <div className="font-semibold text-foreground mb-1">Excluded</div>
                {manifest.excluded.map((ref) => (
                  <div
                    key={refKey(ref.messageId, ref.entryId, ref.reason)}
                    className="flex items-center gap-2 pl-2 text-muted-foreground"
                  >
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      {ref.reason}
                    </Badge>
                    {ref.messageId && <span className="font-mono text-[10px]">{ref.messageId.slice(0, 12)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
