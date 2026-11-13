import { Store } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useState } from "react";
import { createConfigClient } from "../../../api/ConfigClient";
import { onSessionUnarchived, sessionStore, type UISession } from "./session";
import {
  DEFAULT_LIFECYCLE_SETTINGS,
  daysToMs,
  normalizeLifecycleSettings,
  resolveSettled,
  type LifecycleContext,
  type LifecycleSettings,
} from "#/components/threads/threadSidebarLogic";
import {
  diffSessionTransitions,
  omitKey,
  parseOverrideRecord,
  parseSnoozeRecord,
  parseTimestampRecord,
  pruneLifecycleEntries,
  type OverrideMap,
  type SnoozeMap,
  type TimestampMap,
} from "./threadSidebarState";

/**
 * Thread sidebar experiment state (v3, t3code inbox model —
 * docs/features/thread-sidebar-v3).
 *
 * When enabled, the main left sidebar renders a t3code-style lifecycle view
 * (Pinned / Active / Working / Snoozed / Settled) instead of the agent/project
 * history grouping. The flag is daemon-persisted (`thread_sidebar_enabled`),
 * off by default, toggled from Settings → Appearance.
 *
 * Lifecycle state is renderer-local (the daemon has no schema for it):
 *  - `overrideById`: manual settle / un-settle (un-settle exempts auto-settle).
 *  - `snoozeById`: wake time + snoozed-at (+ early wake). Kept after waking so
 *    rows show "Woke" until the thread is opened or the notice dismissed.
 *  - `workingSinceById`: last send time; drives the Working sort + elapsed pill.
 *  - `returnedAtById`: observed working → idle time; drives the inbox sort.
 *  - shelf flags (collapsed by default, like t3code).
 *
 * Pure pieces live in `threadSidebarState.ts`; view rules in
 * `components/threads/threadSidebarLogic.ts`.
 */

const THREAD_SIDEBAR_ENABLED_KEY = "thread_sidebar_enabled";
const THREAD_SIDEBAR_LIFECYCLE_KEY = "thread_sidebar_lifecycle";
const OVERRIDE_STORAGE_KEY = "argos:thread-sidebar:override";
const LEGACY_SETTLED_STORAGE_KEY = "argos:thread-sidebar:settled";
const SNOOZED_STORAGE_KEY = "argos:thread-sidebar:snoozed";
const WORKING_SINCE_STORAGE_KEY = "argos:thread-sidebar:working-since";
const RETURNED_AT_STORAGE_KEY = "argos:thread-sidebar:returned-at";
const SHELF_KEYS = {
  working: "argos:thread-sidebar:working-expanded",
  snoozed: "argos:thread-sidebar:snoozed-expanded",
  settled: "argos:thread-sidebar:settled-expanded",
} as const;

export type ThreadShelf = keyof typeof SHELF_KEYS;

const SYNCED_STORAGE_KEYS = new Set<string>([
  OVERRIDE_STORAGE_KEY,
  SNOOZED_STORAGE_KEY,
  RETURNED_AT_STORAGE_KEY,
  ...Object.values(SHELF_KEYS),
]);

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

const loadOverrides = (): OverrideMap =>
  parseOverrideRecord(readJson(OVERRIDE_STORAGE_KEY), readJson(LEGACY_SETTLED_STORAGE_KEY));
const loadSnoozes = (): SnoozeMap => parseSnoozeRecord(readJson(SNOOZED_STORAGE_KEY));
// t3code defaults every shelf to collapsed.
const loadShelf = (shelf: ThreadShelf): boolean => readJson(SHELF_KEYS[shelf]) === true;

const persistOverrides = (byId: OverrideMap) => writeJson(OVERRIDE_STORAGE_KEY, { v: 3, byId });
const persistSnoozes = (byId: SnoozeMap) => writeJson(SNOOZED_STORAGE_KEY, { v: 2, byId });
const persistWorkingSince = (byId: TimestampMap) => writeJson(WORKING_SINCE_STORAGE_KEY, byId);
const persistReturnedAt = (byId: TimestampMap) => writeJson(RETURNED_AT_STORAGE_KEY, byId);

