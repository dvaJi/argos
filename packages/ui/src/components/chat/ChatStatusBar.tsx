import { useEffect, useRef, type ComponentProps } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import type { AcpConfigOption, RENDERER_MODEL_META } from "@argos/shared/presenter";
import ModelIcon from "#/components/icons/ModelIcon";
import { createProviderClient } from "#api/ProviderClient";
import { createSessionClient } from "#api/SessionClient";
import { requestGuidedOnboardingResume } from "#/lib/onboardingResume";
import { useModelStore, findChatSelectableModel } from "#/stores/modelStore";
import { useThemeStore } from "#/stores/theme";
import {
  useAgentStore,
  selectedAgent as getSelectedAgent,
  inferAgentType as sharedInferAgentType,
} from "#/stores/ui/agent";
import { selectedProject as getSelectedProject } from "#/stores/ui/project";
import { useSessionStore, getActiveSession, getHasActiveSession } from "#/stores/ui/session";
import { scheduleStartupDeferredTask } from "#/lib/startupDeferred";
import { useChatStatusBarAcpConfig } from "./composables/useChatStatusBarAcpConfig";
import AcpAdvancedSettings from "./AcpAdvancedSettings";
import AgentAvatar from "#/components/icons/AgentAvatar";
type AcpOptionValueLike = {
  value: string;
  label: string;
  groupId?: string | null;
  groupLabel?: string | null;
};
const resolveAcpOptionGroup = (
  entry: AcpOptionValueLike,
): {
  key: string;
  label: string;
} => {
  if (entry.groupId && entry.groupId.trim()) {
    return {
      key: entry.groupId,
      label: entry.groupLabel?.trim() ? entry.groupLabel : entry.groupId,
    };
  }
  const valueSlash = entry.value.indexOf("/");
  const labelSlash = entry.label.indexOf("/");
  const labSource = valueSlash > 0 ? entry.value : labelSlash > 0 ? entry.label : "";
  if (labSource) {
    const lab = labSource.slice(0, labSource.indexOf("/"));
    if (lab.trim()) {
      return {
        key: `__lab__${lab.toLowerCase()}`,
        label: lab,
      };
    }
  }
  return {
    key: "__default__",
    label: "",
  };
};
const resolveAcpOptionDisplayLabel = (entry: { label: string }): string => {
  const idx = entry.label.indexOf("/");
  if (idx > 0 && entry.label.slice(idx + 1).trim()) {
    return entry.label.slice(idx + 1);
  }
  return entry.label;
};
const ACP_OPTION_ICONS: Record<string, string> = {
  mode: "lucide:cpu",
  model: "lucide:box",
  temperature: "lucide:thermometer",
  "max-tokens": "lucide:hash",
  max_tokens: "lucide:hash",
  "system-prompt": "lucide:terminal",
  system_prompt: "lucide:terminal",
  "permission-mode": "lucide:shield",
  permission: "lucide:shield",
  context: "lucide:scan",
  reasoning: "lucide:brain",
};
const getAcpOptionIconId = (optionId: string): string =>
  ACP_OPTION_ICONS[optionId.toLowerCase().replace(/\s+/g, "-")] ?? "lucide:sliders-horizontal";
const findEnabledModelMeta = (providerId: string, modelId: string): RENDERER_MODEL_META | null =>
  findChatSelectableModel(providerId, modelId)?.model ?? null;
