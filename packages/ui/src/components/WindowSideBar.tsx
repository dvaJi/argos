import { useState, useEffect, useRef, type RefObject, type ReactNode } from "react";
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
const PIN_FEEDBACK_DURATION_MS: Record<PinFeedbackMode, number> = {
  pinning: 560,
  unpinning: 460,
};
const getPinFeedbackMode = (nextPinned: boolean): PinFeedbackMode => (nextPinned ? "pinning" : "unpinning");
const getThemeIcon = (themeMode: string) => {
  switch (themeMode) {
    case "light":
      return "line-md:moon-to-sunny-outline-transition";
    case "dark":
      return "line-md:sunny-outline-to-moon-transition";
    default:
      return "line-md:monitor";
  }
};
const getThemeModeLabel = (themeMode: string) => {
  switch (themeMode) {
    case "light":
      return "Light";
    case "dark":
      return "Dark";
    default:
      return "System";
  }
};
const getShortcutBadgeLabelForSession = (platform: ShortcutPlatform, sessionId: string, sessions: UISession[]) => {
  const index = sessions.findIndex((s) => s.id === sessionId);
  if (index < 0 || index >= 10) return null;
  const digit = index === 9 ? "0" : String(index + 1);
  return platform === "mac" ? `⌘${digit}` : `Alt+${digit}`;
};
function filterSessionGroupsBySearch(groups: SessionGroup[], matches: (session: UISession) => boolean): SessionGroup[] {
  return groups.flatMap((group: SessionGroup) => {
    const sessions = group.sessions.filter(matches);
    return sessions.length > 0
      ? [
          {
            ...group,
            sessions,
          },
        ]
      : [];
  });
}
function collectVisibleShortcutSessions(input: {
  collapsed: boolean;
  pinnedSessions: UISession[];
  isPinnedSectionCollapsed: boolean;
  filteredGroups: SessionGroup[];
  isGroupCollapsed: (group: SessionGroup) => boolean;
  pinFlightSessionId: string | null;
}): UISession[] {
  const { collapsed, pinnedSessions, isPinnedSectionCollapsed, filteredGroups, isGroupCollapsed, pinFlightSessionId } =
    input;
  if (collapsed) return [];
  const sessionsList: UISession[] = [];
  if (!isPinnedSectionCollapsed) sessionsList.push(...pinnedSessions);
  for (const group of filteredGroups) {
    if (!isGroupCollapsed(group)) sessionsList.push(...group.sessions);
  }
  return sessionsList.filter((session) => session.id !== pinFlightSessionId).slice(0, 10);
}
const createShortcutKeyHandlers = (input: {
  shortcutPlatform: ShortcutPlatform;
  collapsed: boolean;
  visibleShortcutSessions: UISession[];
  onSelectSession: (sessionId: string) => void;
  setShowShortcutBadges: (show: boolean) => void;
  shortcutBadgeTimerRef: RefObject<number | null>;
}) => {
  const {
    shortcutPlatform,
    collapsed,
    visibleShortcutSessions,
    onSelectSession,
    setShowShortcutBadges,
    shortcutBadgeTimerRef,
  } = input;
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
      if (targetSession) void onSelectSession(targetSession.id);
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
  return { handleKeydown, handleKeyup, handleBlur };
};
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
  const themeIcon = getThemeIcon(themeStore.themeMode);
  const themeModeLabel = getThemeModeLabel(themeStore.themeMode);

  // The original (non-thread) sidebar still scopes by selected agent.
  const sidebarSelectedAgentId = (() => {
    const hasActive = getHasActiveSession();
    const activeAgentId = sessionStore.activeSessionSummary?.agentId?.trim();
    if (hasActive && activeAgentId) return activeAgentId;
    const explicit = typeof agentStore.selectedAgentId === "string" ? agentStore.selectedAgentId.trim() : "";
    return explicit || null;
  })();
  const selectedAgentName = (() => {
    if (sidebarSelectedAgentId === null) return "All Agents";
    return agentStore.enabledAgents.find((agent) => agent.id === sidebarSelectedAgentId)?.name ?? "All Agents";
  })();
  const normalizedSearchQuery = sessionSearchQuery.trim().toLowerCase();
  const matchesSessionSearch = (session: UISession) => {
    if (!normalizedSearchQuery) return true;
    return session.title.toLowerCase().includes(normalizedSearchQuery);
  };
  const pinnedSessions = sessionStore.getPinnedSessions(sidebarSelectedAgentId).filter(matchesSessionSearch);
  const filteredGroups = filterSessionGroupsBySearch(
    sessionStore.getFilteredGroups(sidebarSelectedAgentId),
    matchesSessionSearch,
  );
  const getGroupIdentifier = (group: SessionGroup) => group.id;
  const getGroupLabel = (group: SessionGroup) => group.labelKey ?? group.label;
  const isGroupCollapsed = (group: SessionGroup) => collapsedGroupIds.has(getGroupIdentifier(group));
  const handleSessionClick = (session: { id: string }) => {
    void sessionStore.selectSession(session.id);
  };
  const handleNewChat = () => {
    void sessionStore.startNewConversation({
      refresh: true,
    });
  };
  const openSettings = () => {
    void navigate({
      to: "/settings/overview",
    });
  };
  const openUsage = () => {
    void navigate({
      to: "/usage",
    });
  };
  const togglePinnedSection = () => {
    setIsPinnedSectionCollapsed((prev) => !prev);
  };
  const toggleGroup = (group: SessionGroup) => {
    const groupId = getGroupIdentifier(group);
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  const handleTogglePin = async (session: UISession) => {
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
  };
  const openDeleteDialog = (session: UISession) => {
    setDeleteTargetSession(session);
  };
  const handleDeleteConfirm = async () => {
    if (!deleteTargetSession) return;
    try {
      await sessionStore.deleteSession(deleteTargetSession.id);
    } catch {}
    setDeleteTargetSession(null);
  };
  const handleSessionListScroll = () => {
    if (sessionListScrollFrameRef.current !== null) return;
    sessionListScrollFrameRef.current = window.requestAnimationFrame(() => {
      sessionListScrollFrameRef.current = null;
      const listElement = sessionListRef.current;
      if (!listElement || sessionStore.loadingMore || !sessionStore.hasMore) return;
      const distanceToBottom = listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight;
      if (distanceToBottom <= 96) void sessionStore.loadNextPage();
    });
  };
  const visibleShortcutSessions = collectVisibleShortcutSessions({
    collapsed,
    pinnedSessions,
    isPinnedSectionCollapsed,
    filteredGroups,
    isGroupCollapsed,
    pinFlightSessionId,
  });
  useEffect(() => {
    const { handleKeydown, handleKeyup, handleBlur } = createShortcutKeyHandlers({
      shortcutPlatform,
      collapsed,
      visibleShortcutSessions,
      onSelectSession: (sessionId) => sessionStore.selectSession(sessionId),
      setShowShortcutBadges: setShowShortcutBadges,
      shortcutBadgeTimerRef,
    });
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("keyup", handleKeyup);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("keyup", handleKeyup);
      window.removeEventListener("blur", handleBlur);
    };
  }, [
    shortcutPlatform,
    collapsed,
    visibleShortcutSessions,
    sessionStore,
    setShowShortcutBadges,
    shortcutBadgeTimerRef,
  ]);
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
    showShortcutBadges ? getShortcutBadgeLabelForSession(shortcutPlatform, sessionId, visibleShortcutSessions) : null;
  const hasShortcutBadge = (sessionId: string) =>
    showShortcutBadges && visibleShortcutSessions.some((s) => s.id === sessionId);
  return (
    <>
      <div
        data-testid="window-sidebar"
        className={`window-sidebar-shell flex flex-col h-full shrink-0 overflow-hidden bg-sidebar window-drag-region${collapsed ? " w-12" : " w-[288px]"}`}
      >
        <div
          data-testid="window-sidebar-session-column"
          className={`window-sidebar-session-column window-no-drag-region flex flex-1 flex-col min-w-0 transition-[opacity,transform] duration-[var(--dc-motion-default)] ease-[var(--dc-ease-out-express)]${collapsed ? " pointer-events-none translate-x-1.5 opacity-0" : " translate-x-0 opacity-100"}`}
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

              <SidebarSessionToolbar
                agentName={selectedAgentName}
                groupMode={sessionStore.groupMode}
                onToggleGroupMode={() => sessionStore.toggleGroupMode()}
                onNewChat={handleNewChat}
              />

              {!collapsed && <SidebarSearchBox query={sessionSearchQuery} onQueryChange={setSessionSearchQuery} />}

              {!sessionStore.hasLoadedInitialPage && sessionStore.loading && <SidebarFirstPageSkeleton />}

              {sessionStore.hasLoadedInitialPage && pinnedSessions.length === 0 && filteredGroups.length === 0 && (
                <SidebarEmptyState hasQuery={Boolean(sessionSearchQuery)} />
              )}

              <div
                ref={sessionListRef}
                className="session-list flex-1 overflow-y-auto px-1.5"
                onScroll={handleSessionListScroll}
              >
                {pinnedSessions.length > 0 && (
                  <SessionGroupSection
                    groupId="__pinned__"
                    label="Pinned"
                    wrapperClassName="pt-2"
                    isCollapsed={isPinnedSectionCollapsed}
                    onToggle={togglePinnedSection}
                  >
                    <SidebarSessionItems
                      sessions={pinnedSessions}
                      region="pinned"
                      activeSessionId={sessionStore.activeSessionId}
                      pinFlightSessionId={pinFlightSessionId}
                      pinDockedSessionId={pinDockedSessionId}
                      pinFeedbackSessionId={pinFeedbackSessionId}
                      pinFeedbackMode={pinFeedbackMode}
                      searchQuery={sessionSearchQuery}
                      getShortcutBadge={getShortcutBadge}
                      hasShortcutBadge={hasShortcutBadge}
                      onSelect={handleSessionClick}
                      onTogglePin={handleTogglePin}
                      onDelete={openDeleteDialog}
                    />
                  </SessionGroupSection>
                )}

                {filteredGroups.map((group) => (
                  <SessionGroupSection
                    key={getGroupIdentifier(group)}
                    groupId={getGroupIdentifier(group)}
                    label={getGroupLabel(group)}
                    buttonClassName="mt-2 "
                    isCollapsed={isGroupCollapsed(group)}
                    onToggle={() => toggleGroup(group)}
                  >
                    <SidebarSessionItems
                      sessions={group.sessions}
                      region="grouped"
                      activeSessionId={sessionStore.activeSessionId}
                      pinFlightSessionId={pinFlightSessionId}
                      pinDockedSessionId={pinDockedSessionId}
                      pinFeedbackSessionId={pinFeedbackSessionId}
                      pinFeedbackMode={pinFeedbackMode}
                      searchQuery={sessionSearchQuery}
                      getShortcutBadge={getShortcutBadge}
                      hasShortcutBadge={hasShortcutBadge}
                      onSelect={handleSessionClick}
                      onTogglePin={handleTogglePin}
                      onDelete={openDeleteDialog}
                    />
                  </SessionGroupSection>
                ))}

                {sessionStore.loadingMore && (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground/70">Loading...</div>
                )}
              </div>
            </>
          )}
        </div>

        {!collapsed && (
          <SidebarBottomUtilityBar
            showSearchButton={!threadSidebar.enabled}
            spotlightOpen={spotlightStore.open}
            onToggleSpotlight={() => spotlightStore.toggleSpotlight()}
            themeIcon={themeIcon}
            themeModeLabel={themeModeLabel}
            onCycleTheme={() => themeStore.cycleTheme()}
            collapsed={collapsed}
            onToggleSidebar={() => sidebarStore.toggleSidebar()}
            onOpenSettings={openSettings}
            onOpenUsage={openUsage}
          />
        )}
      </div>

      <DeleteConversationDialog
        open={deleteTargetSession !== null}
        onCancel={() => setDeleteTargetSession(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </>
  );
}
interface SidebarSessionToolbarProps {
  agentName: string;
  groupMode: string;
  onToggleGroupMode: () => void;
  onNewChat: () => void;
}