export interface ThreadSidebarState {
  enabled: boolean;
  enabledLoaded: boolean;
  overrideById: OverrideMap;
  snoozeById: SnoozeMap;
  workingSinceById: TimestampMap;
  returnedAtById: TimestampMap;
  shelfExpanded: Record<ThreadShelf, boolean>;
  /** Settle / archive / delete timers (daemon-persisted config entry). */
  lifecycleSettings: LifecycleSettings;
  /** Sweeps wait for the persisted timers so defaults never act on a user's "Off". */
  lifecycleLoaded: boolean;
}

export const threadSidebarStore = new Store<ThreadSidebarState>({
  enabled: false,
  enabledLoaded: false,
  overrideById: loadOverrides(),
  snoozeById: loadSnoozes(),
  workingSinceById: parseTimestampRecord(readJson(WORKING_SINCE_STORAGE_KEY)),
  returnedAtById: parseTimestampRecord(readJson(RETURNED_AT_STORAGE_KEY)),
  shelfExpanded: { working: loadShelf("working"), snoozed: loadShelf("snoozed"), settled: loadShelf("settled") },
  lifecycleSettings: DEFAULT_LIFECYCLE_SETTINGS,
  lifecycleLoaded: false,
});

const configClient = createConfigClient();

export async function loadThreadSidebarLifecycle(): Promise<void> {
  try {
    const raw = await configClient.getSetting(THREAD_SIDEBAR_LIFECYCLE_KEY);
    threadSidebarStore.setState((prev) => ({
      ...prev,
      lifecycleSettings: normalizeLifecycleSettings(raw),
      lifecycleLoaded: true,
    }));
  } catch (loadError) {
    console.warn("[threadSidebar] Failed to load lifecycle settings:", loadError);
  }
}

export async function setThreadSidebarLifecycle(next: LifecycleSettings): Promise<void> {
  const previous = threadSidebarStore.state.lifecycleSettings;
  threadSidebarStore.setState((prev) => ({ ...prev, lifecycleSettings: next }));
  try {
    await configClient.setSetting(THREAD_SIDEBAR_LIFECYCLE_KEY, next);
  } catch (persistError) {
    console.warn("[threadSidebar] Failed to persist lifecycle settings:", persistError);
    threadSidebarStore.setState((prev) => ({ ...prev, lifecycleSettings: previous }));
  }
}

export async function loadThreadSidebarEnabled(): Promise<void> {
  void loadThreadSidebarLifecycle();
  try {
    const enabled = (await configClient.getSetting(THREAD_SIDEBAR_ENABLED_KEY)) ?? false;
    threadSidebarStore.setState((prev) => ({ ...prev, enabled: Boolean(enabled), enabledLoaded: true }));
  } catch (loadError) {
    console.warn("[threadSidebar] Failed to load experiment flag:", loadError);
    threadSidebarStore.setState((prev) => ({ ...prev, enabled: false, enabledLoaded: true }));
  }
}

export async function setThreadSidebarEnabled(enabled: boolean): Promise<void> {
  threadSidebarStore.setState((prev) => ({ ...prev, enabled }));
  try {
    await configClient.setSetting(THREAD_SIDEBAR_ENABLED_KEY, enabled);
  } catch (persistError) {
    console.warn("[threadSidebar] Failed to persist experiment flag:", persistError);
    threadSidebarStore.setState((prev) => ({ ...prev, enabled: !enabled }));
  }
}

