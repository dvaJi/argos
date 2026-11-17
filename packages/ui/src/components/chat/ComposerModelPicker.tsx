import { useState } from "react";
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
import { toggleFavorite, useModelFavorites, favoriteKey } from "#/stores/ui/modelFavorites";
import { filterFavoriteModels, filterModelGroups, selectFavoriteModels } from "./composerModelPickerData";
import ComposerTuningDock from "./ComposerTuningDock";

/** Pill scope: every provider, favorites only, or a single provider id. */
type RailFilter = "all" | "favorites" | (string & {});

const ProviderPill = ({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children?: React.ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={active}
    className={`flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ${
      active
        ? "border-primary/40 bg-primary/10 text-foreground"
        : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
    }`}
    onClick={onClick}
  >
    {children}
    <span className="max-w-[120px] truncate">{label}</span>
  </button>
);

type ModelRowProps = {
  providerId: string;
  model: { id: string; name?: string };
  selected: boolean;
  isDark: boolean;
  favorited: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
};

/**
 * A selectable provider-model row. A `div` with button semantics (not a real
 * `<button>`) so the favorite star can be a nested control; the star stops
 * propagation so toggling never selects.
 */
const ModelRow = ({ providerId, model, selected, isDark, favorited, onSelect, onToggleFavorite }: ModelRowProps) => (
  <div
    role="button"
    tabIndex={0}
    className={`group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${selected ? "bg-accent" : ""}`}
    onClick={onSelect}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    }}
  >
    <ModelIcon modelId={providerId} customClass="h-4 w-4 shrink-0" isDark={isDark} />
    <span className="min-w-0 flex-1 truncate">{model.name || model.id}</span>
    <button
      type="button"
      tabIndex={-1}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      title={favorited ? "Remove from favorites" : "Add to favorites"}
      className={`h-6 w-6 shrink-0 rounded p-0.5 hover:text-foreground ${favorited ? "text-amber-400" : "text-transparent group-hover:text-muted-foreground"}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggleFavorite();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Icon icon="lucide:star" className={`h-3.5 w-3.5 ${favorited ? "fill-current" : ""}`} />
    </button>
    {selected && <Icon icon="lucide:check" className="h-3.5 w-3.5 text-primary" />}
  </div>
);

const ComposerModelPicker = () => {
  const modelStore = useModelStore();
  const agentState = useAgentStore();
  const sessionStoreState = useSessionStore();
  const draftState = useDraftStore();
  void draftState;
  const themeStore = useThemeStore();
  const sessionClient = createSessionClient();
  const preSessionAgentType = usePreSessionAgentType();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [railFilter, setRailFilter] = useState<RailFilter>("all");
  const favoriteKeys = useModelFavorites();
  const hasActiveSession = getHasActiveSession();
  const activeSession = getActiveSession();
  const isAcpAgent = (() => {
    if (hasActiveSession) return activeSession?.providerId === "acp";
    // No explicit pick yet: follow the effective agent (first enabled Argos
    // agent by default) so an Argos composer shows provider models, not the
    // ACP agent list.
    return preSessionAgentType === "acp";
  })();
  const acpAgents = agentState.agents.filter((a) => a.type === "acp" || a.agentType === "acp");
  const displayText = (() => {
    if (isAcpAgent) {
      const agentId = hasActiveSession ? activeSession?.modelId : agentState.selectedAgentId;
      const agent = agentState.agents.find((a) => a.id === agentId);
      return agent?.name ?? agentId ?? "Select model";
    }
    if (hasActiveSession && activeSession?.modelId) return activeSession.modelId;
    if (draftState.modelId) return draftState.modelId;
    return "Select model";
  })();
  const displayIconId = (() => {
    if (isAcpAgent) {
      const agentId = hasActiveSession ? activeSession?.modelId : agentState.selectedAgentId;
      return agentId ?? "acp";
    }
    const providerId = hasActiveSession ? activeSession?.providerId : draftState.providerId;
    return providerId ?? "anthropic";
  })();
  const { enabledModels } = modelStore;
  const providerStore = useProviderStore();
  const { providers, providerOrder, providerTimestamps } = providerStore;
  const modelGroups = (() => {
    if (!modelStore.initialized) return [];
    const sorted = getSortedProvidersFrom(providers, providerOrder, providerTimestamps);
    const orderedProviders = sorted.length > 0 ? sorted : providers;
    return getChatSelectableModelGroupsFrom(orderedProviders, enabledModels);
    // enabledModels drives the group list; recompute when it changes (models
    // can become available after init without `initialized` flipping again).
  })();
  const filteredGroups = filterModelGroups(modelGroups, keyword);
  const favoriteModels = filterFavoriteModels(selectFavoriteModels(modelGroups, favoriteKeys), keyword);
  // A provider picked in the rail can disappear (disabled meanwhile) — fall back to all.
  const activeRail: RailFilter =
    railFilter === "all" || railFilter === "favorites" || modelGroups.some((g) => g.providerId === railFilter)
      ? railFilter
      : "all";
  // Searching always spans every provider; otherwise the rail scopes the list.
  const isSearching = keyword.trim().length > 0;
  const visibleGroups = isSearching
    ? filteredGroups
    : activeRail === "favorites"
      ? []
      : activeRail === "all"
        ? filteredGroups
        : filteredGroups.filter((g) => g.providerId === activeRail);
  const visibleFavorites = isSearching || activeRail === "all" || activeRail === "favorites" ? favoriteModels : [];
  const groupModelLimit = !isSearching && activeRail === "all" ? 12 : Number.POSITIVE_INFINITY;
  const showPills = !isAcpAgent && modelGroups.length > 1;
  const filteredAcpAgents = (() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return acpAgents;
    return acpAgents.filter((a) => `${a.name} ${a.id}`.toLowerCase().includes(kw));
  })();
  const isLocked = isAcpAgent && Boolean(hasActiveSession && activeSession?.modelId);
  // Keeps the popover open so reasoning/permissions can be tuned for the new
  // model in the side pane (ACP agent picks still close — no pane there).
  const handleSelectProviderModel = async (providerId: string, modelId: string) => {
    if (hasActiveSession && activeSession?.id) {
      try {
        // Via the store (not the raw client) so the active session — and with
        // it the checkmark and the side pane — reflects the new model while
        // the popover stays open.
        await sessionStoreState.setSessionModel(activeSession.id, providerId, modelId);
      } catch {}
    } else {
      draftStore.setState((prev) => ({
        ...prev,
        providerId,
        modelId,
      }));
    }
  };
  const handleSelectAcp = async (agentId: string) => {
    setOpen(false);
    if (hasActiveSession && activeSession?.id) {
      try {
        await sessionClient.setSessionModel(activeSession.id, "acp", agentId);
      } catch {}
    } else {
      draftStore.setState((prev) => ({
        ...prev,
        agentId,
        providerId: "acp",
        modelId: agentId,
      }));
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
      <PopoverContent className="w-[440px] max-w-[calc(100vw-1rem)] p-0" align="start" sideOffset={8}>
        <div className={`flex flex-col ${isAcpAgent ? "max-h-[420px]" : "h-[460px]"}`}>
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
          {showPills && (
            <div className="scrollbar-hide flex shrink-0 gap-1.5 overflow-x-auto px-2 pb-2">
              <ProviderPill active={activeRail === "all"} label="All" onClick={() => setRailFilter("all")} />
              {favoriteModels.length > 0 && (
                <ProviderPill
                  active={activeRail === "favorites"}
                  label="Favorites"
                  onClick={() => setRailFilter("favorites")}
                >
                  <Icon icon="lucide:star" className="h-3 w-3" />
                </ProviderPill>
              )}
              {modelGroups.map((group) => (
                <ProviderPill
                  key={group.providerId}
                  active={activeRail === group.providerId}
                  label={group.providerName}
                  onClick={() => setRailFilter(group.providerId)}
                >
                  <ModelIcon modelId={group.providerId} customClass="h-3 w-3" isDark={themeStore.isDark} />
                </ProviderPill>
              ))}
            </div>
          )}
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
            ) : visibleGroups.length > 0 || visibleFavorites.length > 0 ? (
              <>
                {visibleFavorites.length > 0 && (
                  <div className="mb-3">
                    <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Favorites
                    </div>
                    {visibleFavorites.map((favorite) => (
                      <ModelRow
                        key={`fav:${favorite.providerId}:${favorite.id}`}
                        providerId={favorite.providerId}
                        model={{ id: favorite.id, name: favorite.name }}
                        selected={isSelected(favorite.providerId, favorite.id)}
                        isDark={themeStore.isDark}
                        favorited
                        onSelect={() => void handleSelectProviderModel(favorite.providerId, favorite.id)}
                        onToggleFavorite={() => toggleFavorite(favorite.providerId, favorite.id)}
                      />
                    ))}
                  </div>
                )}
                {visibleGroups.map((group) => (
                  <div key={group.providerId} className="mb-3">
                    <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.providerName}
                    </div>
                    {group.models.slice(0, groupModelLimit).map((model) => (
                      <ModelRow
                        key={`${group.providerId}:${model.id}`}
                        providerId={group.providerId}
                        model={model}
                        selected={isSelected(group.providerId, model.id)}
                        isDark={themeStore.isDark}
                        favorited={favoriteKeys.includes(favoriteKey(group.providerId, model.id))}
                        onSelect={() => void handleSelectProviderModel(group.providerId, model.id)}
                        onToggleFavorite={() => toggleFavorite(group.providerId, model.id)}
                      />
                    ))}
                    {group.models.length > groupModelLimit && (
                      <button
                        type="button"
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setRailFilter(group.providerId)}
                      >
                        {group.models.length - groupModelLimit} more…
                      </button>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">No models found</div>
            )}
          </div>
          {!isAcpAgent && <ComposerTuningDock />}
        </div>
      </PopoverContent>
    </Popover>
  );
};
export default ComposerModelPicker;
