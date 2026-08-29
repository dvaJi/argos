import { useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { createProviderClient } from "#api/ProviderClient";
import { createSessionClient } from "#api/SessionClient";
import { useSessionStore, getActiveSession, getHasActiveSession } from "#/stores/ui/session";
import { useModelStore, getChatSelectableModelGroups } from "#/stores/modelStore";
import { useChatStatusBarAcpConfig } from "./composables/useChatStatusBarAcpConfig";
import AcpAdvancedSettings from "./AcpAdvancedSettings";
import type { AcpConfigOption } from "@argos/shared/presenter";
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
const OPTION_ICON_BY_ID: Record<string, string> = {
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

/**
 * ACP agent options (mode / collaboration / model / …) for an ACTIVE session,
 * rendered as chips inside the composer footer bar. Mirrors the markup that
 * used to live in the ChatStatusBar so the footer bar is the single control
 * surface; the status bar keeps only non-duplicated utilities.
 */
const AcpComposerControls = () => {
  // Subscribe so chips re-render when the active session changes.
  const sessionStoreState = useSessionStore();
  void sessionStoreState;
  const modelStore = useModelStore();
  const sessionClient = createSessionClient();
  const providerClient = createProviderClient();
  const hasActiveSession = getHasActiveSession();
  const activeSession = getActiveSession();
  const isAcpActiveSession = hasActiveSession && activeSession?.providerId === "acp";
  const activeAcpAgentId = isAcpActiveSession ? activeSession?.modelId || null : null;
  const activeAcpSessionId = isAcpActiveSession ? (activeSession?.id ?? null) : null;
  const acpWorkspacePath = isAcpActiveSession ? activeSession?.projectDir?.trim() || null : null;
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
    isAcpAgent: Boolean(isAcpActiveSession),
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
    if (!isAcpActiveSession || !activeAcpSessionId) return;
    let cancelled = false;
    void syncAcpConfigOptionsRef.current();
    return () => {
      cancelled = true;
    };
  }, [isAcpActiveSession, activeAcpSessionId]);
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
  }, [sessionClient]);
  if (!isAcpActiveSession) {
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
      {acp.acpInlineOptions.map((option) => {
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
          <Popover
            key={option.id}
            open={acp.acpInlineOpenOptionId === option.id}
            onOpenChange={(open) => acp.onAcpInlineOptionOpenChange(option.id, open)}
          >
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  data-option-id={option.id}
                  className="acp-inline-option h-7 max-w-[12rem] min-w-0 gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  disabled={acp.acpConfigReadOnly || acp.isAcpOptionSaving(option.id)}
                />
              }
            >
              <Icon
                icon={OPTION_ICON_BY_ID[option.id.toLowerCase().replace(/\s+/g, "-")] ?? "lucide:sliders-horizontal"}
                className="h-3 w-3 shrink-0 text-muted-foreground/60"
              />
              <span className="truncate font-medium text-foreground/80">
                {acp.isAcpOptionSaving(option.id) ? "Saving…" : acp.getAcpOptionDisplayValue(option)}
              </span>
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
                                <button
                                  key={`${option.id}-${entry.value}`}
                                  type="button"
                                  data-option-id={option.id}
                                  data-value={entry.value}
                                  disabled={acp.acpConfigReadOnly || acp.isAcpOptionSaving(option.id) || isSelected}
                                  className={`acp-inline-option-item flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors disabled:pointer-events-none ${isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                                  onClick={() => acp.onAcpSelectOption(option.id, entry.value)}
                                >
                                  <Icon
                                    icon={isSelected ? "lucide:check" : "lucide:circle"}
                                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : "text-transparent"}`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium">{resolveAcpOptionDisplayLabel(entry)}</div>
                                    {entry.description && (
                                      <div className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground/70">
                                        {entry.description}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })
                    : optionEntries.map((entry) => {
                        const isSelected = String(option.currentValue) === entry.value;
                        return (
                          <button
                            key={`${option.id}-${entry.value}`}
                            type="button"
                            data-option-id={option.id}
                            data-value={entry.value}
                            disabled={acp.acpConfigReadOnly || acp.isAcpOptionSaving(option.id) || isSelected}
                            className={`acp-inline-option-item flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors disabled:pointer-events-none ${isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                            onClick={() => acp.onAcpSelectOption(option.id, entry.value)}
                          >
                            <Icon
                              icon={isSelected ? "lucide:check" : "lucide:circle"}
                              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : "text-transparent"}`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium">{resolveAcpOptionDisplayLabel(entry)}</div>
                              {entry.description && (
                                <div className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground/70">
                                  {entry.description}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                </div>
              ) : (
                <div className="px-3 py-4 text-xs text-muted-foreground">No options available</div>
              )}
            </PopoverContent>
          </Popover>
        );
      })}
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
