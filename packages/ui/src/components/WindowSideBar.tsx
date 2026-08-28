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
import { useAgentStore } from "#/stores/ui/agent";
import { useSessionStore, getHasActiveSession, type SessionGroup, type UISession } from "#/stores/ui/session";
import { useSpotlightStore } from "#/stores/ui/spotlight";
import WindowSideBarSessionItem from "./WindowSideBarSessionItem";
import WorkspaceSelector from "./WorkspaceSelector";
import ThreadSidebarList from "./threads/ThreadSidebarList";
import { useSidebarStore } from "#/stores/ui/sidebar";
import { useThreadSidebarStore } from "#/stores/ui/threadSidebar";
import { useThemeStore } from "#/stores/theme";

type PinFeedbackMode = "pinning" | "unpinning";
type ShortcutPlatform = "mac" | "other";

const PIN_FEEDBACK_DURATION_MS: Record<PinFeedbackMode, number> = { pinning: 560, unpinning: 460 };
const getPinFeedbackMode = (nextPinned: boolean): PinFeedbackMode => (nextPinned ? "pinning" : "unpinning");

const deviceClient = createDeviceClient();

/**
 * The left sidebar. Two modes:
 *  - **Thread sidebar (experiment on)**: a t3code-style column with a
 *    search input, agent switcher, an Active row, and a Settled list. The
 *    bottom utility bar (search / theme / collapse / settings / usage)
 *    sits in a horizontal row at the very bottom of the column.
 *  - **Original (experiment off)**: the agent / project / date history
 *    grouping with a search and grouped rows, plus the same horizontal
 *    utility bar pinned to the bottom.
 *
 * In both modes, the dedicated left icon rail is gone — agent chips, the
 * project selector, etc. live inside the column itself. The icon rail's
 * bottom utility icons are now a horizontal bar at the bottom of the
 * sidebar.
 */