const resolveModelIconId = (providerId?: string | null, modelId?: string | null): string => {
  if (providerId === "acp" && modelId) return modelId;
  return providerId || "anthropic";
};
const createModelNameResolver = (input: {
  findEnabledModelMeta: (providerId: string, modelId: string) => RENDERER_MODEL_META | null;
  findModelByIdOrName: (modelId: string) => { model: { name: string } } | null | undefined;
}) => {
  const { findEnabledModelMeta, findModelByIdOrName } = input;
  return (providerId?: string | null, modelId?: string | null): string => {
    if (!modelId) return "";
    if (providerId) {
      const hit = findEnabledModelMeta(providerId, modelId);
      if (hit) return hit.name;
    }
    const found = findModelByIdOrName(modelId);
    if (found) return found.model.name;
    return modelId;
  };
};
function inferAgentTypeFrom(
  availableAgents: ReturnType<typeof useAgentStore>["agents"],
  selectedAgentSnapshot: ReturnType<typeof getSelectedAgent>,
  agentId: string | null | undefined,
): "argos" | "acp" | null {
  if (!agentId) return null;
  const matchedAgent = availableAgents.find((agent) => agent.id === agentId);
  const selectedAgent = selectedAgentSnapshot?.id === agentId ? selectedAgentSnapshot : null;
  const explicitType = matchedAgent?.agentType ?? matchedAgent?.type ?? selectedAgent?.type;
  if (explicitType === "argos" || explicitType === "acp") return explicitType;
  return sharedInferAgentType(agentId, availableAgents);
}
function resolveAcpViewContext(input: {
  hasActiveSession: boolean;
  activeSession: ReturnType<typeof getActiveSession>;
  selectedAgentType: "argos" | "acp" | null;
  selectedAgentId: string | null | undefined;
  acpDraftSessionId: string | null | undefined;
}) {
  const { hasActiveSession, activeSession, selectedAgentType, selectedAgentId, acpDraftSessionId } = input;
  const selectedArgosAgentId = (() => {
    if (selectedAgentType === "acp") return null;
    return selectedAgentId ?? "argos";
  })();
  const activeAcpAgentId = (() => {
    if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.modelId || null;
    return selectedAgentType === "acp" ? selectedAgentId : null;
  })();
  const activeAcpSessionId = (() => {
    if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.id;
    const draftSessionId = acpDraftSessionId?.trim();
    return draftSessionId ? draftSessionId : null;
  })();
  const acpWorkspacePath = (() => {
    if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.projectDir?.trim() || null;
    return getSelectedProject()?.path?.trim() || null;
  })();
  const lockedAcpModelId = (() => {
    if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.modelId || null;
    return selectedAgentType === "acp" ? selectedAgentId : null;
  })();
  return {
    selectedArgosAgentId,
    activeAcpAgentId,
    activeAcpSessionId,
    acpWorkspacePath,
    lockedAcpModelId,
  };
}
type AgentAvatarAgent = ComponentProps<typeof AgentAvatar>["agent"];
function resolveAcpAgentForAvatar(
  agents: AgentAvatarAgent[],
  agentId: string | null | undefined,
  fallbackLabel: string,
) {
  if (!agentId) return null;
  return (
    agents.find((a) => a.id === agentId) ?? {
      id: agentId,
      name: fallbackLabel,
      type: "acp" as const,
      agentType: "acp" as const,
      enabled: true,
      protected: false,
      icon: undefined,
    }
  );
}
type SessionClientLike = ReturnType<typeof createSessionClient>;
type ActiveSessionLike = ReturnType<typeof getActiveSession>;
/**
 * Keeps the ACP config options in sync: reloads on session/agent switches
 * (deferred until startup settles) and reacts to daemon config-ready events.
 */
