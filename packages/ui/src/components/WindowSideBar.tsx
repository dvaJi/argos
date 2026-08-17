import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@iconify/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { createDeviceClient } from "#api/DeviceClient";
import { useAgentStore, selectedAgent as getSelectedAgent } from "#/stores/ui/agent";
import {
  useSessionStore,
  getActiveSession,
  getHasActiveSession,
  type SessionGroup,
  type UISession,
} from "#/stores/ui/session";
import { useSpotlightStore } from "#/stores/ui/spotlight";
import AgentAvatar from "./icons/AgentAvatar";
import WindowSideBarSessionItem from "./WindowSideBarSessionItem";
import WorkspaceSelector from "./WorkspaceSelector";
import { useSidebarStore } from "#/stores/ui/sidebar";
import { useThemeStore } from "#/stores/theme";

type PinFeedbackMode = "pinning" | "unpinning";
type SessionItemRegion = "pinned" | "grouped";
type ShortcutPlatform = "mac" | "other";

const PIN_FEEDBACK_DURATION_MS: Record<PinFeedbackMode, number> = { pinning: 560, unpinning: 460 };
const getPinFeedbackMode = (nextPinned: boolean): PinFeedbackMode => (nextPinned ? "pinning" : "unpinning");

const deviceClient = createDeviceClient();

