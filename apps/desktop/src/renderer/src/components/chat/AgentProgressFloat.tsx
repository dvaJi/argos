import { type FC, useMemo } from "react";
import { Icon } from "@iconify/react";
import type { AgentPlanItem, AgentPlanStepStatus } from "@shared/types/agent-plan";
import type { AgentPlanViewSnapshot } from "@/stores/ui/agentPlan";

interface AgentProgressFloatProps {
  snapshot: AgentPlanViewSnapshot | null;
  collapsed: boolean;
  embedded?: boolean;
  onToggleCollapse: () => void;
  onDismiss: () => void;
}

const getStatusIcon = (status: AgentPlanStepStatus): string => {
  if (status === "completed") return "lucide:circle-check";
  if (status === "in_progress") return "lucide:loader-circle";
  return "lucide:circle";
};

const getStatusIconClass = (status: AgentPlanStepStatus): string => {
  if (status === "completed") return "text-emerald-600 dark:text-emerald-400";
  if (status === "in_progress") return "animate-spin text-primary";
  return "text-muted-foreground";
};

const getStatusBadgeClass = (status: AgentPlanStepStatus): string => {
  if (status === "completed") return "border-emerald-500/20 bg-emerald-500/10";
  if (status === "in_progress") return "border-primary/25 bg-primary/10";
  return "border-border/70";
};

const AgentProgressFloat: FC<AgentProgressFloatProps> = ({
  snapshot,
  collapsed,
  embedded = false,
  onToggleCollapse,
  onDismiss,
}) => {
  const entries = useMemo<AgentPlanItem[]>(
    () => (snapshot?.plan ?? []).filter((entry) => entry.step.trim().length > 0),
    [snapshot?.plan],
  );

  const completedCount = useMemo(() => entries.filter((entry) => entry.status === "completed").length, [entries]);

  if (!snapshot || entries.length === 0) return null;

  return (
    <div
      className={[
        "pointer-events-auto relative w-full overflow-hidden text-foreground",
        embedded
          ? ""
          : "agent-progress-float ml-auto max-w-[25rem] rounded-[20px] border border-transparent bg-transparent backdrop-blur-[26px]",
      ].join(" ")}
      data-testid="agent-progress-float"
    >
      {!embedded && <div className="agent-progress-float__backdrop" aria-hidden="true" />}

      <div className="relative flex items-center gap-1.5 px-3 pb-2.5 pt-2.5">
        <button
          type="button"
          className="agent-progress-trigger group flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left transition-all duration-200 hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
          data-testid="agent-progress-float-trigger"
          aria-expanded={!collapsed}
          aria-label="Plan"
          onClick={onToggleCollapse}
        >
          <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-inner shadow-primary/10 transition-transform duration-200 group-hover:scale-[0.98] dark:border-primary/25 dark:bg-primary/15">
            <Icon icon="lucide:list-checks" className="h-4 w-4" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate text-[13px] font-semibold tracking-[0.01em]">Plan</span>
              <span className="shrink-0 rounded-full border border-border/70 bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground dark:bg-background/60">
                {completedCount}/{entries.length}
              </span>
            </span>

            {snapshot.explanation && (
              <span className="agent-progress-summary mt-0.5 block text-sm leading-4 text-muted-foreground">
                {snapshot.explanation}
              </span>
            )}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="agent-progress-action inline-flex h-7 w-7 items-center justify-center text-muted-foreground"
            aria-label={collapsed ? "Expand" : "Collapse"}
            onClick={onToggleCollapse}
          >
            <Icon icon={collapsed ? "lucide:chevron-down" : "lucide:chevron-up"} className="h-3 w-3" />
          </button>

          <button
            type="button"
            className="agent-progress-action inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground"
            aria-label="Close"
            onClick={onDismiss}
          >
            <Icon icon="lucide:x" className="h-3 w-3" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div
          className="agent-progress-panel relative border-t border-border/60 px-3 pb-3 pt-2.5"
          data-testid="agent-progress-float-body"
        >
          <div className="space-y-2">
            {entries.map((entry, index) => (
              <div
                key={`${entry.status}-${index}-${entry.step}`}
                className="agent-progress-item flex items-center gap-2.5 rounded-2xl px-2.5 py-1 text-[13px] leading-5"
                aria-label={`${entry.status}: ${entry.step}`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${getStatusBadgeClass(entry.status)}`}
                >
                  <Icon
                    icon={getStatusIcon(entry.status)}
                    className={`h-3 w-3 shrink-0 ${getStatusIconClass(entry.status)}`}
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{entry.step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentProgressFloat;
