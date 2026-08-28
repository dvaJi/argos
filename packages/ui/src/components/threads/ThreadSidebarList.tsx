import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useAgentStore } from "#/stores/ui/agent";
import { useSessionStore, type UISession } from "#/stores/ui/session";
import { createSessionClient } from "../../../api/SessionClient";
import { Input } from "#shadcn/components/ui/input";
import {
  bumpThreadSidebarTick,
  getSettledAt,
  isSessionWoke,
  markThreadOpened,
  setSettledShelfExpanded,
  settleSession,
  snoozeSession,
  unsettleSession,
  unsnoozeSession,
  useThreadSidebarStore,
} from "#/stores/ui/threadSidebar";
import { matchesTitle, partitionThreads } from "./threadSidebarLogic";
import ThreadSidebarRow from "./ThreadSidebarRow";

/**
 * t3code-style thread sidebar (v2 parity rework —
 * docs/features/thread-sidebar-t3-parity).
 *
 *   ┌───────────────────────────────┐
 *   │ [🔎 Search            ] [✎]   │  ← dedicated New-thread button
 *   │ PINNED                        │
 *   │   Title              3d       │
 *   │ ACTIVE                        │
 *   │   Title   [●Working 12s]  now │
 *   │   Title   [◉Pending approval] │
 *   │   Title                  5m   │
 *   │ SNOOZED (2)             ▸     │  ← collapsible shelf
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
 * working threads can never render as Settled.
 */

const SETTLED_PAGE_SIZE = 10;