export default function WindowSideBar() {
  const navigate = useNavigate();
  const agentStore = useAgentStore();
  const sessionStore = useSessionStore();
  const sidebarStore = useSidebarStore();
  const spotlightStore = useSpotlightStore();
  const themeStore = useThemeStore();
  const threadSidebar = useThreadSidebarStore();

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

  const sessionListRef = useRef<HTMLDivElement | null>(null);
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

  // The original (non-thread) sidebar still scopes by selected agent.
  const sidebarSelectedAgentId = useMemo(() => {
    const hasActive = getHasActiveSession();
    const activeAgentId = sessionStore.activeSessionSummary?.agentId?.trim();
    if (hasActive && activeAgentId) return activeAgentId;
    const explicit = typeof agentStore.selectedAgentId === "string" ? agentStore.selectedAgentId.trim() : "";
    return explicit || null;
  }, [agentStore.selectedAgentId, sessionStore.activeSessionSummary]);

  const selectedAgentName = useMemo(() => {
    if (sidebarSelectedAgentId === null) return "All Agents";
    return agentStore.enabledAgents.find((agent) => agent.id === sidebarSelectedAgentId)?.name ?? "All Agents";
  }, [sidebarSelectedAgentId, agentStore.enabledAgents]);

  const normalizedSearchQuery = sessionSearchQuery.trim().toLowerCase();
  const matchesSessionSearch = useCallback(
    (session: UISession) => {
      if (!normalizedSearchQuery) return true;
      return session.title.toLowerCase().includes(normalizedSearchQuery);
    },
    [normalizedSearchQuery],
  );

  const pinnedSessions = useMemo(
    () => sessionStore.getPinnedSessions(sidebarSelectedAgentId).filter(matchesSessionSearch),
    [sessionStore, sidebarSelectedAgentId, matchesSessionSearch],
  );

  const filteredGroups = useMemo(
    () =>
      sessionStore.getFilteredGroups(sidebarSelectedAgentId).flatMap((group: SessionGroup) => {
        const sessions = group.sessions.filter(matchesSessionSearch);
        return sessions.length > 0 ? [{ ...group, sessions }] : [];
      }),
    [sessionStore, sidebarSelectedAgentId, matchesSessionSearch],
  );

  const getGroupIdentifier = useCallback((group: SessionGroup) => group.id, []);
  const getGroupLabel = (group: SessionGroup) => group.labelKey ?? group.label;
  const isGroupCollapsed = useCallback(
    (group: SessionGroup) => collapsedGroupIds.has(getGroupIdentifier(group)),
    [collapsedGroupIds, getGroupIdentifier],
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

  const openUsage = useCallback(() => {
    void navigate({ to: "/usage" });
  }, [navigate]);

  const togglePinnedSection = useCallback(() => {
    setIsPinnedSectionCollapsed((prev) => !prev);
  }, []);

  const toggleGroup = useCallback(
    (group: SessionGroup) => {
      const groupId = getGroupIdentifier(group);
      setCollapsedGroupIds((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) next.delete(groupId);
        else next.add(groupId);
        return next;
      });
    },
    [getGroupIdentifier],
  );

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
    const sessionsList: UISession[] = [];
    if (!isPinnedSectionCollapsed) sessionsList.push(...pinnedSessions);
    for (const group of filteredGroups) {
      if (!isGroupCollapsed(group)) sessionsList.push(...group.sessions);
    }
    return sessionsList.filter((session) => session.id !== pinFlightSessionId).slice(0, 10);
  }, [collapsed, isPinnedSectionCollapsed, pinnedSessions, filteredGroups, isGroupCollapsed, pinFlightSessionId]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const modKey = shortcutPlatform === "mac" ? "Meta" : "Alt";
      const isModPressed = shortcutPlatform === "mac" ? event.metaKey : event.altKey;
      if (event.key === modKey && !event.repeat) {
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
        if (shortcutBadgeTimerRef.current) {
          window.clearTimeout(shortcutBadgeTimerRef.current);
          shortcutBadgeTimerRef.current = null;
        }
      }
    };
    const handleBlur = () => {
      setShowShortcutBadges(false);
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

  const renderBottomUtilityBar = () => (
    <div
      data-testid="window-sidebar-bottom-bar"
      className="window-no-drag-region flex shrink-0 items-center justify-around border-t border-border/40 px-1 py-1.5"
    >
      {/* With the thread sidebar enabled the inline search field is the single
          search affordance; the Spotlight palette stays reachable via its
          keyboard shortcut (docs/features/thread-sidebar-t3-parity). */}
      {!threadSidebar.enabled && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
                  spotlightStore.open
                    ? "bg-accent/60 text-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                }`}
                title="Search"
                onClick={() => spotlightStore.toggleSpotlight()}
              />
            }
          >
            <Icon icon="uil:search" className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent side="top">Search</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              data-testid="window-sidebar-theme-toggle"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent/40 hover:text-foreground"
              onClick={() => themeStore.cycleTheme()}
            />
          }
        >
          <span className="theme-icon-wrap">
            <Icon key={themeIcon} icon={themeIcon} className="theme-icon" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Theme · {themeModeLabel}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              data-testid="window-sidebar-toggle"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent/40 hover:text-foreground"
              onClick={() => sidebarStore.toggleSidebar()}
            />
          }
        >
          <Icon icon={collapsed ? "lucide:panel-left-open" : "lucide:panel-left-close"} className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="top">{collapsed ? "Expand Sidebar" : "Collapse Sidebar"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              data-testid="app-settings-button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent/40 hover:text-foreground"
              title="Settings"
              onClick={openSettings}
            />
          }
        >
          <Icon icon="uil:setting" className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="top">Settings</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              data-testid="app-usage-button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent/40 hover:text-foreground"
              title="Usage"
              onClick={openUsage}
            />
          }
        >
          <Icon icon="lucide:chart-column" className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="top">Usage</TooltipContent>
      </Tooltip>
    </div>
  );

  return (
    <>
      <div
        data-testid="window-sidebar"
        className={`window-sidebar-shell flex flex-col h-full shrink-0 overflow-hidden bg-sidebar window-drag-region${
          collapsed ? " w-12" : " w-[288px]"
        }`}
      >
        <div
          data-testid="window-sidebar-session-column"
          className={`window-sidebar-session-column window-no-drag-region flex flex-1 flex-col min-w-0 transition-[opacity,transform] duration-[var(--dc-motion-default)] ease-[var(--dc-ease-out-express)]${
            collapsed ? " pointer-events-none translate-x-1.5 opacity-0" : " translate-x-0 opacity-100"
          }`}
          aria-hidden={collapsed ? true : undefined}
          inert={collapsed ? true : undefined}
        >
          {threadSidebar.enabled ? (
            <ThreadSidebarList />
          ) : (
            <>
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
            </>
          )}
        </div>

        {!collapsed && renderBottomUtilityBar()}
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
