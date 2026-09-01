import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { createModelClient } from "#api/ModelClient";
import { createSessionClient } from "#api/SessionClient";
import { useSessionStore, getActiveSession, getHasActiveSession } from "#/stores/ui/session";
import { draftStore, useDraftStore } from "#/stores/ui/draft";
import { findChatSelectableModel } from "#/stores/modelStore";
import { isReasoningEffort } from "@argos/shared/types/model-db";
import type { ReasoningEffort, ReasoningPortrait } from "@argos/shared/types/model-db";
import type { ServiceTier } from "@argos/shared/types/agent-interface";
const T3_EFFORT_OPTIONS: Array<{
  value: ReasoningEffort;
  label: string;
  t3Label: string;
}> = [
  {
    value: "low",
    label: "Low",
    t3Label: "Low",
  },
  {
    value: "medium",
    label: "Medium",
    t3Label: "Medium",
  },
  {
    value: "high",
    label: "High",
    t3Label: "High",
  },
  {
    value: "xhigh",
    label: "Extra High",
    t3Label: "Extra High",
  },
  {
    value: "max",
    label: "Max",
    t3Label: "Max",
  },
];
const labelForEffort = (effort?: ReasoningEffort | null) => {
  if (!effort) return "Medium";
  if (effort === "minimal") return "Low";
  const hit = T3_EFFORT_OPTIONS.find((o) => o.value === effort);
  return hit?.t3Label ?? effort;
};
const FALLBACK_EFFORTS: ReasoningEffort[] = ["minimal", "low", "medium", "high"];
// Clients are process-wide singletons; module scope keeps identities stable so
// effect dependencies don't change on every render.
const modelClient = createModelClient();
const sessionClient = createSessionClient();
const getEffortOptions = (portrait: ReasoningPortrait | null | undefined): ReasoningEffort[] => {
  if (!portrait || portrait.mode === "budget" || portrait.mode === "level" || portrait.mode === "fixed") return [];
  const opts = portrait?.effortOptions?.filter(isReasoningEffort);
  if (opts && opts.length > 0) return opts;
  if (portrait.mode === "mixed" || !isReasoningEffort(portrait?.effort)) return [];
  return FALLBACK_EFFORTS.includes(portrait.effort) ? [...FALLBACK_EFFORTS] : [portrait.effort];
};
const supportsEffort = (portrait: ReasoningPortrait | null | undefined): boolean =>
  portrait?.supported !== false && getEffortOptions(portrait).length > 0;