/** Agent name with the group-mode toggle and new-chat buttons. */
function SidebarSessionToolbar({ agentName, groupMode, onToggleGroupMode, onNewChat }: SidebarSessionToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 h-10 shrink-0">
      <span className="text-sm font-medium text-foreground truncate">{agentName}</span>
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-150${groupMode === "project" ? " text-foreground bg-accent/80" : " text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}
                onClick={onToggleGroupMode}
              />
            }
          >
            <Icon icon="hugeicons:folder-kanban" className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>{groupMode === "project" ? "Group by Date" : "Group by Project"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                data-testid="app-new-chat-button"
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors duration-150"
                onClick={onNewChat}
              />
            }
          >
            <Icon icon="uil:plus" className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>New Chat</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
interface SidebarSearchBoxProps {
  query: string;
  onQueryChange: (query: string) => void;
}

/** Conversation search field with a clear button. */
function SidebarSearchBox({ query, onQueryChange }: SidebarSearchBoxProps) {
  return (
    <div data-testid="window-sidebar-search" className="window-no-drag-region px-3 pb-2">
      <div className="relative">
        <Icon
          icon="lucide:search"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70"
        />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="h-8 rounded-xl border-0 bg-muted/60 pl-8 pr-8 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-primary/30"
          placeholder="Search conversations..."
          aria-label="Search conversations"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            title="Clear"
            aria-label="Clear"
            onClick={() => onQueryChange("")}
          >
            <Icon icon="lucide:x" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Skeleton rows shown while the first session page loads. */
function SidebarFirstPageSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-3 pb-3" data-testid="window-sidebar-loading-first-page">
      {Array.from({
        length: 6,
      }).map((_, i) => (
        <div key={`session-skeleton-${i}`} className="h-10 rounded-lg bg-muted/50 animate-pulse" />
      ))}
    </div>
  );
}
function SidebarEmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center">
      <Icon icon="lucide:message-square-plus" className="w-8 h-8 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground/60">
        {hasQuery ? "No matching conversations" : "No conversations yet"}
      </p>
      <p className="text-xs text-muted-foreground/40 mt-1">
        {hasQuery ? "Try a different search term" : "Start a new chat to begin"}
      </p>
    </div>
  );
}
interface SessionGroupSectionProps {
  groupId: string;
  label: string;
  wrapperClassName?: string;
  buttonClassName?: string;
  isCollapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Collapsible folder-style section: header toggle plus session rows. */
function SessionGroupSection({
  groupId,
  label,
  wrapperClassName,
  buttonClassName,
  isCollapsed,
  onToggle,
  children,
}: SessionGroupSectionProps) {
  return (
    <div className={wrapperClassName}>
      <button
        type="button"
        className={`${buttonClassName ?? ""}flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent/40 hover:text-foreground`}
        data-group-id={groupId}
        aria-expanded={!isCollapsed}
        onClick={onToggle}
      >
        <span className="shrink-0 size-6 flex items-center justify-center">
          <Icon icon={isCollapsed ? "hugeicons:folder-01" : "hugeicons:folder-open"} className="size-4" />
        </span>
        <span className="truncate">{label}</span>
      </button>
      {!isCollapsed && children}
    </div>
  );
}
interface SidebarSessionItemsProps {
  sessions: UISession[];
  region: "pinned" | "grouped";
  activeSessionId: string | null;
  pinFlightSessionId: string | null;
  pinDockedSessionId: string | null;
  pinFeedbackSessionId: string | null;
  pinFeedbackMode: PinFeedbackMode | null;
  searchQuery: string;
  getShortcutBadge: (sessionId: string) => string | null;
  hasShortcutBadge: (sessionId: string) => boolean;
  onSelect: (session: { id: string }) => void;
  onTogglePin: (session: UISession) => void;
  onDelete: (session: UISession) => void;
}

/** Maps sessions onto WindowSideBarSessionItem rows. */
function SidebarSessionItems({
  sessions,
  region,
  activeSessionId,
  pinFlightSessionId,
  pinDockedSessionId,
  pinFeedbackSessionId,
  pinFeedbackMode,
  searchQuery,
  getShortcutBadge,
  hasShortcutBadge,
  onSelect,
  onTogglePin,
  onDelete,
}: SidebarSessionItemsProps) {
  return (
    <div className="space-y-0.5">
      {sessions.map((session) => (
        <WindowSideBarSessionItem
          key={region === "pinned" ? `pinned-${session.id}` : session.id}
          session={session}
          active={activeSessionId === session.id}
          region={region}
          heroHidden={pinFlightSessionId === session.id}
          heroPlaceholder={pinFlightSessionId === session.id}
          forcePinDocked={pinDockedSessionId === session.id}
          pinFeedbackMode={pinFeedbackSessionId === session.id ? pinFeedbackMode : null}
          searchQuery={searchQuery}
          shortcutBadgeLabel={getShortcutBadge(session.id)}
          shortcutBadgeVisible={hasShortcutBadge(session.id)}
          onSelect={onSelect}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
interface SidebarBottomUtilityBarProps {
  showSearchButton: boolean;
  spotlightOpen: boolean;
  onToggleSpotlight: () => void;
  themeIcon: string;
  themeModeLabel: string;
  onCycleTheme: () => void;
  collapsed: boolean;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onOpenUsage: () => void;
}

/** Horizontal utility bar pinned to the bottom of the sidebar. */
function SidebarBottomUtilityBar(props: SidebarBottomUtilityBarProps) {
  const {
    showSearchButton,
    spotlightOpen,
    onToggleSpotlight,
    themeIcon,
    themeModeLabel,
    onCycleTheme,
    collapsed,
    onToggleSidebar,
    onOpenSettings,
    onOpenUsage,
  } = props;
  return (
    <div
      data-testid="window-sidebar-bottom-bar"
      className="window-no-drag-region flex shrink-0 items-center justify-around border-t border-border/40 px-1 py-1.5"
    >
      {/* With the thread sidebar enabled the inline search field is the single
          search affordance; the Spotlight palette stays reachable via its
          keyboard shortcut (docs/features/thread-sidebar-t3-parity). */}
      {showSearchButton && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${spotlightOpen ? "bg-accent/60 text-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"}`}
                title="Search"
                onClick={onToggleSpotlight}
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
              onClick={onCycleTheme}
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
              onClick={onToggleSidebar}
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
              onClick={onOpenSettings}
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
              onClick={onOpenUsage}
            />
          }
        >
          <Icon icon="lucide:chart-column" className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="top">Usage</TooltipContent>
      </Tooltip>
    </div>
  );
}
interface DeleteConversationDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation dialog for deleting a conversation. */
function DeleteConversationDialog({ open, onCancel, onConfirm }: DeleteConversationDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onCancel();
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
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