export default function ThreadSidebarList() {
  const sessionStore = useSessionStore();
  const { workingSinceById, settledAtById, snoozedUntilById, settledShelfExpanded, tick } = useThreadSidebarStore();
  const sessionClient = useMemo(() => createSessionClient(), []);
  const [searchQuery, setSearchQuery] = useState("");
  const [navIndex, setNavIndex] = useState(-1);
  const [settledPageCount, setSettledPageCount] = useState(1);
  const [snoozedShelfExpanded, setSnoozedShelfExpanded] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);

  // Live tick for working durations / wake countdowns: only run while there is
  // something live to show (cheap no-op otherwise).
  const hasLiveRows = useMemo(() => {
    const sessions = sessionStore.sessions;
    const anyWorking = sessions.some((s) => s.status === "working");
    const anySnoozed = Object.keys(snoozedUntilById).length > 0;
    return anyWorking || anySnoozed;
  }, [sessionStore.sessions, snoozedUntilById]);

  useEffect(() => {
    if (!hasLiveRows) return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
      bumpThreadSidebarTick();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [hasLiveRows]);

  // Touch `tick` so the panel re-renders on store flips even if the section
  // identities didn't change.
  void tick;

  const sections = useMemo(
    () =>
      partitionThreads(sessionStore.sessions, {
        settledAtById,
        snoozedUntilById,
        now,
      }),
    [sessionStore.sessions, settledAtById, snoozedUntilById, now],
  );

  const searching = searchQuery.trim().length > 0;
  const pinned = useMemo(
    () => (searching ? sections.pinned.filter((s) => matchesTitle(s, searchQuery)) : sections.pinned),
    [sections.pinned, searching, searchQuery],
  );
  const active = useMemo(
    () => (searching ? sections.active.filter((s) => matchesTitle(s, searchQuery)) : sections.active),
    [sections.active, searching, searchQuery],
  );
  const snoozed = useMemo(
    () => (searching ? sections.snoozed.filter((s) => matchesTitle(s, searchQuery)) : sections.snoozed),
    [sections.snoozed, searching, searchQuery],
  );
  const settled = useMemo(
    () => (searching ? sections.settled.filter((s) => matchesTitle(s, searchQuery)) : sections.settled),
    [sections.settled, searching, searchQuery],
  );

  // Flat result order drives keyboard navigation while searching.
  const flatResults = useMemo(() => [...pinned, ...active, ...snoozed, ...settled], [pinned, active, snoozed, settled]);
  const navIndexById = useMemo(() => {
    const map = new Map<string, number>();
    flatResults.forEach((session, index) => map.set(session.id, index));
    return map;
  }, [flatResults]);

  useEffect(() => {
    if (navIndex < 0) return;
    listRef.current?.querySelector('[data-nav-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [navIndex]);

  const visibleSettledCount = searching ? settled.length : settledPageCount * SETTLED_PAGE_SIZE;
  const visibleSettled = settled.slice(0, visibleSettledCount);

  const handleSelect = (session: UISession) => {
    markThreadOpened(session.id);
    void sessionStore.selectSession(session.id);
  };

  const handleNewChat = () => {
    void sessionStore.startNewConversation({ refresh: true });
  };

  const handleRename = async (session: UISession, title: string) => {
    try {
      await sessionClient.renameSession(session.id, title);
    } catch (renameError) {
      console.warn("[threadSidebar] Failed to rename session:", renameError);
    }
  };

  const handleDelete = async (session: UISession) => {
    try {
      await sessionClient.deleteSession(session.id);
    } catch (deleteError) {
      console.warn("[threadSidebar] Failed to delete session:", deleteError);
    }
  };

  const renderSection = (label: string, rows: UISession[], variant: "active" | "settled" | "snoozed") => {
    if (rows.length === 0) return null;
    return (
      <section aria-label={`${label} threads`} className="flex min-h-0 flex-col gap-1">
        <p className="px-1 text-[11px] font-medium text-muted-foreground/70">{label}</p>
        <ul className="flex flex-col gap-px">
          {rows.map((session) => {
            const isWoke = variant === "snoozed" && isSessionWoke(session.id, now);
            return (
              <li key={session.id}>
                <ThreadSidebarRow
                  session={session}
                  variant={variant}
                  isSelected={sessionStore.activeSessionId === session.id}
                  isNavSelected={searching && navIndexById.get(session.id) === navIndex}
                  query={searchQuery}
                  now={now}
                  workingSince={workingSinceById[session.id]}
                  snoozedUntil={snoozedUntilById[session.id]}
                  isWoke={isWoke}
                  onSelect={handleSelect}
                  onSettle={(target) => settleSession(target.id)}
                  onUnsettle={(target) => unsettleSession(target.id)}
                  onTogglePin={(target) => void sessionStore.toggleSessionPinned(target.id, !target.isPinned)}
                  onSnooze={(target, durationMs) => snoozeSession(target.id, durationMs)}
                  onUnsnooze={(target) => unsnoozeSession(target.id)}
                  onRename={(target, title) => void handleRename(target, title)}
                  onDelete={(target) => void handleDelete(target)}
                />
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  const hasAnyRows = pinned.length + active.length + snoozed.length + settled.length > 0;

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
              onChange={(event) => {
                setSearchQuery(event.target.value);
                // Reset nav + paging inline: a reset effect would be a
                // synchronous set-state-in-effect (react-doctor).
                setNavIndex(-1);
                setSettledPageCount(1);
              }}
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
                  setSearchQuery("");
                }
              }}
              className="h-8 rounded-xl border-0 bg-muted/60 pl-8 pr-2 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-primary/30"
              placeholder="Search"
              aria-label="Search threads"
              autoComplete="off"
              spellCheck={false}
            />
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

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1.5 pb-2">
        {renderSection("Pinned", pinned, "active")}
        {renderSection("Active", active, "active")}

        {snoozed.length > 0 && (
          <section aria-label="Snoozed threads" className="flex min-h-0 flex-col gap-1">
            <button
              type="button"
              onClick={() => setSnoozedShelfExpanded((expanded) => !expanded)}
              className="flex items-center gap-1 rounded-md px-1 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
              aria-expanded={snoozedShelfExpanded}
            >
              <Icon icon={snoozedShelfExpanded ? "lucide:chevron-down" : "lucide:chevron-right"} className="size-3" />
              Snoozed
              <span className="tabular-nums">{snoozed.length}</span>
            </button>
            {snoozedShelfExpanded && (
              <ul className="flex flex-col gap-px">
                {snoozed.map((session) => (
                  <li key={session.id}>
                    <ThreadSidebarRow
                      session={session}
                      variant="snoozed"
                      isSelected={sessionStore.activeSessionId === session.id}
                      isNavSelected={searching && navIndexById.get(session.id) === navIndex}
                      query={searchQuery}
                      now={now}
                      snoozedUntil={snoozedUntilById[session.id]}
                      isWoke={isSessionWoke(session.id, now)}
                      onSelect={handleSelect}
                      onSettle={(target) => settleSession(target.id)}
                      onUnsettle={(target) => unsettleSession(target.id)}
                      onTogglePin={(target) => void sessionStore.toggleSessionPinned(target.id, !target.isPinned)}
                      onSnooze={(target, durationMs) => snoozeSession(target.id, durationMs)}
                      onUnsnooze={(target) => unsnoozeSession(target.id)}
                      onRename={(target, title) => void handleRename(target, title)}
                      onDelete={(target) => void handleDelete(target)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {settled.length > 0 && (
          <section aria-label="Settled threads" className="flex min-h-0 flex-col gap-1">
            <button
              type="button"
              data-testid="thread-sidebar-settled-toggle"
              onClick={() => setSettledShelfExpanded(!settledShelfExpanded)}
              className="flex items-center gap-1 rounded-md px-1 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
              aria-expanded={settledShelfExpanded}
            >
              <Icon icon={settledShelfExpanded ? "lucide:chevron-down" : "lucide:chevron-right"} className="size-3" />
              Settled
              <span className="tabular-nums">{settled.length}</span>
            </button>
            {settledShelfExpanded && (
              <>
                <ul className="flex flex-col gap-px">
                  {visibleSettled.map((session) => (
                    <li key={session.id}>
                      <ThreadSidebarRow
                        session={session}
                        variant="settled"
                        isSelected={sessionStore.activeSessionId === session.id}
                        isNavSelected={searching && navIndexById.get(session.id) === navIndex}
                        query={searchQuery}
                        now={now}
                        settledAt={getSettledAt(session.id)}
                        onSelect={handleSelect}
                        onSettle={(target) => settleSession(target.id)}
                        onUnsettle={(target) => unsettleSession(target.id)}
                        onTogglePin={(target) => void sessionStore.toggleSessionPinned(target.id, !target.isPinned)}
                        onSnooze={(target, durationMs) => snoozeSession(target.id, durationMs)}
                        onUnsnooze={(target) => unsnoozeSession(target.id)}
                        onRename={(target, title) => void handleRename(target, title)}
                        onDelete={(target) => void handleDelete(target)}
                      />
                    </li>
                  ))}
                </ul>
                {settled.length > visibleSettled.length && (
                  <button
                    type="button"
                    data-testid="thread-sidebar-settled-more"
                    onClick={() => setSettledPageCount((count) => count + 1)}
                    className="rounded-md px-2 py-1 text-left text-[11px] font-medium text-muted-foreground/70 transition-colors hover:bg-sidebar-row-hover hover:text-foreground"
                  >
                    Show more ({settled.length - visibleSettled.length})
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {!hasAnyRows && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-8 text-center">
            <Icon icon="lucide:message-square" className="size-4 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground/60">No threads yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
