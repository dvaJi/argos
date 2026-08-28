import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { useModelStore, getChatSelectableModelGroupsFrom } from "#/stores/modelStore";
import { useProviderStore, getSortedProvidersFrom } from "#/stores/providerStore";
import { useAgentStore } from "#/stores/ui/agent";
import { useSessionStore, getActiveSession, getHasActiveSession } from "#/stores/ui/session";
import { draftStore, useDraftStore } from "#/stores/ui/draft";
import { createSessionClient } from "#api/SessionClient";
import { usePreSessionAgentType } from "#/composables/chat/usePreSessionAgentType";
import ModelIcon from "#/components/icons/ModelIcon";
import AgentAvatar from "#/components/icons/AgentAvatar";
import { useThemeStore } from "#/stores/theme";

const ComposerModelPicker = () => {
  const modelStore = useModelStore();
  const agentState = useAgentStore();
  const sessionStoreState = useSessionStore();
  void sessionStoreState;
  const draftState = useDraftStore();
  void draftState;
  const themeStore = useThemeStore();
  const sessionClient = useMemo(() => createSessionClient(), []);
  const preSessionAgentType = usePreSessionAgentType();

  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");

  const hasActiveSession = getHasActiveSession();
  const activeSession = getActiveSession();

  const isAcpAgent = useMemo(() => {
    if (hasActiveSession) return activeSession?.providerId === "acp";
    // No explicit pick yet: follow the effective agent (first enabled Argos
    // agent by default) so an Argos composer shows provider models, not the
    // ACP agent list.
    return preSessionAgentType === "acp";
  }, [hasActiveSession, activeSession?.providerId, preSessionAgentType]);

  const acpAgents = useMemo(
    () => agentState.agents.filter((a) => a.type === "acp" || a.agentType === "acp"),
    [agentState.agents],
  );

  const displayText = useMemo(() => {
    if (isAcpAgent) {
      const agentId = hasActiveSession ? activeSession?.modelId : agentState.selectedAgentId;
      const agent = agentState.agents.find((a) => a.id === agentId);
      return agent?.name ?? agentId ?? "Select model";
    }
    if (hasActiveSession && activeSession?.modelId) return activeSession.modelId;
    if (draftState.modelId) return draftState.modelId;
    return "Select model";
  }, [
    isAcpAgent,
    hasActiveSession,
    activeSession?.modelId,
    agentState.agents,
    agentState.selectedAgentId,
    draftState.modelId,
  ]);

  const displayIconId = useMemo(() => {
    if (isAcpAgent) {
      const agentId = hasActiveSession ? activeSession?.modelId : agentState.selectedAgentId;
      return agentId ?? "acp";
    }
    const providerId = hasActiveSession ? activeSession?.providerId : draftState.providerId;
    return providerId ?? "anthropic";
  }, [
    isAcpAgent,
    hasActiveSession,
    activeSession?.providerId,
    activeSession?.modelId,
    agentState.selectedAgentId,
    draftState.providerId,
  ]);

  const { enabledModels } = modelStore;
  const providerStore = useProviderStore();
  const { providers, providerOrder, providerTimestamps } = providerStore;

  const modelGroups = useMemo(() => {
    if (!modelStore.initialized) return [];
    const sorted = getSortedProvidersFrom(providers, providerOrder, providerTimestamps);
    const orderedProviders = sorted.length > 0 ? sorted : providers;
    return getChatSelectableModelGroupsFrom(orderedProviders, enabledModels);
    // enabledModels drives the group list; recompute when it changes (models
    // can become available after init without `initialized` flipping again).
  }, [modelStore.initialized, enabledModels, providers, providerOrder, providerTimestamps]);

  const filteredGroups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return modelGroups;
    return modelGroups
      .map((g) => ({
        ...g,
        models: g.models.filter((m) => `${m.name} ${m.id} ${g.providerName}`.toLowerCase().includes(kw)),
      }))
      .filter((g) => g.models.length > 0);
  }, [modelGroups, keyword]);

  const filteredAcpAgents = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return acpAgents;
    return acpAgents.filter((a) => `${a.name} ${a.id}`.toLowerCase().includes(kw));
  }, [acpAgents, keyword]);

  const isLocked = useMemo(
    () => isAcpAgent && Boolean(hasActiveSession && activeSession?.modelId),
    [isAcpAgent, hasActiveSession, activeSession?.modelId],
  );

  const handleSelectProviderModel = async (providerId: string, modelId: string) => {
    setOpen(false);
    if (hasActiveSession && activeSession?.id) {
      try {
        await sessionClient.setSessionModel(activeSession.id, providerId, modelId);
      } catch {}
    } else {
      draftStore.setState((prev) => ({ ...prev, providerId, modelId }));
    }
  };

  const handleSelectAcp = async (agentId: string) => {
    setOpen(false);
    if (hasActiveSession && activeSession?.id) {
      try {
        await sessionClient.setSessionModel(activeSession.id, "acp", agentId);
      } catch {}
    } else {
      draftStore.setState((prev) => ({ ...prev, agentId, providerId: "acp", modelId: agentId }));
    }
  };

  const isSelected = (providerId: string, modelId: string) => {
    if (hasActiveSession) return activeSession?.providerId === providerId && activeSession?.modelId === modelId;
    return draftState.providerId === providerId && draftState.modelId === modelId;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            data-testid="composer-model-picker"
            className={
              isLocked
                ? // Active ACP session: the agent can't be switched here, so show
                  // a compact avatar-only chip (name lives in its tooltip).
                  "h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground"
                : "h-7 max-w-[180px] gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
            }
            disabled={isLocked}
            title={isLocked ? displayText : undefined}
            aria-label={isLocked ? displayText : undefined}
          />
        }
      >
        {isAcpAgent ? (
          <AgentAvatar
            agent={
              agentState.agents.find(
                (a) => a.id === (hasActiveSession ? activeSession?.modelId : agentState.selectedAgentId),
              ) ?? {
                id: displayIconId,
                name: displayText,
                type: "acp",
                enabled: true,
              }
            }
            className="h-3.5 w-3.5 shrink-0"
          />
        ) : (
          <ModelIcon modelId={displayIconId} customClass="h-3.5 w-3.5 shrink-0" isDark={themeStore.isDark} />
        )}
        {!isLocked && (
          <>
            <span className="truncate font-medium">{displayText}</span>
            <Icon icon="lucide:chevron-down" className="h-3 w-3 shrink-0 opacity-60" />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start" sideOffset={8}>
        <div className="flex flex-col max-h-[420px]">
          <div className="p-2">
            <div className="relative">
              <Icon
                icon="lucide:search"
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search models..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="h-8 pl-8 text-sm"
                autoFocus
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {isAcpAgent ? (
              filteredAcpAgents.length > 0 ? (
                <div className="mb-3">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Agents
                  </div>
                  {filteredAcpAgents.map((agent) => {
                    const selected = hasActiveSession
                      ? activeSession?.modelId === agent.id
                      : agentState.selectedAgentId === agent.id;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${selected ? "bg-accent" : ""}`}
                        onClick={() => void handleSelectAcp(agent.id)}
                      >
                        <AgentAvatar agent={agent} className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{agent.name}</span>
                        <span className="text-xs text-muted-foreground">Codex</span>
                        {selected && <Icon icon="lucide:check" className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">No agents found</div>
              )
            ) : filteredGroups.length > 0 ? (
              filteredGroups.map((group) => (
                <div key={group.providerId} className="mb-3">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.providerName}
                  </div>
                  {group.models.slice(0, 12).map((model) => (
                    <button
                      key={`${group.providerId}:${model.id}`}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${isSelected(group.providerId, model.id) ? "bg-accent" : ""}`}
                      onClick={() => void handleSelectProviderModel(group.providerId, model.id)}
                    >
                      <ModelIcon modelId={group.providerId} customClass="h-4 w-4 shrink-0" isDark={themeStore.isDark} />
                      <span className="flex-1 truncate">{model.name || model.id}</span>
                      {isSelected(group.providerId, model.id) && (
                        <Icon icon="lucide:check" className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  ))}
                  {group.models.length > 12 && (
                    <div className="px-2 py-1 text-xs text-muted-foreground">{group.models.length - 12} more…</div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">No models found</div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ComposerModelPicker;
