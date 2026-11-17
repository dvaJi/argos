import { useEffect, useRef } from "react";
import { useSelector } from "@tanstack/react-store";
import { agentStore } from "#/stores/ui/agent";
import { projectStore, selectedProject as getSelectedProject } from "#/stores/ui/project";
import { resolveEffectiveAgent } from "#/lib/effectiveAgent";
import { scheduleStartupDeferredTask } from "#/lib/startupDeferred";
import { Icon } from "@iconify/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { createProviderClient } from "#api/ProviderClient";
import { createSessionClient } from "#api/SessionClient";
import { useSessionStore, getActiveSession, getHasActiveSession } from "#/stores/ui/session";
import { useModelStore, getChatSelectableModelGroups } from "#/stores/modelStore";
import { useChatStatusBarAcpConfig } from "./composables/useChatStatusBarAcpConfig";
import AcpAdvancedSettings from "./AcpAdvancedSettings";
import AcpOptionPicker from "./AcpOptionPicker";
import { getAcpOptionKind } from "./acpOptionKind";
import type { AcpConfigOption } from "@argos/shared/presenter";
// Process-wide singletons; module scope keeps effect dependencies stable.
const sessionClient = createSessionClient();
const providerClient = createProviderClient();

/**
 * ACP agent options (mode / collaboration / model / …) for an ACTIVE session,
 * rendered as chips inside the composer footer bar. Mirrors the markup that
 * used to live in the ChatStatusBar so the footer bar is the single control
 * surface; the status bar keeps only non-duplicated utilities.
 */
