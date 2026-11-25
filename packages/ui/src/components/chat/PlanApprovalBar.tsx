import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { createSessionClient } from "#api/SessionClient";
import { useToast } from "#/components/use-toast";
import { useSessionAgentMode } from "#/composables/chat/useComposerGenerationControls";
import { clear as clearAgentPlanSnapshot } from "#/stores/ui/agentPlan";

const sessionClient = createSessionClient();

type SessionPlan = NonNullable<Awaited<ReturnType<typeof sessionClient.getPlan>>>;

/** The persisted plan for a session, refreshed whenever the session is updated. */
function useSessionPlan(sessionId: string): SessionPlan | null {
  const [plan, setPlan] = useState<{ sessionId: string; plan: SessionPlan | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void sessionClient
        .getPlan(sessionId)
        .then((next) => {
          if (!cancelled) setPlan({ sessionId, plan: next });
        })
        .catch(() => {});
    };
    load();
    const off = sessionClient.onUpdated((payload) => {
      if (payload.sessionIds.includes(sessionId)) load();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [sessionId]);

  return plan?.sessionId === sessionId ? plan.plan : null;
}

/** Composer prefill for Edit: stay in plan mode and ask for a revised plan. */
const REVISE_PLAN_PREFILL = "Revise the plan: ";

function PlanSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <h4 className="text-[11px] font-medium text-muted-foreground">{title}</h4>
      <ul className="space-y-1 text-[13px] leading-5">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
            <span className="min-w-0 whitespace-pre-wrap break-words">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const DISMISSED_KEY = "plan-card-dismissed:v1";

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Plans the user closed, per session and revision; a new revision shows again. */
function useDismissedPlans() {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const dismiss = (key: string) => {
    const next = [...dismissed.filter((item) => item !== key), key].slice(-200);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {}
  };
  return { dismissed, dismiss };
}

export default function PlanApprovalBar({
  sessionId,
  isGenerating = false,
  onRevisePlan,
}: {
  sessionId: string;
  /** Whether the session's agent is running a turn right now. */
  isGenerating?: boolean;
  /** Prefills the composer; the user describes the change and the agent resubmits. */
  onRevisePlan?: (text: string) => void;
}) {
  const { toast } = useToast();
  const plan = useSessionPlan(sessionId);
  const { planMode } = useSessionAgentMode(sessionId);
  const [busy, setBusy] = useState(false);
  // null: follow the default for the state (open while awaiting approval).
  const [expandedOverride, setExpandedOverride] = useState<{ key: string; expanded: boolean } | null>(null);
  const { dismissed, dismiss } = useDismissedPlans();
  // The plan revision current when the running turn started. A turn in plan
  // mode that started with a plan already shown is a revision (Edit): the old
  // plan is stale until the new revision arrives.
  const [turnStart, setTurnStart] = useState({ generating: isGenerating, revision: null as number | null });
  if (turnStart.generating !== isGenerating) {
    setTurnStart({ generating: isGenerating, revision: isGenerating ? (plan?.revision ?? null) : null });
  }
  // An approved plan is only shown while it is being carried out. When that
  // turn ends it closes for good; the full plan stays in the chat as the
  // "Execute the approved plan" message.
  const wasGenerating = useRef(isGenerating);
  useEffect(() => {
    const finished = wasGenerating.current && !isGenerating;
    wasGenerating.current = isGenerating;
    if (finished && plan?.approvedAt && !planMode) dismiss(`${sessionId}:${plan.revision}`);
  }, [isGenerating, plan, planMode, sessionId, dismiss]);
  if (!plan) return null;
  const revising = planMode && isGenerating && turnStart.revision === plan.revision;
  const planKey = `${sessionId}:${plan.revision}`;
  // The plan stays reachable after Approve/Exit: awaiting approval only while
  // the session is in plan mode, otherwise a collapsed record that can be closed.
  const status: "revising" | "pending" | "approved" | "inactive" = revising
    ? "revising"
    : planMode
      ? "pending"
      : plan.approvedAt
        ? "approved"
        : "inactive";
  if ((status === "approved" || status === "inactive") && dismissed.includes(planKey)) return null;
  if (status === "approved" && !isGenerating) return null;
  const expanded =
    status === "revising"
      ? false
      : expandedOverride?.key === planKey
        ? expandedOverride.expanded
        : status === "pending";
  const toggleExpanded = () => setExpandedOverride({ key: planKey, expanded: !expanded });
  const title =
    status === "revising"
      ? "Revising plan…"
      : status === "pending"
        ? "Plan ready for approval"
        : status === "approved"
          ? "Approved plan"
          : "Plan (not active)";

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      toast({
        title: label,
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
    setBusy(false);
  };
  // Leaving plan mode re-enables the todo-progress float; drop any snapshot of
  // this plan held in memory so it does not reappear there.
  const exitPlanMode = async () => {
    clearAgentPlanSnapshot(sessionId);
    await sessionClient.setAgentMode(sessionId, { planMode: false, permissionMode: "default" });
  };
  // "manual": ask before each edit/command; "auto": ask only for risky actions.
  const approve = async (mode: "manual" | "auto") => {
    clearAgentPlanSnapshot(sessionId);
    await sessionClient.approvePlan(sessionId, mode);
  };
  const backToPlanMode = () => sessionClient.setAgentMode(sessionId, { planMode: true, permissionMode: "default" });

  return (
    <div
      className={`mx-auto mb-2 flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-card text-sm shadow-sm ${
        status === "pending" ? "border-primary/20" : "border-border/70"
      }`}
      data-testid="plan-approval-bar"
      data-status={status}
    >
      <div className="flex items-start">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left enabled:hover:bg-muted/40"
          aria-expanded={expanded}
          aria-busy={status === "revising"}
          disabled={status === "revising"}
          onClick={toggleExpanded}
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon
              icon={status === "revising" ? "lucide:loader-circle" : "lucide:list-checks"}
              className={`h-4 w-4 ${status === "revising" ? "animate-spin" : ""}`}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-medium">{title}</span>
              <span className={`text-xs text-muted-foreground ${status === "revising" ? "hidden" : ""}`}>
                {plan.steps.length} {plan.steps.length === 1 ? "step" : "steps"}
                {plan.revision > 1 ? ` · revision ${plan.revision}` : ""}
              </span>
            </span>
            {status === "revising" ? (
              // The previous revision is stale: redact it with placeholder lines.
              <span className="mt-1.5 block space-y-1.5" aria-hidden="true" data-testid="plan-revising-skeleton">
                <span className="block h-2.5 w-11/12 animate-pulse rounded bg-muted" />
                <span className="block h-2.5 w-3/5 animate-pulse rounded bg-muted" />
              </span>
            ) : (
              <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{plan.objective}</span>
            )}
          </span>
          <Icon
            icon={expanded ? "lucide:chevron-down" : "lucide:chevron-up"}
            className={`mt-1.5 h-4 w-4 shrink-0 text-muted-foreground ${status === "revising" ? "invisible" : ""}`}
          />
        </button>
        {(status === "approved" || status === "inactive") && (
          <button
            type="button"
            className="m-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60"
            aria-label="Close plan"
            title="Close (a new plan shows again)"
            onClick={() => dismiss(planKey)}
          >
            <Icon icon="lucide:x" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {expanded && (
        <div
          className="max-h-[min(40vh,22rem)] space-y-4 overflow-y-auto border-t border-border/60 px-4 py-3"
          data-testid="plan-approval-body"
        >
          <p className="whitespace-pre-wrap break-words text-[13px] leading-5">{plan.objective}</p>
          <ol className="space-y-2 text-[13px] leading-5">
            {plan.steps.map((step, index) => (
              <li key={`${index}-${step}`} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/70 text-[11px] text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{step}</span>
              </li>
            ))}
          </ol>
          {plan.files.length > 0 && (
            <section className="space-y-1.5">
              <h4 className="text-[11px] font-medium text-muted-foreground">Files</h4>
              <div className="flex flex-wrap gap-1.5">
                {plan.files.map((file) => (
                  <code key={file} className="rounded bg-muted px-1.5 py-0.5 text-[11px] break-all">
                    {file}
                  </code>
                ))}
              </div>
            </section>
          )}
          <PlanSection title="Risks" items={plan.risks} />
          <PlanSection title="Verification" items={plan.verification} />
        </div>
      )}

      {status === "pending" && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-3 py-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            title="Stay in plan mode and ask for changes"
            onClick={() => {
              clearAgentPlanSnapshot(sessionId);
              onRevisePlan?.(REVISE_PLAN_PREFILL);
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void run("Could not exit plan mode", exitPlanMode)}
          >
            Exit plan
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            title="Run the plan in Manual mode: ask before each edit or command"
            onClick={() => void run("Could not start the plan", () => approve("manual"))}
            data-testid="plan-approval-approve"
          >
            Approve, ask before edits
          </Button>
          <Button
            size="sm"
            disabled={busy}
            title="Run the plan in Auto mode: ask only for risky actions and writes outside the project"
            onClick={() => void run("Could not start the plan", () => approve("auto"))}
            data-testid="plan-approval-approve-bypass"
          >
            Approve and run
          </Button>
        </div>
      )}
      {status === "inactive" && expanded && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-3 py-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void run("Could not switch to plan mode", backToPlanMode)}
          >
            Back to plan mode
          </Button>
        </div>
      )}
    </div>
  );
}
