import { useEffect, useState } from "react";
import { Store } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";
import { createModelClient } from "#api/ModelClient";
import { createSessionClient } from "#api/SessionClient";
import { useToast } from "#/components/use-toast";
import { useActiveSession } from "#/stores/ui/session";
import { draftStore, useDraftStore } from "#/stores/ui/draft";
import { findChatSelectableModel, useModelStore } from "#/stores/modelStore";
import { isReasoningEffort } from "@argos/shared/types/model-db";
import type { ReasoningEffort, ReasoningPortrait } from "@argos/shared/types/model-db";
import type { PermissionMode, ServiceTier } from "@argos/shared/types/agent-interface";

/**
 * Shared reasoning-effort / service-tier / permission-mode controls for the
 * composer. The footer chips and the model picker's side pane both render
 * these, so active-session values live in one store (keyed by session id)
 * instead of per-component state — a change in one surface shows up in the
 * other without a refetch.
 */

/** Display order + labels for every effort the backend understands. */
export const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};
const EFFORT_ORDER = Object.keys(EFFORT_LABELS) as ReasoningEffort[];
const DEFAULT_EFFORT: ReasoningEffort = "medium";
/** Used when the model is reasoning-capable but exposes no effort options. */
const META_FALLBACK_EFFORTS: ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];
const PORTRAIT_FALLBACK_EFFORTS: ReasoningEffort[] = ["minimal", "low", "medium", "high"];

export const labelForEffort = (effort?: ReasoningEffort | null): string =>
  effort ? (EFFORT_LABELS[effort] ?? effort) : EFFORT_LABELS[DEFAULT_EFFORT];

const getEffortOptions = (portrait: ReasoningPortrait | null | undefined): ReasoningEffort[] => {
  if (!portrait || portrait.mode === "budget" || portrait.mode === "level" || portrait.mode === "fixed") return [];
  const opts = portrait.effortOptions?.filter(isReasoningEffort);
  if (opts && opts.length > 0) return opts;
  if (portrait.mode === "mixed" || !isReasoningEffort(portrait.effort)) return [];
  return PORTRAIT_FALLBACK_EFFORTS.includes(portrait.effort) ? [...PORTRAIT_FALLBACK_EFFORTS] : [portrait.effort];
};

// Process-wide singletons; module scope keeps effect dependencies stable.
const modelClient = createModelClient();
const sessionClient = createSessionClient();

/**
 * Portrait-derived facts only. The model-meta `reasoning` fallback is resolved
 * at render time (not cached) so it still applies once the model store loads.
 */
type PortraitInfo = { supported: boolean; efforts: ReasoningEffort[]; portraitEffort?: ReasoningEffort };
/** Portraits are static per provider/model — dedupe requests across consumers. */
const portraitCache = new Map<string, Promise<PortraitInfo>>();
const loadPortraitInfo = (providerId: string, modelId: string): Promise<PortraitInfo> => {
  const key = `${providerId}:${modelId}`;
  const cached = portraitCache.get(key);
  if (cached) return cached;
  const pending = modelClient.getReasoningPortrait(providerId, modelId).then((portrait) => {
    const options = getEffortOptions(portrait);
    return {
      supported: portrait?.supported !== false && options.length > 0,
      efforts: sortEfforts(options.length > 0 ? options : META_FALLBACK_EFFORTS),
      portraitEffort: isReasoningEffort(portrait?.effort) ? portrait.effort : undefined,
    };
  });
  pending.catch(() => portraitCache.delete(key));
  portraitCache.set(key, pending);
  return pending;
};
const sortEfforts = (efforts: ReasoningEffort[]) =>
  [...new Set(efforts)].sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b));

type SessionControls = {
  reasoningEffort?: ReasoningEffort;
  serviceTier?: ServiceTier;
  permissionMode?: PermissionMode;
  planMode?: boolean;
  manualApproval?: boolean;
  restricted?: boolean;
};

export type ComposerAgentMode = "plan" | "manual" | "auto" | "bypass";

/** Plan > Bypass > Manual > Auto, from the stored session flags (after Pine). */
function toAgentMode(state: { planMode?: boolean; manualApproval?: boolean; permissionMode?: PermissionMode }) {
  if (state.planMode) return "plan" as const;
  if (state.permissionMode === "full_access") return "bypass" as const;
  if (state.manualApproval) return "manual" as const;
  return "auto" as const;
}

function fromAgentMode(mode: ComposerAgentMode): {
  planMode: boolean;
  manualApproval: boolean;
  permissionMode: PermissionMode;
} {
  return {
    planMode: mode === "plan",
    manualApproval: mode === "manual",
    permissionMode: mode === "bypass" ? "full_access" : "default",
  };
}

