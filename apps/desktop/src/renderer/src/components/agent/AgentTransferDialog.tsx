import { useState, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shadcn/components/ui/dialog";
import type { AgentTransferImpact, AgentTransferImpactSample } from "@shared/types/agent-interface";

export type TransferDialogAgent = {
  id: string;
  name: string;
  type: "argos" | "acp";
  enabled?: boolean;
};

interface AgentTransferDialogProps {
  open: boolean;
  mode: "delete-agent" | "move-session";
  sourceAgentId: string;
  sourceAgentName: string;
  agents: TransferDialogAgent[];
  impact?: AgentTransferImpact | null;
  sessionTitle?: string;
  loading?: boolean;
  busy?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirmMove: (payload: { targetAgentId: string }) => void;
  onConfirmDelete: () => void;
}

export default function AgentTransferDialog({
  open,
  mode,
  sourceAgentId,
  sourceAgentName,
  agents,
  impact = null,
  sessionTitle = "",
  loading = false,
  busy = false,
  error = null,
  onOpenChange,
  onConfirmMove,
  onConfirmDelete,
}: AgentTransferDialogProps) {
  const [action, setAction] = useState<"move" | "delete">("move");
  const [selectedTargetAgentId, setSelectedTargetAgentId] = useState("");

  const availableTargets = useMemo(
    () => agents.filter((agent) => agent.enabled !== false && agent.id !== sourceAgentId && agent.type === "argos"),
    [agents, sourceAgentId],
  );

  const showTargetPicker = useMemo(() => mode === "move-session" || action === "move", [mode, action]);

  const title = useMemo(
    () => (mode === "delete-agent" ? `Delete ${sourceAgentName}` : "Move Conversation"),
    [mode, sourceAgentName],
  );

  const description = useMemo(
    () =>
      mode === "delete-agent"
        ? "Choose how to handle existing conversations"
        : "Select a target agent for this conversation",
    [mode],
  );

  const confirmVariant = useMemo(() => (action === "delete" ? "destructive" : "default"), [action]);

  const confirmLabel = useMemo(() => {
    if (busy) return "Processing...";
    if (mode === "delete-agent" && action === "delete") return "Delete Agent & Sessions";
    if (mode === "delete-agent") return "Move & Delete Agent";
    return "Move Conversation";
  }, [busy, mode, action]);

  const canConfirm = useMemo(() => {
    if (busy || loading || error) return false;
    if (impact?.blockedSessions) return false;
    if (!showTargetPicker) return true;
    return Boolean(selectedTargetAgentId);
  }, [busy, loading, error, impact, showTargetPicker, selectedTargetAgentId]);

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    if (mode === "delete-agent" && action === "delete") {
      onConfirmDelete();
      return;
    }
    onConfirmMove({ targetAgentId: selectedTargetAgentId });
  }, [canConfirm, mode, action, onConfirmDelete, onConfirmMove, selectedTargetAgentId]);

  const getSampleStateLabel = useCallback((sample: AgentTransferImpactSample): string => {
    if (sample.blockReason) return `Blocked: ${sample.blockReason}`;
    if (sample.isDraft) return "Draft";
    if (sample.sessionKind === "subagent") return "Sub-agent";
    return "Ready";
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden p-0"
        style={{ maxHeight: "min(720px, calc(100vh - 2rem))" }}
      >
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              Loading transfer details...
            </div>
          ) : (
            <div className="space-y-4">
              {mode === "delete-agent" && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Total Sessions</div>
                      <div className="text-lg font-semibold">{impact?.totalSessions ?? 0}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Movable Sessions</div>
                      <div className="text-lg font-semibold">{impact?.movableSessions ?? 0}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Empty Drafts</div>
                      <div className="text-lg font-semibold">{impact?.emptyDrafts ?? 0}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Blocked Sessions</div>
                      <div className="text-lg font-semibold">{impact?.blockedSessions ?? 0}</div>
                    </div>
                  </div>
                </div>
              )}

              {mode === "delete-agent" && (
                <div className="space-y-2">
                  <label className="flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={action === "move"}
                      onChange={() => setAction("move")}
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">Move sessions before deleting</span>
                      <span className="block text-sm text-muted-foreground">
                        Transfer conversations to another agent
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={action === "delete"}
                      onChange={() => setAction("delete")}
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">Delete all sessions</span>
                      <span className="block text-sm text-muted-foreground">Permanently remove all conversations</span>
                    </span>
                  </label>
                </div>
              )}

              {showTargetPicker && (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="agent-transfer-target">
                    Target Agent
                  </label>
                  <select
                    id="agent-transfer-target"
                    value={selectedTargetAgentId}
                    onChange={(e) => setSelectedTargetAgentId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="" disabled>
                      Select target agent
                    </option>
                    {availableTargets.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} · {agent.type}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Only Argos agents are supported as targets</p>
                </div>
              )}

              {mode === "move-session" && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="font-medium">{sessionTitle}</div>
                  <div className="mt-1 text-muted-foreground">Current agent: {sourceAgentName}</div>
                </div>
              )}

              {impact?.samples && impact.samples.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Related Sessions</div>
                  <div className="space-y-2">
                    {impact.samples.map((sample) => (
                      <div key={sample.id} className="rounded-md border p-3 text-sm">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{sample.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {sample.projectDir || "No project"}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded border px-2 py-0.5 text-xs${
                              sample.blockReason ? " border-destructive/30 text-destructive" : " text-muted-foreground"
                            }`}
                          >
                            {getSampleStateLabel(sample)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {impact?.blockedSessions ? (
                <p className="text-sm text-destructive">Some sessions cannot be moved and will be deleted</p>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-4">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={confirmVariant} disabled={!canConfirm} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