export default function WindowSideBar() {
  const navigate = useNavigate();
  const agentStore = useAgentStore();
  const sessionStore = useSessionStore();
  const sidebarStore = useSidebarStore();
  const spotlightStore = useSpotlightStore();
  const themeStore = useThemeStore();

  const collapsed = sidebarStore.collapsed;
  const [sessionSearchQuery, setSessionSearchQuery] = useState("");
  const [isPinnedSectionCollapsed, setIsPinnedSectionCollapsed] = useState(false);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [deleteTargetSession, setDeleteTargetSession] = useState<UISession | null>(null);
  const [pinFlightSessionId, setPinFlightSessionId] = useState<string | null>(null);
  const [pinDockedSessionId, setPinDockedSessionId] = useState<string | null>(null);
  const [pinFeedbackSessionId, setPinFeedbackSessionId] = useState<string | null>(null);
  const [pinFeedbackMode, setPinFeedbackMode] = useState<PinFeedbackMode | null>(null);
  const [shortcutPlatform, setShortcutPlatform] = useState<ShortcutPlatform>(
    navigator.platform.toLowerCase().includes("mac") ? "mac" : "other",
  );
  const [showShortcutBadges, setShowShortcutBadges] = useState(false);
  const [shortcutModifierDown, setShortcutModifierDown] = useState(false);

  const sessionListRef = useRef<HTMLDivElement | null>(null);
  const agentSwitchSeqRef = useRef(0);
  const agentSwitchQueueRef = useRef(Promise.resolve());
  const pinFeedbackTimerRef = useRef<number | null>(null);
  const sessionListScrollFrameRef = useRef<number | null>(null);
  const shortcutBadgeTimerRef = useRef<number | null>(null);

  const themeIcon = useMemo(() => {
    switch (themeStore.themeMode) {
      case "light":
        return "line-md:moon-to-sunny-outline-transition";
      case "dark":
        return "line-md:sunny-outline-to-moon-transition";
      default:
        return "line-md:monitor";
    }
  }, [themeStore.themeMode]);

  const themeModeLabel = useMemo(() => {
    switch (themeStore.themeMode) {
      case "light":
        return "Light";
      case "dark":
        return "Dark";
      default:
        return "System";
    }
  }, [themeStore.themeMode]);

  const hasActiveSession = getHasActiveSession();
  const activeSessionAgentId = getActiveSession()?.agentId?.trim();
  const sidebarSelectedAgentId = useMemo(() => {
    if (hasActiveSession && activeSessionAgentId) return activeSessionAgentId;
    const selectedAgentId = typeof agentStore.selectedAgentId === "string" ? agentStore.selectedAgentId.trim() : "";
    return selectedAgentId || null;
  }, [hasActiveSession, activeSessionAgentId, agentStore.selectedAgentId]);

  const selectedAgentName = useMemo(() => {
    if (sidebarSelectedAgentId === null) return "All Agents";
    if (getSelectedAgent()?.id === sidebarSelectedAgentId) return getSelectedAgent()?.name ?? "";
    const matchedAgent = agentStore.enabledAgents.find((agent) => agent.id === sidebarSelectedAgentId);
    return matchedAgent?.name ?? "All Agents";
  }, [sidebarSelectedAgentId, agentStore]);

  const normalizedSearchQuery = sessionSearchQuery.trim().toLowerCase();
  const matchesSessionSearch = (session: UISession) => {
    if (!normalizedSearchQuery) return true;
    return session.title.toLowerCase().includes(normalizedSearchQuery);
  };

  const pinnedSessions = useMemo(
    () => sessionStore.getPinnedSessions(sidebarSelectedAgentId).filter(matchesSessionSearch),
    [sessionStore, sidebarSelectedAgentId, normalizedSearchQuery],
  );

  const filteredGroups = useMemo(
    () =>
      sessionStore
        .getFilteredGroups(sidebarSelectedAgentId)
        .map((group: SessionGroup) => ({
          ...group,
          sessions: group.sessions.filter(matchesSessionSearch),
        }))
        .filter((group) => group.sessions.length > 0),
    [sessionStore, sidebarSelectedAgentId, normalizedSearchQuery],
  );

  const getGroupIdentifier = (group: SessionGroup) => group.id;
  const getGroupLabel = (group: SessionGroup) => group.labelKey ?? group.label;
  const isGroupCollapsed = (group: SessionGroup) => collapsedGroupIds.has(getGroupIdentifier(group));

  const handleAgentSelect = useCallback(
    async (id: string | null) => {
      if (collapsed) sidebarStore.setCollapsed(false);
      const requestSeq = ++agentSwitchSeqRef.current;
      agentSwitchQueueRef.current = agentSwitchQueueRef.current
        .then(async () => {
          const currentAgentId = sidebarSelectedAgentId;
          const nextAgentId = currentAgentId === id ? null : id;
          if (nextAgentId === currentAgentId) return;
          if (getHasActiveSession()) {
            try {
              await sessionStore.closeSession();
            } catch {
              return;
            }
          }
          if (requestSeq !== agentSwitchSeqRef.current) return;
          agentStore.setSelectedAgent(nextAgentId);
        })
        .catch(() => {});
      await agentSwitchQueueRef.current;
    },
    [collapsed, sidebarStore, sidebarSelectedAgentId, sessionStore, agentStore],
  );

  const handleSessionClick = useCallback(
    (session: { id: string }) => {
      void sessionStore.selectSession(session.id);
    },
    [sessionStore],
  );

  const handleNewChat = useCallback(() => {
    void sessionStore.startNewConversation({ refresh: true });
  }, [sessionStore]);

  const openSettings = useCallback(() => {
    void navigate({ to: "/settings/overview" });
  }, [navigate]);

  const togglePinnedSection = useCallback(() => {
    setIsPinnedSectionCollapsed((prev) => !prev);
  }, []);

  const toggleGroup = useCallback((group: SessionGroup) => {
    const groupId = getGroupIdentifier(group);
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleTogglePin = useCallback(
    async (session: UISession) => {
      const nextPinned = !session.isPinned;
      await sessionStore.toggleSessionPinned(session.id, nextPinned);
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      setPinFeedbackSessionId(session.id);
      const mode = getPinFeedbackMode(nextPinned);
      setPinFeedbackMode(mode);
      if (pinFeedbackTimerRef.current) window.clearTimeout(pinFeedbackTimerRef.current);
      pinFeedbackTimerRef.current = window.setTimeout(() => {
        setPinFeedbackSessionId(null);
        setPinFeedbackMode(null);
        pinFeedbackTimerRef.current = null;
      }, PIN_FEEDBACK_DURATION_MS[mode]);
    },
    [sessionStore],
  );

  const openDeleteDialog = useCallback((session: UISession) => {
    setDeleteTargetSession(session);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTargetSession) return;
    try {
      await sessionStore.deleteSession(deleteTargetSession.id);
    } catch {}
    setDeleteTargetSession(null);
  }, [deleteTargetSession, sessionStore]);

  const handleSessionListScroll = useCallback(() => {
    if (sessionListScrollFrameRef.current !== null) return;
    sessionListScrollFrameRef.current = window.requestAnimationFrame(() => {
      sessionListScrollFrameRef.current = null;
      const listElement = sessionListRef.current;
      if (!listElement || sessionStore.loadingMore || !sessionStore.hasMore) return;
      const distanceToBottom = listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight;
      if (distanceToBottom <= 96) void sessionStore.loadNextPage();
    });
  }, [sessionStore]);

  const getShortcutBadgeLabelForSession = useCallback(
    (sessionId: string, sessions: UISession[]) => {
      const index = sessions.findIndex((s) => s.id === sessionId);
      if (index < 0 || index >= 10) return null;
      const digit = index === 9 ? "0" : String(index + 1);
      return shortcutPlatform === "mac" ? `⌘${digit}` : `Alt+${digit}`;
    },
    [shortcutPlatform],
  );

  const visibleShortcutSessions = useMemo(() => {
    if (collapsed) return [];
    const sessions: UISession[] = [];
    if (!isPinnedSectionCollapsed) sessions.push(...pinnedSessions);
    for (const group of filteredGroups) {
      if (!isGroupCollapsed(group)) sessions.push(...group.sessions);
    }
    return sessions.filter((session) => session.id !== pinFlightSessionId).slice(0, 10);
  }, [collapsed, isPinnedSectionCollapsed, pinnedSessions, filteredGroups, collapsedGroupIds, pinFlightSessionId]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const modKey = shortcutPlatform === "mac" ? "Meta" : "Alt";
      const isModPressed = shortcutPlatform === "mac" ? event.metaKey : event.altKey;
      if (event.key === modKey && !event.repeat) {
        setShortcutModifierDown(true);
        shortcutBadgeTimerRef.current = window.setTimeout(() => {
          shortcutBadgeTimerRef.current = null;
          if (!collapsed && visibleShortcutSessions.length > 0) setShowShortcutBadges(true);
        }, 500);
      }
      if (/^[0-9]$/.test(event.key) && isModPressed && !event.repeat) {
        event.preventDefault();
        const digit = event.key;
        const shortcutIndex = digit === "0" ? 9 : Number(digit) - 1;
        const targetSession = visibleShortcutSessions[shortcutIndex];
        if (targetSession) void sessionStore.selectSession(targetSession.id);
      }
    };
    const handleKeyup = (event: KeyboardEvent) => {
      const modKey = shortcutPlatform === "mac" ? "Meta" : "Alt";
      if (event.key === modKey) {
        setShowShortcutBadges(false);
        setShortcutModifierDown(false);
        if (shortcutBadgeTimerRef.current) {
          window.clearTimeout(shortcutBadgeTimerRef.current);
          shortcutBadgeTimerRef.current = null;
        }
      }
    };
    const handleBlur = () => {
      setShowShortcutBadges(false);
      setShortcutModifierDown(false);
    };
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("keyup", handleKeyup);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("keyup", handleKeyup);
      window.removeEventListener("blur", handleBlur);
    };
  }, [shortcutPlatform, collapsed, visibleShortcutSessions, sessionStore]);

  useEffect(() => {
    void deviceClient.getDeviceInfo().then((info) => {
      setShortcutPlatform(info.platform === "darwin" ? "mac" : "other");
    });
  }, []);

  useEffect(() => {
    return () => {
      if (sessionListScrollFrameRef.current) window.cancelAnimationFrame(sessionListScrollFrameRef.current);
      if (pinFeedbackTimerRef.current) window.clearTimeout(pinFeedbackTimerRef.current);
    };
  }, []);

  const getShortcutBadge = (sessionId: string) =>
    showShortcutBadges ? getShortcutBadgeLabelForSession(sessionId, visibleShortcutSessions) : null;
  const hasShortcutBadge = (sessionId: string) =>
    showShortcutBadges && visibleShortcutSessions.some((s) => s.id === sessionId);

  return (
    <>
      <div
        data-testid="window-sidebar"
        className={`window-sidebar-shell flex flex-row h-full shrink-0 overflow-hidden bg-sidebar window-drag-region${collapsed ? " w-12" : " w-[288px]"}`}
      >
        <div className="window-no-drag-region flex flex-col items-center shrink-0 pt-2 pb-2 gap-1 w-12">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  data-testid="sidebar-agent-all-button"
                  data-agent-id="__all__"
                  data-selected={String(sidebarSelectedAgentId === null)}
                  className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-colors duration-150${
                    sidebarSelectedAgentId === null
                      ? " bg-card/50 border-white/70 dark:border-white/20 ring-1 ring-black/10 hover:bg-white/30 dark:hover:bg-white/10"
                      : " bg-transparent border-none hover:bg-white/30 dark:hover:bg-white/10 shadow-none"
                  }`}
                  onClick={() => handleAgentSelect(null)}
                />
              }
            >
              <Icon icon="uil:layers" className="w-4 h-4 text-foreground/80" />
            </TooltipTrigger>
            <TooltipContent side="right">All Agents</TooltipContent>
          </Tooltip>

          <div className="w-5 h-px bg-border my-1" />

          {agentStore.enabledAgents.map((agent) => (
            <Tooltip key={agent.id}>
              <TooltipTrigger
                render={
                  <Button
                    data-testid="sidebar-agent-button"
                    data-agent-id={agent.id}
                    data-agent-type={agent.agentType ?? agent.type}
                    data-selected={String(sidebarSelectedAgentId === agent.id)}
                    size="icon"
                    className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-colors duration-150${
                      sidebarSelectedAgentId === agent.id
                        ? " bg-card/50 border-white/80 dark:border-white/20 ring-1 ring-black/10 hover:bg-white/30 dark:hover:bg-white/10"
                        : " bg-transparent border-none hover:bg-white/30 dark:hover:bg-white/10 shadow-none"
                    }`}
                    onClick={() => handleAgentSelect(agent.id)}
                  />
                }
              >
                <AgentAvatar agent={agent} className="w-4 h-4" />
              </TooltipTrigger>
              <TooltipContent side="right">{agent.name}</TooltipContent>
            </Tooltip>
          ))}

          <div className="flex-1" />
          <div className="w-5 h-px bg-border my-1" />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-colors duration-150 shadow-none${
                    spotlightStore.open
                      ? " bg-card/50 border-white/80 dark:border-white/20 ring-1 ring-black/10"
                      : " bg-transparent border-none hover:bg-white/30 dark:hover:bg-white/10"
                  }`}
                  title="Search"
                  onClick={() => spotlightStore.toggleSpotlight()}
                />
              }
            >
              <Icon icon="uil:search" className="w-4 h-4 text-foreground/80" />
            </TooltipTrigger>
            <TooltipContent side="right">Search</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  data-testid="window-sidebar-theme-toggle"
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-transparent border-none hover:bg-white/30 dark:hover:bg-white/10 shadow-none"
                  onClick={() => themeStore.cycleTheme()}
                />
              }
            >
              <span className="theme-icon-wrap">
                <Icon key={themeIcon} icon={themeIcon} className="theme-icon text-foreground/90" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">Theme · {themeModeLabel}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  data-testid="window-sidebar-toggle"
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-transparent border-none hover:bg-white/30 dark:hover:bg-white/10 shadow-none"
                  onClick={() => sidebarStore.toggleSidebar()}
                />
              }
            >
              <Icon
                icon={collapsed ? "lucide:panel-left-open" : "lucide:panel-left-close"}
                className="w-4 h-4 text-foreground/80"
              />
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand Sidebar" : "Collapse Sidebar"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  data-testid="app-settings-button"
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-transparent border-none hover:bg-white/30 dark:hover:bg-white/10 shadow-none"
                  title="Settings"
                  onClick={openSettings}
                />
              }
            >
              <Icon icon="uil:setting" className="w-4 h-4 text-foreground/80" />
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  data-testid="app-usage-button"
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-transparent border-none hover:bg-white/30 dark:hover:bg-white/10 shadow-none"
                  title="Usage"
                  onClick={() => void navigate({ to: "/usage" })}
                />
              }
            >
              <Icon icon="lucide:chart-column" className="w-4 h-4 text-foreground/80" />
            </TooltipTrigger>
            <TooltipContent side="right">Usage</TooltipContent>
          </Tooltip>
        </div>

        <div
          data-testid="window-sidebar-session-column"
          className={`window-sidebar-session-column window-no-drag-region flex flex-col w-0 flex-1 min-w-0 transition-[opacity,transform] duration-[var(--dc-motion-default)] ease-[var(--dc-ease-out-express)]${
            collapsed ? " pointer-events-none translate-x-1.5 opacity-0" : " translate-x-0 opacity-100"
          }`}
          aria-hidden={collapsed ? true : undefined}
          inert={collapsed ? true : undefined}
        >
          {!collapsed && (
            <div className="px-3 pt-2 pb-1 shrink-0">
              <WorkspaceSelector />
            </div>
          )}

          <div className="flex items-center justify-between px-3 h-10 shrink-0">
            <span className="text-sm font-medium text-foreground truncate">{selectedAgentName}</span>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-150${
                        sessionStore.groupMode === "project"
                          ? " text-foreground bg-accent/80"
                          : " text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                      onClick={() => sessionStore.toggleGroupMode()}
                    />
                  }
                >
                  <Icon icon="hugeicons:folder-kanban" className="w-4 h-4" />
                </TooltipTrigger>
                <TooltipContent>
                  {sessionStore.groupMode === "project" ? "Group by Date" : "Group by Project"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      data-testid="app-new-chat-button"
                      className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors duration-150"
                      onClick={handleNewChat}
                    />
                  }
                >
                  <Icon icon="uil:plus" className="w-4 h-4" />
                </TooltipTrigger>
                <TooltipContent>New Chat</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {!collapsed && (
            <div data-testid="window-sidebar-search" className="window-no-drag-region px-3 pb-2">
              <div className="relative">
                <Icon
                  icon="lucide:search"
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70"
                />
                <Input
                  value={sessionSearchQuery}
                  onChange={(e) => setSessionSearchQuery(e.target.value)}
                  className="h-8 rounded-xl border-0 bg-muted/60 pl-8 pr-8 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-primary/30"
                  placeholder="Search conversations..."
                  aria-label="Search conversations"
                  autoComplete="off"
                  spellCheck={false}
                />
                {sessionSearchQuery && (
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                    title="Clear"
                    aria-label="Clear"
                    onClick={() => setSessionSearchQuery("")}
                  >
                    <Icon icon="lucide:x" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {!sessionStore.hasLoadedInitialPage && sessionStore.loading && (
            <div className="flex flex-col gap-2 px-3 pb-3" data-testid="window-sidebar-loading-first-page">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`session-skeleton-${i}`} className="h-10 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          )}

          {sessionStore.hasLoadedInitialPage && pinnedSessions.length === 0 && filteredGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <Icon icon="lucide:message-square-plus" className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground/60">
                {sessionSearchQuery ? "No matching conversations" : "No conversations yet"}
              </p>
              <p className="text-xs text-muted-foreground/40 mt-1">
                {sessionSearchQuery ? "Try a different search term" : "Start a new chat to begin"}
              </p>
            </div>
          )}

          <div
            ref={sessionListRef}
            className="session-list flex-1 overflow-y-auto px-1.5"
            onScroll={handleSessionListScroll}
          >
            {pinnedSessions.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent/40 hover:text-foreground"
                  data-group-id="__pinned__"
                  aria-expanded={!isPinnedSectionCollapsed}
                  onClick={togglePinnedSection}
                >
                  <span className="shrink-0 size-6 flex items-center justify-center">
                    <Icon
                      icon={isPinnedSectionCollapsed ? "hugeicons:folder-01" : "hugeicons:folder-open"}
                      className="size-4"
                    />
                  </span>
                  <span className="truncate">Pinned</span>
                </button>
                {!isPinnedSectionCollapsed && (
                  <div className="space-y-0.5">
                    {pinnedSessions.map((session) => (
                      <WindowSideBarSessionItem
                        key={`pinned-${session.id}`}
                        session={session}
                        active={sessionStore.activeSessionId === session.id}
                        region="pinned"
                        heroHidden={pinFlightSessionId === session.id}
                        heroPlaceholder={pinFlightSessionId === session.id}
                        forcePinDocked={pinDockedSessionId === session.id}
                        pinFeedbackMode={pinFeedbackSessionId === session.id ? pinFeedbackMode : null}
                        searchQuery={sessionSearchQuery}
                        shortcutBadgeLabel={getShortcutBadge(session.id)}
                        shortcutBadgeVisible={hasShortcutBadge(session.id)}
                        onSelect={handleSessionClick}
                        onTogglePin={handleTogglePin}
                        onDelete={openDeleteDialog}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {filteredGroups.map((group) => (
              <div key={getGroupIdentifier(group)}>
                <button
                  type="button"
                  className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent/40 hover:text-foreground"
                  data-group-id={getGroupIdentifier(group)}
                  aria-expanded={!isGroupCollapsed(group)}
                  onClick={() => toggleGroup(group)}
                >
                  <span className="shrink-0 size-6 flex items-center justify-center">
                    <Icon
                      icon={isGroupCollapsed(group) ? "hugeicons:folder-01" : "hugeicons:folder-open"}
                      className="size-4"
                    />
                  </span>
                  <span className="truncate">{getGroupLabel(group)}</span>
                </button>
                {!isGroupCollapsed(group) && (
                  <div className="space-y-0.5">
                    {group.sessions.map((session) => (
                      <WindowSideBarSessionItem
                        key={session.id}
                        session={session}
                        active={sessionStore.activeSessionId === session.id}
                        region="grouped"
                        heroHidden={pinFlightSessionId === session.id}
                        heroPlaceholder={pinFlightSessionId === session.id}
                        forcePinDocked={pinDockedSessionId === session.id}
                        pinFeedbackMode={pinFeedbackSessionId === session.id ? pinFeedbackMode : null}
                        searchQuery={sessionSearchQuery}
                        shortcutBadgeLabel={getShortcutBadge(session.id)}
                        shortcutBadgeVisible={hasShortcutBadge(session.id)}
                        onSelect={handleSessionClick}
                        onTogglePin={handleTogglePin}
                        onDelete={openDeleteDialog}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sessionStore.loadingMore && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground/70">Loading...</div>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={deleteTargetSession !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetSession(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetSession(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
