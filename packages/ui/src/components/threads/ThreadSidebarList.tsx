import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useSelector } from "@tanstack/react-store";
import { useSessionStore, type UISession } from "#/stores/ui/session";
import { Input } from "#shadcn/components/ui/input";
import {
  isSessionWoke,
  markThreadOpened,
  notifySessionDeleted,
  setSettledShelfExpanded,
  setSnoozedShelfExpanded,
  settleSession,
  snoozeSession,
  threadSidebarStore,
  unsettleSession,
  unsnoozeSession,
} from "#/stores/ui/threadSidebar";
import { filterByTitle, partitionThreads } from "./threadSidebarLogic";
import ThreadSection from "./ThreadSection";
import ThreadSidebarRow from "./ThreadSidebarRow";
import DeleteConversationDialog from "../DeleteConversationDialog";
import SidebarFirstPageSkeleton from "../SidebarFirstPageSkeleton";

/**
 * t3code-style thread sidebar (v2 parity rework —
 * docs/features/thread-sidebar-t3-parity; fixes in
 * docs/issues/thread-sidebar-fixes, polish in
 * docs/features/thread-sidebar-polish).
 *
 *   ┌───────────────────────────────┐
 *   │ [🔎 Search           ×] [✎]   │  ← clearable search + New-thread
 *   │ PINNED                        │
 *   │   Title              3d       │
 *   │ ACTIVE                        │
 *   │   Title   [●Working 12s]  now │
 *   │   Title   [◉Pending approval] │
 *   │   Title                  5m   │
 *   │ SNOOZED (2)             ▸     │  ← collapsible shelf (persisted)
 *   │   Title        waking in 58m  │
 *   │ SETTLED (14)            ▾     │  ← collapsible shelf, paged
 *   │ • Title                3d     │  ← selected row highlighted
 *   │   Title                8d     │
 *   │   Show more                   │
 *   └───────────────────────────────┘
 *
 * Active is the default lifecycle state: every regular, non-draft,
 * non-pinned, non-snoozed, non-settled thread — newest first — with per-row
 * status pills (pending approval > failed > working > unseen completion).
 * Settling is an explicit user action (hover check button / context menu);
 * working threads can never render as Settled. The currently open session is
 * never hidden by snooze: it stays anchored in Active.
 */

const SETTLED_PAGE_SIZE = 10;
/** Quiet rows share a coarse clock bucket so memoized rows skip per-second renders. */
const NOW_BUCKET_MS = 15_000;

interface ThreadSidebarListProps {
  /** Alt/⌘+1..9 badge label for a session id, or null while badges are hidden. */
  getShortcutBadge?: (sessionId: string) => string | null;
}