const AcpComposerControls = ({ acpDraftSessionId = null }: { acpDraftSessionId?: string | null }) => {
  // Subscribe so chips re-render when the active session / agent / project changes.
  const sessionStoreState = useSessionStore();
  const agentState = useSelector(agentStore);
  const projectState = useSelector(projectStore);
  void projectState;
  const modelStore = useModelStore();
  const hasActiveSession = getHasActiveSession();
  const activeSession = getActiveSession();
  const isAcpActiveSession = hasActiveSession && activeSession?.providerId === "acp";
  // Pre-session: follow the effective agent (same resolution as AgentSwitcher)
  // and the bound draft session, so the agent's model/mode chips are editable
  // before the first message.
  const preSessionAcpAgentId = (() => {
    if (hasActiveSession) return null;
    const effective = resolveEffectiveAgent({
      agents: agentState.agents,
      selectedAgentId: agentState.selectedAgentId,
      activeSessionAgentId: null,
    });
    return effective?.type === "acp" ? effective.agent.id : null;
  })();
  void sessionStoreState;
  const isAcpContext = Boolean(isAcpActiveSession || preSessionAcpAgentId);
  const activeAcpAgentId = isAcpActiveSession ? activeSession?.modelId || null : preSessionAcpAgentId;
  const activeAcpSessionId = isAcpActiveSession
    ? (activeSession?.id ?? null)
    : preSessionAcpAgentId
      ? acpDraftSessionId?.trim() || null
      : null;
  const acpWorkspacePath = isAcpActiveSession
    ? activeSession?.projectDir?.trim() || null
    : preSessionAcpAgentId
      ? getSelectedProject()?.path?.trim() || null
      : null;
  const resolveModelIconId = (providerId?: string | null, modelId?: string | null): string => {
    if (providerId === "acp" && modelId) return modelId;
    return providerId || "anthropic";
  };
  const resolveModelName = (providerId?: string | null, modelId?: string | null): string => {
    if (!modelId) return "";
    if (providerId) {
      const hit = getChatSelectableModelGroups()
        .flatMap((group) => group.models)
        .find((model) => model.providerId === providerId && model.id === modelId);
      if (hit) return hit.name;
    }
    const found = modelStore.findModelByIdOrName(modelId);
    if (found) return found.model.name;
    return modelId;
  };
  const acp = useChatStatusBarAcpConfig({
    isAcpAgent: isAcpContext,
    activeAcpAgentId,
    activeAcpSessionId,
    acpWorkspacePath,
    selectedAgentId: null,
    selectedAgentName: null,
    providerClient,
    sessionClient,
    resolveModelName,
    resolveModelIconId,
  });
  const syncAcpConfigOptionsRef = useRef(acp.syncAcpConfigOptions);
  useEffect(() => {
    syncAcpConfigOptionsRef.current = acp.syncAcpConfigOptions;
  }, [acp.syncAcpConfigOptions]);
  useEffect(() => {
    // Re-sync on agent switch; a project switch rebinds the draft session id.
    if (!isAcpContext || !activeAcpAgentId) return;
    if (activeAcpSessionId) {
      void syncAcpConfigOptionsRef.current();
      return;
    }
    // No session yet (no draft bound): warm the agent process once startup
    // settles so the chips can show the agent's current model/mode read-only.
    let cancelled = false;
    const cancel = scheduleStartupDeferredTask(async () => {
      if (!cancelled) await syncAcpConfigOptionsRef.current();
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [isAcpContext, activeAcpAgentId, activeAcpSessionId]);
  const handleAcpConfigOptionsReadyRef = useRef(acp.handleAcpConfigOptionsReady);
  useEffect(() => {
    handleAcpConfigOptionsReadyRef.current = acp.handleAcpConfigOptionsReady;
  }, [acp.handleAcpConfigOptionsReady]);
  useEffect(() => {
    const unsubscribe = sessionClient.onAcpConfigOptionsReady((payload) => {
      handleAcpConfigOptionsReadyRef.current(payload as unknown as Record<string, unknown>);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);
  if (!isAcpContext) {
    return null;
  }
  return (
    <>
      {acp.isAcpConfigLoading && !acp.hasAcpConfigOptions && (
        <Tooltip>
          <TooltipTrigger render={<div className="flex h-7 items-center gap-1 px-1 text-xs text-muted-foreground" />}>
            <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin" />
          </TooltipTrigger>
          <TooltipContent>Loading agent modes and models…</TooltipContent>
        </Tooltip>
      )}
      {!acp.isAcpConfigLoading && acp.acpConfigError && !acp.hasAcpConfigOptions && (
        <Tooltip>
          <TooltipTrigger render={<div className="flex h-7 items-center gap-1 px-1 text-xs text-destructive" />}>
            <Icon icon="lucide:alert-circle" className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">Failed to load agent configuration: {acp.acpConfigError}</TooltipContent>
        </Tooltip>
      )}
      {!acp.isAcpConfigLoading && !acp.acpConfigError && !acp.hasAcpConfigOptions && !acpWorkspacePath && (
        <div className="flex h-7 items-center px-1 text-xs text-muted-foreground/60">Select a project to configure</div>
      )}
      {acp.acpInlineOptions.map((option) => (
        <AcpOptionPicker
          key={option.id}
          option={option}
          open={acp.acpInlineOpenOptionId === option.id}
          readOnly={acp.acpConfigReadOnly}
          isSaving={acp.isAcpOptionSaving(option.id)}
          displayValue={acp.getAcpOptionDisplayValue(option)}
          // Model lists get the Argos-picker treatment (All / Favorites / labs
          // + stars), with favorites kept per agent.
          favoritesScope={activeAcpAgentId && getAcpOptionKind(option) === "model" ? `acp:${activeAcpAgentId}` : null}
          onSelect={acp.onAcpSelectOption}
          onOpenChange={(open) => acp.onAcpInlineOptionOpenChange(option.id, open)}
        />
      ))}
      {acp.acpOverflowOptions.length > 0 && (
        <AcpAdvancedSettings
          options={acp.acpOverflowOptions as AcpConfigOption[]}
          readOnly={acp.acpConfigReadOnly}
          isOptionSaving={acp.isAcpOptionSaving}
          getOptionDisplayValue={acp.getAcpOptionDisplayValue}
          onSelectOption={acp.onAcpSelectOption}
          onBooleanOption={acp.onAcpBooleanOption}
        />
      )}
    </>
  );
};
export default AcpComposerControls;
