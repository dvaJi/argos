import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useSelector } from "@tanstack/react-store";
import { useNavigate } from "@tanstack/react-router";
import { useSessionStore, type UISession } from "#/stores/ui/session";
import { Input } from "#shadcn/components/ui/input";
import {
  lifecycleContext,
  markThreadOpened,
  notifySessionDeleted,
  setShelfExpanded,
  settleSession,
  snoozeSession,
  threadSidebarStore,
  unsettleSession,
  unsnoozeSession,
  type ThreadShelf,
} from "#/stores/ui/threadSidebar";
import { isSnoozePending } from "#/stores/ui/threadSidebarState";
import { agentStore } from "#/stores/ui/agent";
import { useWorkspaceStore } from "#/stores/ui/workspace";
import { ensureCheckouts, projectSettingsStore, setProjectSettingsFocus } from "#/stores/ui/projectSettings";
import { resolveProjectIdentity } from "#/stores/ui/projectIdentity";
import { normalizeProjectKey } from "@argos/shared/projectKey";
import {
  filterByTitle,
  partitionThreads,
  planNextThread,
  resolveSettled,
  returnAt,
  snoozeWokeAt,
  visibleShelfRows,
  type ThreadSectionId,
  type ThreadSections,
} from "./threadSidebarLogic";
import ThreadSection from "./ThreadSection";
import ThreadSidebarRow from "./ThreadSidebarRow";
import DeleteConversationDialog from "../DeleteConversationDialog";
import SidebarFirstPageSkeleton from "../SidebarFirstPageSkeleton";

/**
 * t3code-style thread sidebar, inbox model (docs/features/thread-sidebar-v3).
 *
 *   ┌───────────────────────────────┐
 *   │ [🔎 Search           ×] [✎]   │
 *   │   Pinned title           3d   │  ← Pinned (no header, divider below)
 *   │ ───────────────────────────── │
 *   │   Title        ✓ Done    now  │  ← Active = inbox, newest return first
 *   │   Title        ⚠ Approval 2m  │
 *   │   Title                  1d   │  ← seen + idle rows recede
 *   │ ▸ Working  2                  │  ← shelves collapsed by default;
 *   │ ▸ Snoozed  1                  │    the open thread still shows
 *   │ ▾ Settled  14                 │
 *   │   Title                  8d   │
 *   │   Show more (4)               │
 *   └───────────────────────────────┘
 */

const SETTLED_INITIAL = 10;
const SETTLED_PAGE = 25;
/** Quiet rows share a coarse clock bucket so memoized rows skip per-second renders. */
const NOW_BUCKET_MS = 15_000;

interface ThreadSidebarListProps {
  /** Alt/⌘+1..9 badge label for a session id, or null while badges are hidden. */
  getShortcutBadge?: (sessionId: string) => string | null;
  /** Publishes the rendered row order so the shell derives shortcut targets from exactly what is visible. */
  onVisibleRowsChange?: (rows: UISession[]) => void;
}

const SHELVES: Array<{ id: ThreadShelf; label: string }> = [
  { id: "working", label: "Working" },
  { id: "snoozed", label: "Snoozed" },
  { id: "settled", label: "Settled" },
];

