import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import type { LLM_PROVIDER } from "@argos/shared/presenter";
import { useLegacyPresenter } from "#api/legacy/presenters";

interface ModelScopeMcpSyncProps {
  provider: LLM_PROVIDER;
}

export default function ModelScopeMcpSync({ provider }: ModelScopeMcpSyncProps) {
  const llmP = useLegacyPresenter("llmproviderPresenter");

  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [syncResult, setSyncResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const [syncOptions, setSyncOptions] = useState({
    page_number: 1,
    page_size: 50,
  });

  const handleSync = async () => {
    if (!provider.apiKey) {
      setErrorMessage("API key is required for sync");
      return;
    }

    setIsSyncing(true);
    setErrorMessage("");
    setSyncResult(null);

    try {
      const result = await llmP.syncModelScopeMcpServers(provider.id, syncOptions);
      setSyncResult(result);
    } catch (error) {
      console.error("MCP sync error:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="p-2 border rounded-lg bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:cloud-download" className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">ModelScope MCP Sync</span>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Sync MCP server configurations from ModelScope</p>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground whitespace-nowrap">Per page</span>
          <select
            value={syncOptions.page_size}
            onChange={(e) => setSyncOptions((prev) => ({ ...prev, page_size: Number(e.target.value) }))}
            className="w-16 h-6 text-xs px-1 border rounded bg-background border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span className="text-muted-foreground whitespace-nowrap">items, page</span>
          <input
            value={syncOptions.page_number}
            onChange={(e) => setSyncOptions((prev) => ({ ...prev, page_number: Number(e.target.value) }))}
            type="number"
            min={1}
            className="w-16 h-6 text-xs px-1 border rounded bg-background border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button onClick={handleSync} disabled={isSyncing} size="sm" className="h-6 px-2 text-xs ml-auto">
            {isSyncing ? (
              <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Icon icon="lucide:download" className="h-3 w-3 mr-1" />
            )}
            {isSyncing ? "Syncing..." : "Sync"}
          </Button>
        </div>

        {syncResult && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-xs px-2 py-0.5 rounded border border-green-500/30 text-green-600 bg-green-500/10">
              Imported: {syncResult.imported}
            </span>
            {syncResult.skipped > 0 && (
              <span className="text-xs px-2 py-0.5 rounded border border-amber-500/30 text-amber-600 bg-amber-500/10">
                Skipped: {syncResult.skipped}
              </span>
            )}
            {syncResult.errors.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded border border-red-500/30 text-red-600 bg-red-500/10">
                Errors: {syncResult.errors.length}
              </span>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
            {errorMessage}
          </div>
        )}

        {syncResult && syncResult.errors.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-destructive">Error details:</div>
            <div className="max-h-20 overflow-y-auto p-1 bg-muted/40 rounded text-xs">
              {syncResult.errors.map((error, index) => (
                <div key={index} className="text-muted-foreground py-0.5 border-b border-border/40 last:border-0">
                  {error}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
