import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createConfigClient } from "../../../api/ConfigClient";
import { sessionStore, type UISession } from "./session";

/**
 * Thread sidebar experiment state (v2, t3code parity —
 * docs/features/thread-sidebar-t3-parity).
 *
 * When enabled, the main left sidebar renders a t3code-style thread
 * lifecycle view (Pinned / Active / Snoozed / Settled) instead of the
 * agent/project history grouping. The flag is daemon-persisted
 * (`thread_sidebar_enabled` config entry), off by default, toggled from
 * Settings → Appearance.
 *
 * Client-side lifecycle state (the experiment has no daemon schema):
 *  - `settledAtById`: settled flag + timestamp per session (v2 storage; v1
 *    boolean values migrate to timestamp 0 = unknown, sorted by updatedAt).
 *  - `snoozedUntilById`: absolute wake time per session. UI-only snooze —
 *    wake evaluation happens in the renderer; entries are kept after waking
 *    so rows can show a "Woke" pill until the thread is opened.
 *  - `workingSinceById`: persisted so the live "Working Ns" pill survives
 *    restarts instead of resetting to 0s.
 *  - `settledShelfExpanded`: settled shelf collapse state (t3code parity).
 */

const THREAD_SIDEBAR_ENABLED_KEY = "thread_sidebar_enabled";
const SETTLED_STORAGE_KEY = "argos:thread-sidebar:settled";
const SNOOZED_STORAGE_KEY = "argos:thread-sidebar:snoozed";
const SETTLED_SHELF_EXPANDED_KEY = "argos:thread-sidebar:settled-expanded";
const WORKING_SINCE_STORAGE_KEY = "argos:thread-sidebar:working-since";

type SettledAtMap = Record<string, number>;
type SnoozedUntilMap = Record<string, number>;

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
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

/** v2: { v: 2, byId: { id: settledAtMs } }. v1 booleans migrate to 0 (unknown). */
function loadSettledFromStorage(): SettledAtMap {
  const raw = readJson<unknown>(SETTLED_STORAGE_KEY);
  const next: SettledAtMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return next;
  const record = raw as Record<string, unknown>;
  if (record.v === 2 && record.byId && typeof record.byId === "object") {
    for (const [id, at] of Object.entries(record.byId as Record<string, unknown>)) {
      if (typeof at === "number" && at >= 0) next[id] = at;
    }
    return next;
  }
  // v1: { id: true }
  for (const [id, value] of Object.entries(record)) {
    if (value === true) next[id] = 0;
  }
  return next;
}

function persistSettled(settledAtById: SettledAtMap): void {
  writeJson(SETTLED_STORAGE_KEY, { v: 2, byId: settledAtById });
}

function loadSnoozedFromStorage(): SnoozedUntilMap {
  const raw = readJson<Record<string, unknown>>(SNOOZED_STORAGE_KEY);
  const next: SnoozedUntilMap = {};
  if (!raw) return next;
  for (const [id, until] of Object.entries(raw)) {
    if (typeof until === "number" && until > 0) next[id] = until;
  }
  return next;
}

function loadSettledShelfExpanded(): boolean {
  const raw = readJson<boolean>(SETTLED_SHELF_EXPANDED_KEY);
  // t3code defaults the settled shelf to expanded.
  return typeof raw === "boolean" ? raw : true;
}

function loadWorkingSinceFromStorage(): Record<string, number> {
  const raw = readJson<Record<string, unknown>>(WORKING_SINCE_STORAGE_KEY);
  const next: Record<string, number> = {};
  if (!raw) return next;
  for (const [id, since] of Object.entries(raw)) {
    if (typeof since === "number" && since > 0) next[id] = since;
  }
  return next;
}

export const threadSidebarStore = new Store<{
  enabled: boolean;
  enabledLoaded: boolean;
  workingSinceById: Record<string, number>;
  tick: number;
  settledAtById: SettledAtMap;
  snoozedUntilById: SnoozedUntilMap;
  settledShelfExpanded: boolean;
}>({
  enabled: false,
  enabledLoaded: false,
  workingSinceById: loadWorkingSinceFromStorage(),
  tick: 0,
  settledAtById: loadSettledFromStorage(),
  snoozedUntilById: loadSnoozedFromStorage(),
  settledShelfExpanded: loadSettledShelfExpanded(),
});

const configClient = createConfigClient();

// Live-sync the experiment flag: the daemon/desktop publish
// `config.entries.changed` after `config.updateEntries`, so a toggle in
// the settings window applies to the main window immediately (no restart).
if (typeof window !== "undefined") {
  configClient.onEntriesChanged((payload) => {
    if (payload.changedKeys.includes(THREAD_SIDEBAR_ENABLED_KEY)) {
      void loadThreadSidebarEnabled();
    }
  });
}

