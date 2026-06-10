import { type FC, useMemo } from "react";
import { Icon } from "@iconify/react";
import type { AgentPlanStepStatus } from "@shared/types/agent-plan";
import type { DisplayAssistantMessageBlock } from "@/components/chat/messageListItems";

type NormalizedPlanEntry = {
  label: string;
  status: AgentPlanStepStatus;
};

interface MessageBlockPlanProps {
  block: DisplayAssistantMessageBlock;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeStatus = (value: unknown): AgentPlanStepStatus => {
  if (value === "completed" || value === "done") return "completed";
  if (value === "in_progress") return "in_progress";
  return "pending";
};

const getStatusIcon = (status: AgentPlanStepStatus): string => {
  if (status === "completed") return "lucide:circle-check";
  if (status === "in_progress") return "lucide:loader-circle";
  return "lucide:circle";
};

const getStatusIconClass = (status: AgentPlanStepStatus): string => {
  if (status === "completed") return "text-muted-foreground";
  if (status === "in_progress") return "animate-spin text-primary";
  return "text-muted-foreground/80";
};

export const MessageBlockPlan: FC<MessageBlockPlanProps> = ({ block }) => {
  const entries = useMemo<NormalizedPlanEntry[]>(() => {
    const rawEntries = block.extra?.plan_entries;
    if (!Array.isArray(rawEntries)) return [];

    return rawEntries
      .map((entry) => {
        if (!isRecord(entry)) return null;
        const rawLabel = typeof entry.step === "string" ? entry.step : entry.content;
        const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
        if (!label) return null;
        return { label, status: normalizeStatus(entry.status) };
      })
      .filter((entry): entry is NormalizedPlanEntry => entry !== null);
  }, [block.extra?.plan_entries]);

  const explanation = useMemo(() => {
    const value = block.extra?.plan_explanation;
    if (typeof value === "string" && value.trim()) return value.trim();
    return block.content?.trim() ?? "";
  }, [block.extra?.plan_explanation, block.content]);

  const totalCount = entries.length;
  const completedCount = entries.filter((e) => e.status === "completed").length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <div className="w-full max-w-2xl rounded-lg border bg-card p-3 text-card-foreground">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:list-checks" className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Plan</span>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{totalCount} completed
        </span>
      </div>

      {totalCount > 0 && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {explanation && (
        <p className="mt-3 border-l-2 border-primary/30 pl-3 text-xs leading-5 text-muted-foreground">{explanation}</p>
      )}

      {entries.length > 0 ? (
        <div className="mt-3 space-y-2">
          {entries.map((entry, index) => (
            <div
              key={`${entry.status}-${index}-${entry.label}`}
              className={`grid grid-cols-[1rem_minmax(0,1fr)] gap-2 text-sm leading-5 ${entry.status === "completed" ? "text-muted-foreground" : "text-foreground"}`}
              aria-label={`${entry.status}: ${entry.label}`}
            >
              <Icon
                icon={getStatusIcon(entry.status)}
                className={`mt-0.5 h-4 w-4 shrink-0 ${getStatusIconClass(entry.status)}`}
                aria-hidden="true"
              />
              <span className="min-w-0 whitespace-pre-wrap break-words">{entry.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
          No plan items yet
        </div>
      )}
    </div>
  );
};