if (typeof window !== "undefined") {
  // Live-sync the experiment flag across windows (settings → main window).
  configClient.onEntriesChanged((payload) => {
    if (payload.changedKeys.includes(THREAD_SIDEBAR_ENABLED_KEY)) void loadThreadSidebarEnabled();
    else if (payload.changedKeys.includes(THREAD_SIDEBAR_LIFECYCLE_KEY)) void loadThreadSidebarLifecycle();
  });

  // A thread restored from the archive returns to Active (and is exempt from
  // auto-settle, so the next sweep cannot re-archive it).
  onSessionUnarchived((sessionId) => unsettleSession(sessionId));

  // Reflect session-status flips (turn start clears overrides, send →
  // working → returned, early snooze wake). TanStack Store's subscribe only passes the new state, so keep the
  // previous sessions in a closure to diff transitions.
  let previousSessions: UISession[] = sessionStore.state.sessions;
  let previousActiveSessionId: string | null = sessionStore.state.activeSessionId;
  let lifecycleSwept = false;
  sessionStore.subscribe((state) => {
    const current = threadSidebarStore.state;
    const transition = diffSessionTransitions(
      state.sessions,
      previousSessions,
      {
        overrideById: current.overrideById,
        workingSinceById: current.workingSinceById,
        returnedAtById: current.returnedAtById,
        snoozeById: current.snoozeById,
      },
      Date.now(),
    );
    previousSessions = state.sessions;
    if (transition.changed) {
      threadSidebarStore.setState((prev) => ({ ...prev, ...transition.next }));
      if (transition.next.workingSinceById !== current.workingSinceById) {
        persistWorkingSince(transition.next.workingSinceById);
      }
      if (transition.next.returnedAtById !== current.returnedAtById) persistReturnedAt(transition.next.returnedAtById);
      if (transition.next.snoozeById !== current.snoozeById) persistSnoozes(transition.next.snoozeById);
      if (transition.next.overrideById !== current.overrideById) persistOverrides(transition.next.overrideById);
    }
    // Opening a thread by any path (list click, Alt/⌘+N, original sidebar,
    // route restore) acknowledges its "Woke" notice.
    if (state.activeSessionId !== previousActiveSessionId) {
      previousActiveSessionId = state.activeSessionId;
      if (state.activeSessionId) markThreadOpened(state.activeSessionId);
    }
    // One-time prune once the whole history is loaded; with paging, an absent
    // id is not proof of deletion until !hasMore.
    if (!lifecycleSwept && state.hasLoadedInitialPage && state.sessions.length > 0 && !state.hasMore) {
      lifecycleSwept = true;
      const latest = threadSidebarStore.state;
      const pruned = pruneLifecycleEntries(
        {
          overrideById: latest.overrideById,
          snoozeById: latest.snoozeById,
          workingSinceById: latest.workingSinceById,
          returnedAtById: latest.returnedAtById,
        },
        new Set(state.sessions.map((session) => session.id)),
      );
      if (pruned.changed) {
        threadSidebarStore.setState((prev) => ({ ...prev, ...pruned.next }));
        persistAll(pruned.next);
      }
    }
  });

  // Cross-window sync: `storage` fires only in *other* windows, so no loops.
  // workingSinceById is per-window observation and is not synced.
  window.addEventListener("storage", (event) => {
    if (event.key !== null && !SYNCED_STORAGE_KEYS.has(event.key)) return;
    threadSidebarStore.setState((prev) => ({
      ...prev,
      overrideById: loadOverrides(),
      snoozeById: loadSnoozes(),
      returnedAtById: parseTimestampRecord(readJson(RETURNED_AT_STORAGE_KEY)),
      shelfExpanded: { working: loadShelf("working"), snoozed: loadShelf("snoozed"), settled: loadShelf("settled") },
    }));
  });
}

function persistAll(
  maps: Pick<ThreadSidebarState, "overrideById" | "snoozeById" | "workingSinceById" | "returnedAtById">,
) {
  persistOverrides(maps.overrideById);
  persistSnoozes(maps.snoozeById);
  persistWorkingSince(maps.workingSinceById);
  persistReturnedAt(maps.returnedAtById);
}

function setOverrides(next: OverrideMap): void {
  threadSidebarStore.setState((prev) => ({ ...prev, overrideById: next }));
  persistOverrides(next);
}

function setSnoozes(next: SnoozeMap): void {
  threadSidebarStore.setState((prev) => ({ ...prev, snoozeById: next }));
  persistSnoozes(next);
}

// --- Settle / un-settle ---

/** Manual settle. Callers also unpin (settle beats pin, as in t3code). Clears any snooze. */
export function settleSession(id: string): void {
  setOverrides({ ...threadSidebarStore.state.overrideById, [id]: { state: "settled", at: Date.now() } });
  unsnoozeSession(id);
}