export default function ThreadSidebarList({ getShortcutBadge, onVisibleRowsChange }: ThreadSidebarListProps) {
  const navigate = useNavigate();
  const sessionStore = useSessionStore();
  const lifecycle = useSelector(threadSidebarStore);
  const projectSettingsByKey = useSelector(projectSettingsStore, (state) => state.byKey);
  const checkoutByKey = useSelector(projectSettingsStore, (state) => state.checkoutByKey);
  const agents = useSelector(agentStore, (state) => state.agents);
  const machineLabel = useWorkspaceStore().activeWorkspace?.name ?? "This computer";
  const activeSessionId = sessionStore.activeSessionId;

  const [searchQuery, setSearchQuery] = useState("");
  const [navIndex, setNavIndex] = useState(-1);
  const [settledVisibleCount, setSettledVisibleCount] = useState(SETTLED_INITIAL);
  const [deleteTarget, setDeleteTarget] = useState<UISession | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const actionErrorTimerRef = useRef<number | null>(null);

  // Clock: per second while something live is on screen (working durations,
  // snooze countdown/wake), else per minute (age labels, auto-settle).
  const hasLiveRows = useMemo(
    () =>
      sessionStore.sessions.some((session) => session.status === "working") ||
      Object.values(lifecycle.snoozeById).some((entry) => isSnoozePending(entry, now)),
    [sessionStore.sessions, lifecycle.snoozeById, now],
  );
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), hasLiveRows ? 1000 : 60_000);
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

  const ctx = useMemo(() => lifecycleContext(lifecycle, now), [lifecycle, now]);
  const sections = useMemo(() => partitionThreads(sessionStore.sessions, ctx), [sessionStore.sessions, ctx]);

  const searching = searchQuery.trim().length > 0;
  const filtered: ThreadSections = useMemo(() => {
    if (!searching) return sections;
    const byTitle = (rows: UISession[]) => filterByTitle(rows, searchQuery);
    return {
      pinned: byTitle(sections.pinned),
      active: byTitle(sections.active),
      working: byTitle(sections.working),
      snoozed: byTitle(sections.snoozed),
      settled: byTitle(sections.settled),
    };
  }, [sections, searching, searchQuery]);

  // Rendered rows per section. Search bypasses shelf collapse; a collapsed
  // shelf still renders the open thread (t3code routeThreadOnly). The settled
  // shelf pages, but the open thread is always included.
  const rendered = useMemo(() => {
    const shelf = (rows: UISession[], id: ThreadShelf) =>
      visibleShelfRows(rows, searching || lifecycle.shelfExpanded[id], activeSessionId);
    const settledPage = searching ? filtered.settled : filtered.settled.slice(0, settledVisibleCount);
    if (activeSessionId && !settledPage.some((session) => session.id === activeSessionId)) {
      const open = filtered.settled.find((session) => session.id === activeSessionId);
      if (open) settledPage.push(open);
    }
    return {
      pinned: filtered.pinned,
      active: filtered.active,
      working: shelf(filtered.working, "working"),
      snoozed: shelf(filtered.snoozed, "snoozed"),
      settled: shelf(settledPage, "settled"),
      settledHidden: filtered.settled.length - settledPage.length,
    };
  }, [filtered, searching, lifecycle.shelfExpanded, activeSessionId, settledVisibleCount]);

  // Flat render order drives keyboard nav, shortcut badges and
  // settle-and-advance — hidden rows can never be targeted invisibly.
  const flatRows = useMemo(
    () => [...rendered.pinned, ...rendered.active, ...rendered.working, ...rendered.snoozed, ...rendered.settled],
    [rendered],
  );
  const navIndexById = useMemo(() => new Map(flatRows.map((session, index) => [session.id, index])), [flatRows]);
  const sectionById = useMemo(() => {
    const map = new Map<string, ThreadSectionId>();
    for (const id of ["pinned", "active", "working", "snoozed", "settled"] as const) {
      for (const session of sections[id]) map.set(session.id, id);
    }
    return map;
  }, [sections]);

  useEffect(() => {
    onVisibleRowsChange?.(flatRows);
  }, [flatRows, onVisibleRowsChange]);

  // Project + branch lines: resolve checkouts for rendered rows only; branches
  // refresh at most every 60 s (cached, deduped, skipped while hidden).
  const renderedDirsKey = useMemo(
    () => Array.from(new Set(flatRows.map((session) => session.projectDir).filter(Boolean))).join("\n"),
    [flatRows],
  );
  useEffect(() => {
    const dirs = renderedDirsKey ? renderedDirsKey.split("\n") : [];
    void ensureCheckouts(dirs);
    const interval = window.setInterval(() => void ensureCheckouts(dirs), 60_000);
    return () => window.clearInterval(interval);
  }, [renderedDirsKey]);

  useEffect(() => {
    if (navIndex < 0) return;
    listRef.current?.querySelector('[data-nav-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [navIndex]);

  // Content shorter than the viewport never scrolls; keep requesting pages
  // until the list overflows.
  useEffect(() => {
    if (
      !sessionStore.hasLoadedInitialPage ||
      sessionStore.loading ||
      sessionStore.loadingMore ||
      !sessionStore.hasMore
    ) {
      return;
    }
    const element = listRef.current;
    if (element && element.scrollHeight <= element.clientHeight) void sessionStore.loadNextPage();
  });

  const handleListScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const element = listRef.current;
      if (!element || sessionStore.loadingMore || !sessionStore.hasMore) return;
      if (element.scrollHeight - element.scrollTop - element.clientHeight <= 96) void sessionStore.loadNextPage();
    });
  }, [sessionStore]);

  const applySearchQuery = (value: string) => {
    setSearchQuery(value);
    setNavIndex(-1);
    setSettledVisibleCount(SETTLED_INITIAL);
  };

  const handleSelect = useCallback(
    (session: UISession) => {
      markThreadOpened(session.id);
      void sessionStore.selectSession(session.id);
    },
    [sessionStore],
  );
  const handleNewChat = useCallback(() => {
    void sessionStore.startNewConversation({ refresh: true });
  }, [sessionStore]);

  // Settle-and-advance (t3code planForwardNavigation): parking the open
  // thread moves to the next un-parked rendered row, else a new chat. The
  // plan is snapshotted before the park mutates the partition.
  // Read through refs so row callbacks stay stable across clock ticks
  // (memoized rows would otherwise re-render every second).
  const flatRowsRef = useRef(flatRows);
  const sectionByIdRef = useRef(sectionById);
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => {
    flatRowsRef.current = flatRows;
    sectionByIdRef.current = sectionById;
    activeSessionIdRef.current = activeSessionId;
  }, [flatRows, sectionById, activeSessionId]);
  const parkAndAdvance = useCallback(
    (session: UISession, park: () => void) => {
      let advance: (() => void) | null = null;
      if (activeSessionIdRef.current === session.id) {
        const parked = (id: string) => {
          const section = sectionByIdRef.current.get(id);
          return section === "settled" || section === "snoozed";
        };
        const nextId = planNextThread(
          flatRowsRef.current.map((row) => row.id),
          session.id,
          parked,
        );
        advance = nextId
          ? () => {
              markThreadOpened(nextId);
              void sessionStore.selectSession(nextId);
            }
          : () => void sessionStore.startNewConversation({ refresh: true });
      }
      park();
      advance?.();
    },
    [sessionStore],
  );

  const onSettle = useCallback(
    (session: UISession) =>
      parkAndAdvance(session, () => {
        settleSession(session.id);
        // Settle beats pin (t3code clears pinnedAt on settle).
        if (session.isPinned) void sessionStore.toggleSessionPinned(session.id, false);
      }),
    [parkAndAdvance, sessionStore],
  );
  const onSnooze = useCallback(
    (session: UISession, until: number) => parkAndAdvance(session, () => snoozeSession(session.id, until)),
    [parkAndAdvance],
  );
  const onArchive = useCallback(
    (session: UISession) =>
      parkAndAdvance(session, () => {
        sessionStore.archiveSession(session.id).catch(() => {
          reportActionError(`Failed to archive "${session.title || "Untitled session"}".`);
        });
      }),
    [parkAndAdvance, sessionStore, reportActionError],
  );
  const onUnsettle = useCallback((session: UISession) => unsettleSession(session.id), []);
  const onUnsnooze = useCallback((session: UISession) => unsnoozeSession(session.id), []);
  const onDismissWoke = useCallback((session: UISession) => markThreadOpened(session.id), []);
  const onTogglePin = useCallback(
    (session: UISession) => {
      const pinning = !session.isPinned;
      if (pinning) {
        // Pinning promotes a parked thread (t3code thread.pin).
        const section = sectionByIdRef.current.get(session.id);
        if (section === "settled") unsettleSession(session.id);
        if (section === "snoozed") unsnoozeSession(session.id);
      }
      void sessionStore.toggleSessionPinned(session.id, pinning);
    },
    [sessionStore],
  );
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
  const onRequestDelete = useCallback((session: UISession) => setDeleteTarget(session), []);
  const onOpenProjectSettings = useCallback(
    (session: UISession) => {
      const identity = resolveProjectIdentity(
        session.projectDir,
        projectSettingsStore.state.checkoutByKey,
        projectSettingsStore.state.byKey,
      );
      if (!identity) return;
      setProjectSettingsFocus(identity.path);
      void navigate({ to: "/settings/projects" });
    },
    [navigate],
  );
  const handleDeleteConfirm = useCallback(() => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    void (async () => {
      try {
        await sessionStore.deleteSession(target.id);
        notifySessionDeleted(target.id);
      } catch {
        reportActionError(`Failed to delete "${target.title || "Untitled session"}".`);
      }
    })();
  }, [deleteTarget, sessionStore, reportActionError]);

  const renderRows = (rows: UISession[], section: ThreadSectionId) => (
    <ul className="flex flex-col gap-px">
      {rows.map((session) => {
        const snooze = lifecycle.snoozeById[session.id];
        const workingSince = lifecycle.workingSinceById[session.id];
        const isLive =
          (session.status === "working" && typeof workingSince === "number") ||
          (section === "snoozed" && isSnoozePending(snooze, now));
        const timestamp = section === "settled" ? resolveSettled(session, ctx).settledAt : returnAt(session, ctx);
        const identity = resolveProjectIdentity(session.projectDir, checkoutByKey, projectSettingsByKey);
        const branch = session.projectDir
          ? (checkoutByKey[normalizeProjectKey(session.projectDir)]?.branch ?? null)
          : null;
        const modelLabel =
          session.providerId === "acp"
            ? (agents.find((agent) => agent.id === session.agentId)?.name ?? null)
            : session.providerId && session.modelId
              ? `${session.providerId}/${session.modelId}`
              : null;
        return (
          <li key={session.id}>
            <ThreadSidebarRow
              session={session}
              section={section}
              isSelected={activeSessionId === session.id}
              isNavSelected={searching && navIndexById.get(session.id) === navIndex}
              query={searchQuery}
              now={isLive ? now : Math.floor(now / NOW_BUCKET_MS) * NOW_BUCKET_MS}
              timestamp={timestamp}
              workingSince={workingSince}
              snoozedUntil={section === "snoozed" ? snooze?.until : undefined}
              isWoke={section !== "snoozed" && snoozeWokeAt(snooze, now) !== null}
              shortcutBadge={getShortcutBadge?.(session.id) ?? null}
              onSelect={handleSelect}
              onSettle={onSettle}
              onUnsettle={onUnsettle}
              onTogglePin={onTogglePin}
              onSnooze={onSnooze}
              onUnsnooze={onUnsnooze}
              onDismissWoke={onDismissWoke}
              onRename={handleRename}
              onArchive={onArchive}
              onRequestDelete={onRequestDelete}
              projectName={identity?.name ?? null}
              projectIconKind={identity?.icon?.kind ?? null}
              projectIconValue={identity?.icon?.value ?? null}
              branch={branch}
              modelLabel={modelLabel}
              machineLabel={machineLabel}
              onOpenProjectSettings={onOpenProjectSettings}
            />
          </li>
        );
      })}
    </ul>
  );

  const totalMatches =
    filtered.pinned.length +
    filtered.active.length +
    filtered.working.length +
    filtered.snoozed.length +
    filtered.settled.length;
  const firstPageLoading = !sessionStore.hasLoadedInitialPage && sessionStore.loading;

  return (
    <div className="thread-sidebar-list flex flex-1 flex-col overflow-hidden">
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
                  setNavIndex((index) => Math.min(index + 1, flatRows.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setNavIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const target = navIndex >= 0 ? flatRows[navIndex] : flatRows[0];
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
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1.5 pb-2"
        onScroll={handleListScroll}
      >
        {firstPageLoading ? (
          <SidebarFirstPageSkeleton />
        ) : totalMatches === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-8 text-center">
            <Icon
              icon={searching ? "lucide:search-x" : "lucide:message-square"}
              className="size-4 text-muted-foreground/40"
            />
            <p className="text-xs text-muted-foreground/60">
              {searching ? `No results for "${searchQuery.trim()}"` : "No threads yet"}
            </p>
          </div>
        ) : (
          <>
            {rendered.pinned.length > 0 && (
              <section aria-label="Pinned threads" data-testid="thread-sidebar-pinned">
                {renderRows(rendered.pinned, "pinned")}
                <div aria-hidden className="mx-2 mt-2 h-px bg-sidebar-foreground/10" />
              </section>
            )}

            <section aria-label="Active threads" data-testid="thread-sidebar-active">
              {rendered.active.length > 0
                ? renderRows(rendered.active, "active")
                : !searching && (
                    <p className="px-2 py-1.5 text-[11px] text-muted-foreground/60">
                      All caught up — nothing needs you.
                    </p>
                  )}
            </section>

            {SHELVES.map(({ id, label }) => {
              const count = filtered[id].length;
              if (count === 0) return null;
              return (
                <ThreadSection
                  key={id}
                  label={label}
                  count={count}
                  collapsible
                  expanded={searching || lifecycle.shelfExpanded[id]}
                  onToggleExpanded={() => setShelfExpanded(id, !lifecycle.shelfExpanded[id])}
                  toggleTestId={`thread-sidebar-${id}-toggle`}
                  showMore={
                    id === "settled" && !searching && lifecycle.shelfExpanded.settled
                      ? {
                          remaining: rendered.settledHidden,
                          onClick: () => setSettledVisibleCount((value) => value + SETTLED_PAGE),
                          testId: "thread-sidebar-settled-more",
                        }
                      : undefined
                  }
                >
                  {rendered[id].length > 0 && renderRows(rendered[id], id)}
                </ThreadSection>
              );
            })}

            {sessionStore.loadingMore && (
              <div className="px-2 py-2 text-center text-[11px] text-muted-foreground/70">Loading...</div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 px-3 pb-1">
        <button
          type="button"
          data-testid="thread-sidebar-archive-link"
          onClick={() => void navigate({ to: "/archive" })}
          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <Icon icon="lucide:archive" className="size-3" />
          Archived threads
        </button>
      </div>

      <DeleteConversationDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