export default function ThreadSidebarList({ getShortcutBadge }: ThreadSidebarListProps) {
  const sessionStore = useSessionStore();
  // Per-field subscriptions: unlike a whole-store selector, unrelated store
  // updates do not re-render the list.
  const workingSinceById = useSelector(threadSidebarStore, (s) => s.workingSinceById);
  const settledAtById = useSelector(threadSidebarStore, (s) => s.settledAtById);
  const snoozedUntilById = useSelector(threadSidebarStore, (s) => s.snoozedUntilById);
  const settledShelfExpanded = useSelector(threadSidebarStore, (s) => s.settledShelfExpanded);
  const snoozedShelfExpanded = useSelector(threadSidebarStore, (s) => s.snoozedShelfExpanded);

  const [searchQuery, setSearchQuery] = useState("");
  const [navIndex, setNavIndex] = useState(-1);
  const [settledPageCount, setSettledPageCount] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<UISession | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const actionErrorTimerRef = useRef<number | null>(null);

  // Live tick for working durations / wake countdowns: only run while there is
  // something live to show (cheap no-op otherwise).
  const hasLiveRows = useMemo(() => {
    const anyWorking = sessionStore.sessions.some((session) => session.status === "working");
    const anySnoozed = Object.values(snoozedUntilById).some((until) => until > now);
    return anyWorking || anySnoozed;
  }, [sessionStore.sessions, snoozedUntilById, now]);
  useEffect(() => {
    if (!hasLiveRows) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [hasLiveRows]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
      if (actionErrorTimerRef.current !== null) window.clearTimeout(actionErrorTimerRef.current);
    };
  }, []);

  const reportActionError = useCallback((message: string) => {
    setActionError(message);
    if (actionErrorTimerRef.current !== null) window.clearTimeout(actionErrorTimerRef.current);
    actionErrorTimerRef.current = window.setTimeout(() => {
      setActionError(null);
      actionErrorTimerRef.current = null;
    }, 4000);
  }, []);

  const sections = useMemo(
    () =>
      partitionThreads(sessionStore.sessions, {
        settledAtById,
        snoozedUntilById,
        now,
        activeSessionId: sessionStore.activeSessionId,
      }),
    [sessionStore.sessions, sessionStore.activeSessionId, settledAtById, snoozedUntilById, now],
  );

  const searching = searchQuery.trim().length > 0;
  const filtered = useMemo(() => {
    if (!searching) return sections;
    const byTitle = (rows: UISession[]) => filterByTitle(rows, searchQuery);
    return {
      pinned: byTitle(sections.pinned),
      active: byTitle(sections.active),
      snoozed: byTitle(sections.snoozed),
      settled: byTitle(sections.settled),
    };
  }, [sections, searching, searchQuery]);

  // While searching, matched rows surface even from collapsed shelves.
  const snoozedExpanded = searching || snoozedShelfExpanded;
  const settledExpanded = searching || settledShelfExpanded;
  const visibleSettledCount = searching ? filtered.settled.length : settledPageCount * SETTLED_PAGE_SIZE;
  const visibleSettled = useMemo(
    () => filtered.settled.slice(0, visibleSettledCount),
    [filtered.settled, visibleSettledCount],
  );

  // Flat result order drives keyboard navigation — rendered rows only, so
  // hidden rows can never be selected invisibly.
  const flatResults = useMemo(
    () => [...filtered.pinned, ...filtered.active, ...(snoozedExpanded ? filtered.snoozed : []), ...visibleSettled],
    [filtered.pinned, filtered.active, filtered.snoozed, visibleSettled, snoozedExpanded],
  );
  const navIndexById = useMemo(() => {
    const map = new Map<string, number>();
    flatResults.forEach((session, index) => map.set(session.id, index));
    return map;
  }, [flatResults]);

  useEffect(() => {
    if (navIndex < 0) return;
    listRef.current?.querySelector('[data-nav-selected="true"]')?.scrollIntoView({
      block: "nearest",
    });
  }, [navIndex]);

  // Pagination parity with the original sidebar: load the next session page
  // when the list is scrolled near the bottom.
  const handleListScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const element = listRef.current;
      if (!element || sessionStore.loadingMore || !sessionStore.hasMore) return;
      const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distanceToBottom <= 96) void sessionStore.loadNextPage();
    });
  }, [sessionStore]);

  const applySearchQuery = (value: string) => {
    setSearchQuery(value);
    // Reset nav + paging inline: a reset effect would be a synchronous
    // set-state-in-effect (react-doctor).
    setNavIndex(-1);
    setSettledPageCount(1);
  };

  const handleSelect = useCallback(
    (session: UISession) => {
      markThreadOpened(session.id);
      void sessionStore.selectSession(session.id);
    },
    [sessionStore],
  );
  const handleNewChat = useCallback(() => {
    void sessionStore.startNewConversation({
      refresh: true,
    });
  }, [sessionStore]);
  const handleRename = useCallback(
    async (session: UISession, title: string) => {
      try {
        await sessionStore.renameSession(session.id, title);
      } catch {
        reportActionError(`Failed to rename "${session.title || "Untitled session"}".`);
      }
    },
    [sessionStore, reportActionError],
  );
  const handleDelete = useCallback(
    async (session: UISession) => {
      try {
        await sessionStore.deleteSession(session.id);
        notifySessionDeleted(session.id);
      } catch {
        reportActionError(`Failed to delete "${session.title || "Untitled session"}".`);
      }
    },
    [sessionStore, reportActionError],
  );
  const handleDeleteConfirm = useCallback(() => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (target) void handleDelete(target);
  }, [deleteTarget, handleDelete]);

  // Stable row callbacks — memoized rows compare props shallowly.
  const onSettle = useCallback((session: UISession) => settleSession(session.id), []);
  const onUnsettle = useCallback((session: UISession) => unsettleSession(session.id), []);
  const onSnooze = useCallback((session: UISession, durationMs: number) => snoozeSession(session.id, durationMs), []);
  const onUnsnooze = useCallback((session: UISession) => unsnoozeSession(session.id), []);
  const onTogglePin = useCallback(
    (session: UISession) => {
      void sessionStore.toggleSessionPinned(session.id, !session.isPinned);
    },
    [sessionStore],
  );
  const onRequestDelete = useCallback((session: UISession) => setDeleteTarget(session), []);

  const renderRow = (session: UISession, variant: "active" | "settled" | "snoozed") => {
    const snoozedUntil = snoozedUntilById[session.id];
    const workingSince = workingSinceById[session.id];
    const isLive =
      (variant === "active" && session.status === "working" && typeof workingSince === "number") ||
      (variant === "snoozed" && typeof snoozedUntil === "number" && snoozedUntil > now);
    return (
      <ThreadSidebarRow
        session={session}
        variant={variant}
        isSelected={sessionStore.activeSessionId === session.id}
        isNavSelected={searching && navIndexById.get(session.id) === navIndex}
        query={searchQuery}
        now={isLive ? now : Math.floor(now / NOW_BUCKET_MS) * NOW_BUCKET_MS}
        workingSince={workingSince}
        snoozedUntil={snoozedUntil}
        settledAt={settledAtById[session.id]}
        isWoke={variant === "snoozed" && isSessionWoke(session.id, now)}
        shortcutBadge={getShortcutBadge?.(session.id) ?? null}
        onSelect={handleSelect}
        onSettle={onSettle}
        onUnsettle={onUnsettle}
        onTogglePin={onTogglePin}
        onSnooze={onSnooze}
        onUnsnooze={onUnsnooze}
        onRename={handleRename}
        onRequestDelete={onRequestDelete}
      />
    );
  };
  const renderRows = (rows: UISession[], variant: "active" | "settled" | "snoozed") => (
    <ul className="flex flex-col gap-px">
      {rows.map((session) => (
        <li key={session.id}>{renderRow(session, variant)}</li>
      ))}
    </ul>
  );

  const hasAnyRows =
    filtered.pinned.length + filtered.active.length + filtered.snoozed.length + filtered.settled.length > 0;
  const firstPageLoading = !sessionStore.hasLoadedInitialPage && sessionStore.loading;
  return (
    <div className="thread-sidebar-list flex flex-1 flex-col overflow-hidden">
      {/* Search + New thread */}
      <div className="px-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Icon
              icon="lucide:search"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70"
            />
            <Input
              data-testid="thread-sidebar-search"
              value={searchQuery}
              onChange={(event) => applySearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setNavIndex((index) => Math.min(index + 1, flatResults.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setNavIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const target = navIndex >= 0 ? flatResults[navIndex] : flatResults[0];
                  if (target) handleSelect(target);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  applySearchQuery("");
                }
              }}
              className="h-8 rounded-xl border-0 bg-muted/60 pl-8 pr-8 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-primary/30"
              placeholder="Search"
              aria-label="Search threads"
              autoComplete="off"
              spellCheck={false}
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                title="Clear"
                aria-label="Clear search"
                onClick={() => applySearchQuery("")}
              >
                <Icon icon="lucide:x" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            data-testid="thread-sidebar-new-chat"
            onClick={handleNewChat}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground active:scale-[0.95] motion-reduce:active:scale-100"
            title="New thread"
            aria-label="New thread"
          >
            <Icon icon="lucide:square-pen" className="size-4" />
          </button>
        </div>
      </div>

      {actionError && (
        <p
          data-testid="thread-sidebar-action-error"
          role="alert"
          className="px-3 pb-1 text-[11px] text-red-600 dark:text-red-400"
        >
          {actionError}
        </p>
      )}

      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1.5 pb-2"
        onScroll={handleListScroll}
      >
        {firstPageLoading ? (
          <SidebarFirstPageSkeleton />
        ) : (
          <>
            {filtered.pinned.length > 0 && (
              <ThreadSection label="Pinned">{renderRows(filtered.pinned, "active")}</ThreadSection>
            )}

            {filtered.active.length > 0 && (
              <ThreadSection label="Active">{renderRows(filtered.active, "active")}</ThreadSection>
            )}

            {filtered.snoozed.length > 0 && (
              <ThreadSection
                label="Snoozed"
                count={filtered.snoozed.length}
                collapsible
                expanded={snoozedExpanded}
                onToggleExpanded={() => setSnoozedShelfExpanded(!snoozedShelfExpanded)}
                toggleTestId="thread-sidebar-snoozed-toggle"
              >
                {renderRows(filtered.snoozed, "snoozed")}
              </ThreadSection>
            )}

            {filtered.settled.length > 0 && (
              <ThreadSection
                label="Settled"
                count={filtered.settled.length}
                collapsible
                expanded={settledExpanded}
                onToggleExpanded={() => setSettledShelfExpanded(!settledShelfExpanded)}
                toggleTestId="thread-sidebar-settled-toggle"
                showMore={
                  settledExpanded
                    ? {
                        remaining: filtered.settled.length - visibleSettled.length,
                        onClick: () => setSettledPageCount((count) => count + 1),
                        testId: "thread-sidebar-settled-more",
                      }
                    : undefined
                }
              >
                {renderRows(visibleSettled, "settled")}
              </ThreadSection>
            )}

            {!hasAnyRows &&
              (searching ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-8 text-center">
                  <Icon icon="lucide:search-x" className="size-4 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground/60">No results for "{searchQuery.trim()}"</p>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-8 text-center">
                  <Icon icon="lucide:message-square" className="size-4 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground/60">No threads yet</p>
                </div>
              ))}

            {sessionStore.loadingMore && (
              <div className="px-2 py-2 text-center text-[11px] text-muted-foreground/70">Loading...</div>
            )}
          </>
        )}
      </div>

      <DeleteConversationDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