export async function loadThreadSidebarEnabled(): Promise<void> {
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

const WORKING_STATUS = "working" as const;

function persistWorkingSince(workingSinceById: Record<string, number>): void {
  writeJson(WORKING_SINCE_STORAGE_KEY, workingSinceById);
}

function recordWorkingTransition(current: UISession[], previous: UISession[]): boolean {
  if (current === previous) return false;
  const prevById = new Map(previous.map((s) => [s.id, s.status]));
  const next: Record<string, number> = { ...threadSidebarStore.state.workingSinceById };
  let changed = false;
  const now = Date.now();
  for (const session of current) {
    const previousStatus = prevById.get(session.id);
    if (session.status === WORKING_STATUS && previousStatus !== WORKING_STATUS) {
      next[session.id] = now;
      changed = true;
    } else if (session.status !== WORKING_STATUS && previousStatus === WORKING_STATUS) {
      delete next[session.id];
      changed = true;
    }
  }
  if (!changed) return false;
  threadSidebarStore.setState((prev) => ({ ...prev, workingSinceById: next }));
  persistWorkingSince(next);
  return true;
}

if (typeof window !== "undefined") {
  // Seed working-since on first import: prefer the persisted value (survives
  // restarts), fall back to the session's updatedAt — better than resetting
  // the pill to "0s" for a turn that has been running for minutes.
  const persisted = threadSidebarStore.state.workingSinceById;
  const seed: Record<string, number> = { ...persisted };
  const sessionsById = new Map(sessionStore.state.sessions.map((s) => [s.id, s]));
  for (const id of Object.keys(seed)) {
    const session = sessionsById.get(id);
    if (session && session.status === WORKING_STATUS) continue;
    // Drop entries for sessions that are no longer working.
    delete seed[id];
  }
  for (const session of sessionStore.state.sessions) {
    if (session.status === WORKING_STATUS && seed[session.id] === undefined) {
      seed[session.id] = session.updatedAt || Date.now();
    }
  }
  threadSidebarStore.setState((prev) => ({ ...prev, workingSinceById: seed }));
  persistWorkingSince(seed);

  // Reflect subsequent status flips. TanStack Store's `subscribe(fn)` only
  // receives the new state, so we keep a closure reference to the previous
  // `sessions` array to diff status transitions.
  let previousSessions: UISession[] = sessionStore.state.sessions;
  sessionStore.subscribe((state) => {
    recordWorkingTransition(state.sessions, previousSessions);
    previousSessions = state.sessions;
  });
}

/** Bump the tick to force a re-render of live pills (working elapsed, wake countdowns). */
export function bumpThreadSidebarTick(): void {
  threadSidebarStore.setState((prev) => ({ ...prev, tick: (prev.tick + 1) % 1_000_000 }));
}

// --- Settle (t3code: explicit lifecycle action; settles sort by settledAt) ---

export function settleSession(id: string): void {
  const at = Date.now();
  const next: SettledAtMap = { ...threadSidebarStore.state.settledAtById, [id]: at };
  threadSidebarStore.setState((prev) => ({ ...prev, settledAtById: next }));
  persistSettled(next);
}

export function unsettleSession(id: string): void {
  if (!(id in threadSidebarStore.state.settledAtById)) return;
  const next: SettledAtMap = { ...threadSidebarStore.state.settledAtById };
  delete next[id];
  threadSidebarStore.setState((prev) => ({ ...prev, settledAtById: next }));
  persistSettled(next);
}

/** Settled at ms (0 = legacy entry with unknown time), or undefined when not settled. */
export function getSettledAt(id: string): number | undefined {
  const at = threadSidebarStore.state.settledAtById[id];
  return typeof at === "number" ? at : undefined;
}

/** React hook: subscribe to the settled flag for a single session id. */
export function useIsSessionSettled(id: string | null | undefined): boolean {
  const settledAtById = useStore(threadSidebarStore, (s) => s.settledAtById);
  if (!id) return false;
  return id in settledAtById;
}

// --- Snooze (UI-only: wake evaluation happens in the renderer) ---

export function snoozeSession(id: string, durationMs: number): void {
  const until = Date.now() + durationMs;
  const next: SnoozedUntilMap = { ...threadSidebarStore.state.snoozedUntilById, [id]: until };
  threadSidebarStore.setState((prev) => ({ ...prev, snoozedUntilById: next }));
  writeJson(SNOOZED_STORAGE_KEY, next);
}

export function unsnoozeSession(id: string): void {
  if (!(id in threadSidebarStore.state.snoozedUntilById)) return;
  const next: SnoozedUntilMap = { ...threadSidebarStore.state.snoozedUntilById };
  delete next[id];
  threadSidebarStore.setState((prev) => ({ ...prev, snoozedUntilById: next }));
  writeJson(SNOOZED_STORAGE_KEY, next);
}

/**
 * A session is "woke" when its snooze entry exists but the wake time has
 * passed. The entry is intentionally kept until `markThreadOpened` so the row
 * can show the "Woke" pill.
 */
export function isSessionWoke(id: string, now: number): boolean {
  const until = threadSidebarStore.state.snoozedUntilById[id];
  return typeof until === "number" && until <= now;
}

export function markThreadOpened(id: string): void {
  unsnoozeSession(id);
}

// --- Settled shelf collapse state ---

export function setSettledShelfExpanded(expanded: boolean): void {
  threadSidebarStore.setState((prev) => ({ ...prev, settledShelfExpanded: expanded }));
  writeJson(SETTLED_SHELF_EXPANDED_KEY, expanded);
}

export function useThreadSidebarStore() {
  const state = useStore(threadSidebarStore);
  return {
    ...state,
    loadThreadSidebarEnabled,
    setThreadSidebarEnabled,
  };
}