export const AGENT_MODE_OPTIONS: Array<{
  value: ComposerAgentMode;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: "plan",
    label: "Plan",
    description: "Read-only. The agent proposes a plan and waits for approval.",
    icon: "lucide:list-checks",
  },
  {
    value: "manual",
    label: "Manual",
    description: "Ask before every edit and command. Reading is free.",
    icon: "lucide:hand",
  },
  {
    value: "auto",
    label: "Auto",
    description:
      "Work freely. Ask only for risky actions (force push, sudo, deleting a home folder, …) and writes outside the project.",
    icon: "lucide:shield",
  },
  {
    value: "bypass",
    label: "Bypass",
    description: "Allow commands and edits without prompts.",
    icon: "lucide:unlock",
  },
];
const sessionControlsStore = new Store<{ bySession: Record<string, SessionControls> }>({ bySession: {} });
const patchSessionControls = (sessionId: string, patch: SessionControls) =>
  sessionControlsStore.setState((prev) => ({
    bySession: { ...prev.bySession, [sessionId]: { ...prev.bySession[sessionId], ...patch } },
  }));

/**
 * The effort a request actually uses when none (or an unsupported one) is
 * stored — mirrors `normalizeReasoningEffortValue` on the send path, which
 * clamps to the portrait's options and falls back to the portrait's effort.
 */
const resolveDefaultEffort = (efforts: ReasoningEffort[], portraitEffort?: ReasoningEffort): ReasoningEffort => {
  if (portraitEffort && (efforts.length === 0 || efforts.includes(portraitEffort))) return portraitEffort;
  if (efforts.length === 0 || efforts.includes(DEFAULT_EFFORT)) return DEFAULT_EFFORT;
  return efforts[0];
};