const ComposerEffortPicker = () => {
  const sessionState = useSessionStore();
  void sessionState;
  const draftState = useDraftStore();
  void draftState;
  const hasActiveSession = getHasActiveSession();
  const activeSession = getActiveSession();
  const [supportsReasoningLoaded, setSupportsReasoning] = useState<boolean | null>(null);
  const [availableEffortsLoaded, setAvailableEfforts] = useState<ReasoningEffort[]>([]);
  const [generationReasoningEffortLoaded, setGenerationReasoningEffort] = useState<ReasoningEffort | undefined>(
    undefined,
  );
  const [serviceTierLoaded, setServiceTier] = useState<ServiceTier>("standard");
  const effectiveProviderId = hasActiveSession ? activeSession?.providerId : draftState.providerId;
  const effectiveModelId = hasActiveSession ? activeSession?.modelId : draftState.modelId;
  const isAcpSession = effectiveProviderId === "acp";
  const isReasoningUnavailable = !effectiveProviderId || !effectiveModelId || isAcpSession;
  const supportsReasoning = isReasoningUnavailable ? false : supportsReasoningLoaded;
  const availableEfforts = isReasoningUnavailable ? [] : availableEffortsLoaded;
  useEffect(() => {
    if (isReasoningUnavailable) return;
    let cancelled = false;
    void (async () => {
      try {
        const portrait = await modelClient.getReasoningPortrait(effectiveProviderId, effectiveModelId);
        if (cancelled) return;
        const supported = supportsEffort(portrait);
        const meta = findChatSelectableModel(effectiveProviderId, effectiveModelId)?.model;
        const fallback = meta?.reasoning === true;
        // If portrait says unsupported but meta says reasoning, trust meta (covers models where capability not yet indexed)
        setSupportsReasoning(supported || fallback);
        const options = getEffortOptions(portrait);
        setAvailableEfforts(options.length > 0 ? options : T3_EFFORT_OPTIONS.map((o) => o.value));
      } catch {
        if (!cancelled) {
          setSupportsReasoning(null);
          setAvailableEfforts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReasoningUnavailable, effectiveProviderId, effectiveModelId]);
  const isSessionGenerationSettings = hasActiveSession && Boolean(activeSession?.id);
  const generationReasoningEffort = isSessionGenerationSettings
    ? generationReasoningEffortLoaded
    : (draftState.reasoningEffort as ReasoningEffort | undefined);
  const serviceTier = isSessionGenerationSettings
    ? serviceTierLoaded
    : ((draftState.serviceTier as ServiceTier) ?? "standard");
  useEffect(() => {
    if (!isSessionGenerationSettings || !activeSession?.id) return;
    let cancelled = false;
    void sessionClient
      .getSessionGenerationSettings(activeSession.id)
      .then((s) => {
        if (cancelled) return;
        setGenerationReasoningEffort((s?.reasoningEffort as ReasoningEffort) ?? undefined);
        setServiceTier((s?.serviceTier as ServiceTier) ?? "standard");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSessionGenerationSettings, activeSession?.id]);
  const currentLabel = (() => {
    if (isAcpSession) return "Max";
    if (supportsReasoning === false) return "Max";
    return labelForEffort(generationReasoningEffort);
  })();
  const isDisabled = isAcpSession || supportsReasoning === false;
  const handleSelectEffort = async (effort: ReasoningEffort) => {
    if (hasActiveSession && activeSession?.id) {
      try {
        await sessionClient.updateSessionGenerationSettings(activeSession.id, {
          reasoningEffort: effort,
        });
        setGenerationReasoningEffort(effort);
      } catch {}
    } else {
      draftStore.setState((prev) => ({
        ...prev,
        reasoningEffort: effort,
      }));
      setGenerationReasoningEffort(effort);
    }
  };
  const handleSelectTier = async (tier: ServiceTier) => {
    if (hasActiveSession && activeSession?.id) {
      try {
        await sessionClient.updateSessionGenerationSettings(activeSession.id, {
          serviceTier: tier,
        });
        setServiceTier(tier);
      } catch {}
    } else {
      draftStore.setState((prev) => ({
        ...prev,
        serviceTier: tier,
      }));
      setServiceTier(tier);
    }
  };
  const availableEffortSet = new Set(availableEfforts);
  const picker = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            data-testid="composer-effort-picker"
            className="h-7 gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={isDisabled}
          />
        }
      >
        <span className="font-medium">{currentLabel}</span>
        <Icon icon="lucide:chevron-down" className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-2">
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Reasoning</div>
        {T3_EFFORT_OPTIONS.filter((opt) => availableEfforts.length === 0 || availableEffortSet.has(opt.value)).map(
          (opt) => {
            const isActive =
              generationReasoningEffort === opt.value || (!generationReasoningEffort && opt.value === "medium");
            return (
              <DropdownMenuItem
                key={opt.value}
                className={`flex items-center justify-between ${isActive ? "bg-accent" : ""}`}
                onClick={() => void handleSelectEffort(opt.value)}
              >
                <span className="flex items-center gap-2">
                  <span>{opt.t3Label}</span>
                  {opt.value === "medium" && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Default
                    </span>
                  )}
                </span>
                {isActive && <Icon icon="lucide:check" className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
            );
          },
        )}
        <div className="my-2 h-px bg-border" />
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Service Tier</div>
        <DropdownMenuItem
          className={`flex items-center justify-between ${serviceTier === "standard" ? "bg-accent" : ""}`}
          onClick={() => void handleSelectTier("standard")}
        >
          <span className="flex items-center gap-2">
            <span>Standard</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Default
            </span>
          </span>
          {serviceTier === "standard" && <Icon icon="lucide:check" className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={`flex flex-col items-start gap-0.5 ${serviceTier === "fast" ? "bg-accent" : ""}`}
          onClick={() => void handleSelectTier("fast")}
        >
          <span className="flex w-full items-center justify-between">
            <span>Fast</span>
            {serviceTier === "fast" && <Icon icon="lucide:check" className="h-3.5 w-3.5" />}
          </span>
          <span className="text-xs text-muted-foreground">1.5× speed, increased usage</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  if (isDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger render={picker} />
        <TooltipContent>Not supported by this model</TooltipContent>
      </Tooltip>
    );
  }
  return picker;
};
export default ComposerEffortPicker;