/** Manual un-settle: returns to Active and exempts the thread from auto-settle. */
export function unsettleSession(id: string): void {
  setOverrides({ ...threadSidebarStore.state.overrideById, [id]: { state: "active", at: Date.now() } });
}

/**
 * Sending a message starts a turn: like t3code, clear any override (the
 * thread is live again and its inactivity clock restarts) and wake it.
 */
export function resumeThreadOnSend(id: string): void {
  const next = omitKey(threadSidebarStore.state.overrideById, id);
  if (next !== threadSidebarStore.state.overrideById) setOverrides(next);
  unsnoozeSession(id);
}

// --- Snooze (UI-only; wake evaluation happens in the renderer) ---

export function snoozeSession(id: string, until: number): void {
  setSnoozes({ ...threadSidebarStore.state.snoozeById, [id]: { until, at: Date.now() } });
}

export function unsnoozeSession(id: string): void {
  const next = omitKey(threadSidebarStore.state.snoozeById, id);
  if (next !== threadSidebarStore.state.snoozeById) setSnoozes(next);
}

/** Opening a thread acknowledges a "Woke" notice (and a manual wake clears the snooze). */
export function markThreadOpened(id: string): void {
  const entry = threadSidebarStore.state.snoozeById[id];
  if (entry && (entry.wokeAt !== undefined || entry.until <= Date.now())) unsnoozeSession(id);
}

// --- Shelves ---

export function setShelfExpanded(shelf: ThreadShelf, expanded: boolean): void {
  threadSidebarStore.setState((prev) => ({ ...prev, shelfExpanded: { ...prev.shelfExpanded, [shelf]: expanded } }));
  writeJson(SHELF_KEYS[shelf], expanded);
}

// --- Deletion cleanup ---

/** Remove a deleted session's lifecycle entries (called from every delete path). */
export function notifySessionDeleted(id: string): void {
  const prev = threadSidebarStore.state;
  const next = {
    overrideById: omitKey(prev.overrideById, id),
    snoozeById: omitKey(prev.snoozeById, id),
    workingSinceById: omitKey(prev.workingSinceById, id),
    returnedAtById: omitKey(prev.returnedAtById, id),
  };
  if (
    next.overrideById === prev.overrideById &&
    next.snoozeById === prev.snoozeById &&
    next.workingSinceById === prev.workingSinceById &&
    next.returnedAtById === prev.returnedAtById
  ) {
    return;
  }
  threadSidebarStore.setState((state) => ({ ...state, ...next }));
  persistAll(next);
}

// --- Effective settled (shared rule: list, banner, agent switcher) ---

export function lifecycleContext(state: ThreadSidebarState, now: number): LifecycleContext {
  return {
    overrideById: state.overrideById,
    snoozeById: state.snoozeById,
    workingSinceById: state.workingSinceById,
    returnedAtById: state.returnedAtById,
    now,
    autoSettleAfterMs: daysToMs(state.lifecycleSettings.autoSettleDays),
  };
}

export function isSessionEffectivelySettled(session: UISession | undefined, now = Date.now()): boolean {
  if (!session) return false;
  return resolveSettled(session, lifecycleContext(threadSidebarStore.state, now)).settled;
}

/** Minute clock for consumers that only need coarse time (auto-settle). */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

/** React hook: effective settled state (manual or auto) for one session id. */
export function useIsSessionSettled(id: string | null | undefined): boolean {
  const now = useMinuteClock();
  const state = useSelector(threadSidebarStore);
  const session = useSelector(sessionStore, (s) =>
    id ? s.sessions.find((candidate) => candidate.id === id) : undefined,
  );
  if (!id) return false;
  if (!session) return state.overrideById[id]?.state === "settled";
  return resolveSettled(session, lifecycleContext(state, now)).settled;
}

export function useThreadSidebarStore() {
  const state = useSelector(threadSidebarStore);
  return {
    ...state,
    loadThreadSidebarEnabled,
    setThreadSidebarEnabled,
    loadThreadSidebarLifecycle,
    setThreadSidebarLifecycle,
  };
}