export function useComposerReasoning() {
  const draftState = useDraftStore();
  // Subscribed so the meta `reasoning` fallback re-evaluates once models load.
  const modelState = useModelStore();
  void modelState;
  const controls = useSelector(sessionControlsStore, (s) => s.bySession);
  const { hasActiveSession, activeSession } = useActiveSession();
  const sessionId = hasActiveSession ? activeSession?.id : undefined;
  const providerId = hasActiveSession ? activeSession?.providerId : draftState.providerId;
  const modelId = hasActiveSession ? activeSession?.modelId : draftState.modelId;
  const isAcp = providerId === "acp";
  const unavailable = !providerId || !modelId || isAcp;

  const [portrait, setPortrait] = useState<{ key: string; info: PortraitInfo | null } | null>(null);
  const portraitKey = unavailable ? null : `${providerId}:${modelId}`;
  useEffect(() => {
    if (unavailable || !providerId || !modelId) return;
    let cancelled = false;
    const key = `${providerId}:${modelId}`;
    loadPortraitInfo(providerId, modelId)
      .then((info) => {
        if (!cancelled) setPortrait({ key, info });
      })
      .catch(() => {
        if (!cancelled) setPortrait({ key, info: null });
      });
    return () => {
      cancelled = true;
    };
  }, [unavailable, providerId, modelId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void sessionClient
      .getSessionGenerationSettings(sessionId)
      .then((s) => {
        if (cancelled) return;
        patchSessionControls(sessionId, {
          reasoningEffort: isReasoningEffort(s?.reasoningEffort) ? s.reasoningEffort : undefined,
          serviceTier: (s?.serviceTier as ServiceTier) ?? "standard",
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Ignore a portrait that belongs to the previously selected model.
  const info = portrait && portrait.key === portraitKey ? portrait.info : undefined;
  // Portrait may lag model capability indexing; trust the model meta flag too.
  const metaReasoning =
    !unavailable &&
    !!providerId &&
    !!modelId &&
    findChatSelectableModel(providerId, modelId)?.model?.reasoning === true;
  /** `null` = still loading / unknown. */
  const supportsReasoning: boolean | null = unavailable
    ? false
    : info === undefined
      ? null
      : info
        ? info.supported || metaReasoning
        : null;
  const efforts = unavailable || !info ? [] : info.efforts;
  const defaultEffort = resolveDefaultEffort(efforts, info?.portraitEffort);
  const storedEffort = sessionId
    ? controls[sessionId]?.reasoningEffort
    : (draftState.reasoningEffort as ReasoningEffort | undefined);
  const serviceTier: ServiceTier = sessionId
    ? (controls[sessionId]?.serviceTier ?? "standard")
    : ((draftState.serviceTier as ServiceTier | undefined) ?? "standard");
  const activeEffort =
    storedEffort && (efforts.length === 0 || efforts.includes(storedEffort)) ? storedEffort : defaultEffort;

  const setEffort = async (effort: ReasoningEffort) => {
    if (sessionId) {
      const previous = controls[sessionId]?.reasoningEffort;
      patchSessionControls(sessionId, { reasoningEffort: effort });
      try {
        await sessionClient.updateSessionGenerationSettings(sessionId, { reasoningEffort: effort });
      } catch {
        patchSessionControls(sessionId, { reasoningEffort: previous });
      }
    } else {
      draftStore.setState((prev) => ({ ...prev, reasoningEffort: effort }));
    }
  };
  const setServiceTier = async (tier: ServiceTier) => {
    if (sessionId) {
      const previous = controls[sessionId]?.serviceTier;
      patchSessionControls(sessionId, { serviceTier: tier });
      try {
        await sessionClient.updateSessionGenerationSettings(sessionId, { serviceTier: tier });
      } catch {
        patchSessionControls(sessionId, { serviceTier: previous });
      }
    } else {
      draftStore.setState((prev) => ({ ...prev, serviceTier: tier }));
    }
  };

  return {
    isAcp,
    supportsReasoning,
    isDisabled: isAcp || supportsReasoning === false,
    efforts,
    defaultEffort,
    activeEffort,
    serviceTier,
    setEffort,
    setServiceTier,
  };
}

export type PermissionModeOption = {
  value: PermissionMode;
  label: string;
  description: string;
  icon: string;
  /** v1 only supports `default`/`full_access`; interim labels are disabled until the enum expands. */
  disabled?: boolean;
};
export const PERMISSION_MODE_OPTIONS: PermissionModeOption[] = [
  {
    value: "default",
    label: "Supervised",
    description: "Ask before commands and file changes.",
    icon: "lucide:shield",
  },
  {
    value: "full_access",
    label: "Auto-accept edits",
    description: "Auto-approve edits, ask before other actions.",
    icon: "lucide:pencil",
    disabled: true,
  },
  {
    value: "full_access",
    label: "Auto",
    description: "Smart providers approve routine actions; others still ask.",
    icon: "lucide:sparkles",
    disabled: true,
  },
  {
    value: "full_access",
    label: "Full access",
    description: "Allow commands and edits without prompts.",
    icon: "lucide:unlock",
  },
];
export const isPermissionOptionActive = (mode: PermissionMode, option: PermissionModeOption) =>
  !option.disabled && option.value === mode;

export function useComposerAgentMode() {
  const { toast } = useToast();
  const draftState = useDraftStore();
  const controls = useSelector(sessionControlsStore, (s) => s.bySession);
  const { hasActiveSession, activeSession } = useActiveSession();
  const sessionId = hasActiveSession ? activeSession?.id : undefined;

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const load = () => {
      void sessionClient
        .getAgentMode(sessionId)
        .then((state) => {
          if (cancelled) return;
          patchSessionControls(sessionId, {
            planMode: state.planMode,
            manualApproval: state.manualApproval,
            restricted: state.restricted,
            permissionMode: state.permissionMode,
          });
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

  const entry = sessionId ? controls[sessionId] : undefined;
  const mode: ComposerAgentMode = toAgentMode(sessionId ? (entry ?? {}) : draftState);
  const option =
    AGENT_MODE_OPTIONS.find((item) => item.value === mode) ?? AGENT_MODE_OPTIONS.find((item) => item.value === "auto")!;

  const setMode = async (next: ComposerAgentMode) => {
    const flags = fromAgentMode(next);
    if (sessionId) {
      const previous = controls[sessionId];
      patchSessionControls(sessionId, flags);
      try {
        await sessionClient.setAgentMode(sessionId, flags);
      } catch (error) {
        patchSessionControls(sessionId, previous ?? {});
        toast({
          title: "Could not change mode",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    } else {
      draftStore.setState((prev) => ({ ...prev, ...flags }));
    }
  };

  return { mode, label: option.label, icon: option.icon, setMode, restricted: entry?.restricted ?? false };
}

export function useSessionAgentMode(sessionId: string) {
  const controls = useSelector(sessionControlsStore, (s) => s.bySession);
  const entry = controls[sessionId];

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void sessionClient
        .getAgentMode(sessionId)
        .then((state) => {
          if (cancelled) return;
          patchSessionControls(sessionId, {
            planMode: state.planMode,
            manualApproval: state.manualApproval,
            restricted: state.restricted,
            permissionMode: state.permissionMode,
          });
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

  const mode: ComposerAgentMode = toAgentMode(entry ?? {});
  return {
    mode,
    planMode: entry?.planMode ?? false,
    restricted: entry?.restricted ?? false,
  };
}

export function useComposerPermissionMode() {
  const draftState = useDraftStore();
  const controls = useSelector(sessionControlsStore, (s) => s.bySession);
  const { hasActiveSession, activeSession } = useActiveSession();
  const sessionId = hasActiveSession ? activeSession?.id : undefined;

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void sessionClient
      .getPermissionMode(sessionId)
      .then((mode) => {
        if (!cancelled && mode) patchSessionControls(sessionId, { permissionMode: mode as PermissionMode });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const mode: PermissionMode = sessionId
    ? (controls[sessionId]?.permissionMode ?? "full_access")
    : ((draftState.permissionMode as PermissionMode | undefined) ?? "full_access");
  const option = PERMISSION_MODE_OPTIONS.find((o) => isPermissionOptionActive(mode, o)) ?? PERMISSION_MODE_OPTIONS[3];

  const setMode = async (next: PermissionMode) => {
    if (sessionId) {
      const previous = controls[sessionId]?.permissionMode;
      patchSessionControls(sessionId, { permissionMode: next });
      try {
        await sessionClient.setPermissionMode(sessionId, next);
      } catch {
        patchSessionControls(sessionId, { permissionMode: previous });
      }
    } else {
      draftStore.setState((prev) => ({ ...prev, permissionMode: next }));
    }
  };

  return { mode, label: option.label, icon: option.icon, setMode };
}