function useAcpConfigOptionsSync(input: {
  isAcpAgent: boolean;
  activeAcpSessionId: string | null;
  sessionClient: SessionClientLike;
  syncAcpConfigOptions: () => Promise<void>;
  handleAcpConfigOptionsReady: (payload?: Record<string, unknown>) => void;
}) {
  const { isAcpAgent, activeAcpSessionId, sessionClient, syncAcpConfigOptions, handleAcpConfigOptionsReady } = input;
  const syncAcpConfigOptionsRef = useRef(syncAcpConfigOptions);
  useEffect(() => {
    syncAcpConfigOptionsRef.current = syncAcpConfigOptions;
  }, [syncAcpConfigOptions]);
  useEffect(() => {
    if (!isAcpAgent) return;
    let cancelled = false;
    if (activeAcpSessionId) {
      void syncAcpConfigOptionsRef.current();
      return () => {
        cancelled = true;
      };
    }
    const cancel = scheduleStartupDeferredTask(async () => {
      if (!cancelled) await syncAcpConfigOptionsRef.current();
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [isAcpAgent, activeAcpSessionId]);
  const handleAcpConfigOptionsReadyRef = useRef(handleAcpConfigOptionsReady);
  useEffect(() => {
    handleAcpConfigOptionsReadyRef.current = handleAcpConfigOptionsReady;
  }, [handleAcpConfigOptionsReady]);
  useEffect(() => {
    const unsubscribe = sessionClient.onAcpConfigOptionsReady((payload) => {
      handleAcpConfigOptionsReadyRef.current(payload as unknown as Record<string, unknown>);
    });
    return () => {
      unsubscribe?.();
    };
  }, [sessionClient]);
}
interface ChatStatusBarProps {
  acpDraftSessionId?: string | null;
  maxWidthClass?: string;
  /**
   * The composer footer bar (model / effort / mode pickers) is rendered next to
   * this status bar. Suppresses the controls it already owns so model and
   * permission are not shown twice. ACP surfaces (agent badge, inline options,
   * advanced settings) are never duplicated by the footer and always render.
   */
  composerFooterActive?: boolean;
}
// Process-wide singletons; module scope keeps effect dependencies stable (the
// ACP config hook receives sessionClient from here).
const providerClient = createProviderClient();
const sessionClient = createSessionClient();
const ChatStatusBar = ({
  acpDraftSessionId = null,
  maxWidthClass = "max-w-2xl",
  composerFooterActive = false,
}: ChatStatusBarProps) => {
  const themeStore = useThemeStore();
  const modelStore = useModelStore();
  const agentStore = useAgentStore();
  // Subscribe so the bar re-renders on session changes (getters are live reads).
  const sessionStore = useSessionStore();
  void sessionStore;

  const hasActiveSession = getHasActiveSession();
  const availableAgents = Array.isArray(agentStore.agents) ? agentStore.agents : [];
  const selectedAgentSnapshot = getSelectedAgent();
  const inferAgentType = (agentId: string | null | undefined): "argos" | "acp" | null =>
    inferAgentTypeFrom(availableAgents, selectedAgentSnapshot, agentId);
  const selectedAgentType = inferAgentType(agentStore.selectedAgentId);
  const activeSession = getActiveSession();
  const isAcpAgent = (() => {
    if (hasActiveSession) return activeSession?.providerId === "acp";
    return selectedAgentType === "acp";
  })();

  // When the composer footer bar owns the ACP chips (active session on the
  // chat page), the status bar renders none of them and skips its own
  // config-option sync — the footer's AcpComposerControls is the single
  // owner. Pre-session ACP keeps its status-bar surfaces, so the sync runs.
  const footerOwnsAcpControls = composerFooterActive && hasActiveSession && isAcpAgent;
  const acpView = resolveAcpViewContext({
    hasActiveSession,
    activeSession,
    selectedAgentType,
    selectedAgentId: agentStore.selectedAgentId,
    acpDraftSessionId,
  });
  const resolveModelName = createModelNameResolver({
    findEnabledModelMeta,
    findModelByIdOrName: (modelId: string) => modelStore.findModelByIdOrName(modelId),
  });
  const acp = useChatStatusBarAcpConfig({
    isAcpAgent: isAcpAgent && !footerOwnsAcpControls,
    activeAcpAgentId: acpView.activeAcpAgentId ?? null,
    activeAcpSessionId: acpView.activeAcpSessionId ?? null,
    acpWorkspacePath: acpView.acpWorkspacePath,
    selectedAgentId: agentStore.selectedAgentId,
    selectedAgentName: selectedAgentSnapshot?.name ?? null,
    providerClient,
    sessionClient,
    resolveModelName,
    resolveModelIconId,
  });
  const acpAgentForAvatar = resolveAcpAgentForAvatar(
    availableAgents,
    acpView.activeAcpAgentId ?? acpView.lockedAcpModelId,
    acp.acpAgentLabel,
  );
  useAcpConfigOptionsSync({
    isAcpAgent,
    activeAcpSessionId: acpView.activeAcpSessionId ?? null,
    sessionClient,
    syncAcpConfigOptions: acp.syncAcpConfigOptions,
    handleAcpConfigOptionsReady: acp.handleAcpConfigOptionsReady,
  });

  // This bar only has content for pre-session ACP surfaces (agent badge,
  // inline config chips, advanced popover). Active ACP sessions are owned by
  // the composer footer, and argos sessions own everything in the footer too
  // (model/effort/mode pickers, tools & MCP popover) — rendering the row for
  // those would just be an empty strip.
  if (footerOwnsAcpControls || (composerFooterActive && !isAcpAgent)) {
    return null;
  }
  return (
    <div className={`w-full ${maxWidthClass}`}>
      <div className="flex w-full items-center justify-between px-1 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <AcpAgentBadgeGroup acp={acp} agent={acpAgentForAvatar} isDark={themeStore.isDark} />
          <AcpInlineOptionsGroup acp={acp} />
        </div>

        <div className="flex items-center gap-1">
          {acp.acpOverflowOptions.length > 0 && (
            <AcpAdvancedSettings
              options={acp.acpOverflowOptions}
              readOnly={acp.acpConfigReadOnly}
              isOptionSaving={acp.isAcpOptionSaving}
              getOptionDisplayValue={acp.getAcpOptionDisplayValue}
              onSelectOption={acp.onAcpSelectOption}
              onBooleanOption={acp.onAcpBooleanOption}
            />
          )}
        </div>
      </div>
    </div>
  );
};
ChatStatusBar.displayName = "ChatStatusBar";
export default ChatStatusBar;
type ChatStatusBarAcpConfig = ReturnType<typeof useChatStatusBarAcpConfig>;
interface AcpAgentBadgeGroupProps {
  acp: ChatStatusBarAcpConfig;
  agent: AgentAvatarAgent | null;
  isDark?: boolean;
}

/** ACP agent identity badge plus the loading / error / read-only hints. */
function AcpAgentBadgeGroup(props: AcpAgentBadgeGroupProps) {
  const { agent, isDark } = props;
  const acp = props.acp;
  const isLoading = acp.isAcpConfigLoading;
  const hasOptions = acp.hasAcpConfigOptions;
  return (
    <>
      <div className="acp-agent-badge flex h-6 min-w-0 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground backdrop-blur-lg">
        {agent ? (
          <AgentAvatar agent={agent} className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ModelIcon modelId={acp.acpAgentIconId} customClass="w-3.5 h-3.5 shrink-0" isDark={isDark} />
        )}
        <span className="truncate">{acp.acpAgentLabel}</span>
        {isLoading && (
          <Icon icon="lucide:loader-2" className="acp-agent-loading-indicator h-3 w-3 shrink-0 animate-spin" />
        )}
      </div>
      {isLoading && !hasOptions && (
        <Tooltip>
          <TooltipTrigger render={<div className="flex h-6 items-center gap-1 px-1 text-xs text-muted-foreground" />}>
            <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin" />
            <span className="hidden sm:inline">Loading…</span>
          </TooltipTrigger>
          <TooltipContent>Loading agent modes and models…</TooltipContent>
        </Tooltip>
      )}
      {!isLoading && acp.acpConfigError && !hasOptions && (
        <Tooltip>
          <TooltipTrigger render={<div className="flex h-6 items-center gap-1 px-1 text-xs text-destructive" />}>
            <Icon icon="lucide:alert-circle" className="h-3 w-3 shrink-0" />
            <span className="hidden sm:inline">Unavailable</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">Failed to load agent configuration: {acp.acpConfigError}</TooltipContent>
        </Tooltip>
      )}
      {!isLoading && !acp.acpConfigError && !hasOptions && acp.acpConfigReadOnly && (
        <div className="flex h-6 items-center px-1 text-xs text-muted-foreground/60">
          <span className="hidden sm:inline">Select a project to configure</span>
        </div>
      )}
    </>
  );
}
interface AcpInlineOptionsGroupProps {
  acp: ChatStatusBarAcpConfig;
}

/** Inline ACP config option chips, one popover per option. */
function AcpInlineOptionsGroup({ acp }: AcpInlineOptionsGroupProps) {
  return (
    <>
      {acp.acpInlineOptions.map((option) => (
        <AcpInlineOptionPopover
          key={option.id}
          option={option}
          open={acp.acpInlineOpenOptionId === option.id}
          readOnly={acp.acpConfigReadOnly}
          isSaving={acp.isAcpOptionSaving(option.id)}
          displayValue={acp.getAcpOptionDisplayValue(option)}
          onSelectOption={acp.onAcpSelectOption}
          onOpenChange={(open) => acp.onAcpInlineOptionOpenChange(option.id, open)}
        />
      ))}
    </>
  );
}
interface AcpInlineOptionPopoverProps {
  option: AcpConfigOption;
  open: boolean;
  readOnly: boolean;
  isSaving: boolean;
  displayValue: string;
  onSelectOption: (optionId: string, value: string) => void;
  onOpenChange: (open: boolean) => void;
}

/** One ACP config option rendered as a popover chip with grouped entries. */
function AcpInlineOptionPopover(props: AcpInlineOptionPopoverProps) {
  const { option, open, readOnly, isSaving, displayValue, onSelectOption, onOpenChange } = props;
  const optionEntries = option.options ?? [];
  const grouped = optionEntries.reduce<
    Map<
      string,
      {
        label: string;
        entries: typeof optionEntries;
      }
    >
  >((acc, entry) => {
    const g = resolveAcpOptionGroup(entry);
    if (!acc.has(g.key)) {
      acc.set(g.key, {
        label: g.label,
        entries: [],
      });
    }
    acc.get(g.key)!.entries.push(entry);
    return acc;
  }, new Map());
  const groupKeys = [...grouped.keys()];
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            data-option-id={option.id}
            className="acp-inline-option h-6 max-w-[12rem] min-w-0 gap-1 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground backdrop-blur-lg"
            disabled={readOnly || isSaving}
          />
        }
      >
        <Icon icon={getAcpOptionIconId(option.id)} className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <span className="truncate font-medium text-foreground/80">{isSaving ? "Saving…" : displayValue}</span>
        <Icon icon="lucide:chevron-down" className="h-3 w-3 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="min-w-[200px] max-w-[320px] overflow-hidden p-0">
        <div className="border-b px-3 py-2.5">
          <div data-option-id={option.id} className="acp-inline-option-title text-sm font-semibold">
            {option.label}
          </div>
          {option.description && <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>}
        </div>
        {optionEntries.length > 0 ? (
          <div className="max-h-72 overflow-y-auto p-1.5">
            {groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== "__default__")
              ? groupKeys.map((groupKey) => {
                  const group = grouped.get(groupKey)!;
                  return (
                    <div key={groupKey} className="mb-1 last:mb-0">
                      {group.label && (
                        <div className="px-2 pb-1 pt-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          {group.label}
                        </div>
                      )}
                      {group.entries.map((entry) => {
                        const isSelected = String(option.currentValue) === entry.value;
                        return (
                          <AcpOptionEntryButton
                            key={`${option.id}-${entry.value}`}
                            optionId={option.id}
                            entry={entry}
                            isSelected={isSelected}
                            disabled={readOnly || isSaving || isSelected}
                            onSelect={onSelectOption}
                          />
                        );
                      })}
                    </div>
                  );
                })
              : optionEntries.map((entry) => {
                  const isSelected = String(option.currentValue) === entry.value;
                  return (
                    <AcpOptionEntryButton
                      key={`${option.id}-${entry.value}`}
                      optionId={option.id}
                      entry={entry}
                      isSelected={isSelected}
                      disabled={readOnly || isSaving || isSelected}
                      onSelect={onSelectOption}
                    />
                  );
                })}
          </div>
        ) : (
          <div className="px-3 py-4 text-xs text-muted-foreground">No options available</div>
        )}
      </PopoverContent>
    </Popover>
  );
}
interface AcpOptionEntryButtonProps {
  optionId: string;
  entry: NonNullable<AcpConfigOption["options"]>[number];
  isSelected: boolean;
  disabled: boolean;
  onSelect: (optionId: string, value: string) => void;
}

/** One selectable ACP config option entry row. */
function AcpOptionEntryButton({ optionId, entry, isSelected, disabled, onSelect }: AcpOptionEntryButtonProps) {
  return (
    <button
      type="button"
      data-option-id={optionId}
      data-value={entry.value}
      disabled={disabled}
      className={`acp-inline-option-item flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors disabled:pointer-events-none ${isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
      onClick={() => onSelect(optionId, entry.value)}
    >
      <Icon
        icon={isSelected ? "lucide:check" : "lucide:circle"}
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : "text-transparent"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{resolveAcpOptionDisplayLabel(entry)}</div>
        {entry.description && (
          <div className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground/70">{entry.description}</div>
        )}
      </div>
    </button>
  );
}
