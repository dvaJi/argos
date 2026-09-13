import { Store } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";
import { createConfigClient } from "../../../api/ConfigClient";
import { sessionStore, type UISession } from "./session";
import {
  diffWorkingTransitions,
  omitKey,
  parseSettledRecord,
  pruneLifecycleEntries,
  type SettledAtMap,
  type SnoozedUntilMap,
} from "./threadSidebarState";

/**
 * Thread sidebar experiment state (v2, t3code parity —
 * docs/features/thread-sidebar-t3-parity; fixes in docs/issues/thread-sidebar-fixes,
 * polish in docs/features/thread-sidebar-polish).
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
 *  - `settledShelfExpanded` / `snoozedShelfExpanded`: shelf collapse states.
 *
 * Pure pieces of this module (storage parsing, working-since diffing,
 * pruning) live in `threadSidebarState.ts` for direct unit testing.
 */

const THREAD_SIDEBAR_ENABLED_KEY = "thread_sidebar_enabled";
const SETTLED_STORAGE_KEY = "argos:thread-sidebar:settled";
const SNOOZED_STORAGE_KEY = "argos:thread-sidebar:snoozed";
const SETTLED_SHELF_EXPANDED_KEY = "argos:thread-sidebar:settled-expanded";
const SNOOZED_SHELF_EXPANDED_KEY = "argos:thread-sidebar:snoozed-expanded";
const WORKING_SINCE_STORAGE_KEY = "argos:thread-sidebar:working-since";

const LIFECYCLE_STORAGE_KEYS = new Set([
  SETTLED_STORAGE_KEY,
  SNOOZED_STORAGE_KEY,
  SETTLED_SHELF_EXPANDED_KEY,
  SNOOZED_SHELF_EXPANDED_KEY,
]);

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

function loadSettledFromStorage(): SettledAtMap {
  return parseSettledRecord(readJson<unknown>(SETTLED_STORAGE_KEY));
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

function loadShelfExpanded(key: string): boolean {
  const raw = readJson<boolean>(key);
  // t3code defaults both shelves to expanded.
  return typeof raw === "boolean" ? raw : true;
}

function persistWorkingSince(workingSinceById: Record<string, number>): void {
  writeJson(WORKING_SINCE_STORAGE_KEY, workingSinceById);
}

export const threadSidebarStore = new Store<{
  enabled: boolean;
  enabledLoaded: boolean;
  workingSinceById: Record<string, number>;
  settledAtById: SettledAtMap;
  snoozedUntilById: SnoozedUntilMap;
  settledShelfExpanded: boolean;
  snoozedShelfExpanded: boolean;
}>({
  enabled: false,
  enabledLoaded: false,
  workingSinceById: (() => {
    // Drop persisted entries for sessions that are no longer working at load
    // time. Sessions usually load after this module initializes, so entries
    // for still-working sessions are kept here and re-validated by the
    // first-observation diff below once the session list arrives.
    const persisted = readJson<Record<string, unknown>>(WORKING_SINCE_STORAGE_KEY);
    const next: Record<string, number> = {};
    if (!persisted) return next;
    for (const [id, since] of Object.entries(persisted)) {
      if (typeof since === "number" && since > 0) next[id] = since;
    }
    return next;
  })(),
  settledAtById: loadSettledFromStorage(),
  snoozedUntilById: loadSnoozedFromStorage(),
  settledShelfExpanded: loadShelfExpanded(SETTLED_SHELF_EXPANDED_KEY),
  snoozedShelfExpanded: loadShelfExpanded(SNOOZED_SHELF_EXPANDED_KEY),
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

if (typeof window !== "undefined") {
  // Reflect session-status flips into workingSinceById. TanStack Store's
  // `subscribe(fn)` only receives the new state, so we keep a closure
  // reference to the previous `sessions` array to diff transitions. The diff
  // is first-observation-aware: the first loaded batch keeps persisted
  // working-since values instead of resetting them to `now` (restart
  // survival — see diffWorkingTransitions).
  let previousSessions: UISession[] = sessionStore.state.sessions;
  let lifecycleSwept = false;
  sessionStore.subscribe((state) => {
    const working = diffWorkingTransitions(
      state.sessions,
      previousSessions,
      threadSidebarStore.state.workingSinceById,
      Date.now(),
    );
    previousSessions = state.sessions;
    if (working.changed) {
      threadSidebarStore.setState((prev) => ({ ...prev, workingSinceById: working.next }));
      persistWorkingSince(working.next);
    }
    // One-time sweep once the whole history is loaded: drop lifecycle
    // entries for sessions that no longer exist. Never sweep while pages
    // remain unloaded — with paging, an absent id is not proof of deletion.
    if (!lifecycleSwept && state.sessions.length > 0 && !state.hasMore) {
      lifecycleSwept = true;
      const knownIds = new Set(state.sessions.map((session) => session.id));
      const pruned = pruneLifecycleEntries(
        {
          settledAtById: threadSidebarStore.state.settledAtById,
          snoozedUntilById: threadSidebarStore.state.snoozedUntilById,
          workingSinceById: working.changed ? working.next : threadSidebarStore.state.workingSinceById,
        },
        knownIds,
      );
      if (pruned.changed) {
        threadSidebarStore.setState((prev) => ({ ...prev, ...pruned.next }));
        writeJson(SETTLED_STORAGE_KEY, { v: 2, byId: pruned.next.settledAtById });
        writeJson(SNOOZED_STORAGE_KEY, pruned.next.snoozedUntilById);
        persistWorkingSince(pruned.next.workingSinceById);
      }
    }
  });

  // Cross-window sync: `storage` events fire only in *other* windows, so the
  // writing window never loops. workingSinceById is intentionally not synced
  // (per-window timing would fight the transition diff above).
  window.addEventListener("storage", (event) => {
    if (event.key !== null && !LIFECYCLE_STORAGE_KEYS.has(event.key)) return;
    threadSidebarStore.setState((prev) => ({
      ...prev,
      settledAtById: loadSettledFromStorage(),
      snoozedUntilById: loadSnoozedFromStorage(),
      settledShelfExpanded: loadShelfExpanded(SETTLED_SHELF_EXPANDED_KEY),
      snoozedShelfExpanded: loadShelfExpanded(SNOOZED_SHELF_EXPANDED_KEY),
    }));
  });
}

// --- Settle (t3code: explicit lifecycle action; settles sort by settledAt) ---

export function settleSession(id: string): void {
  const at = Date.now();
  const next: SettledAtMap = { ...threadSidebarStore.state.settledAtById, [id]: at };
  threadSidebarStore.setState((prev) => ({ ...prev, settledAtById: next }));
  writeJson(SETTLED_STORAGE_KEY, { v: 2, byId: next });
}

export function unsettleSession(id: string): void {
  if (!(id in threadSidebarStore.state.settledAtById)) return;
  const next: SettledAtMap = omitKey(threadSidebarStore.state.settledAtById, id);
  threadSidebarStore.setState((prev) => ({ ...prev, settledAtById: next }));
  writeJson(SETTLED_STORAGE_KEY, { v: 2, byId: next });
}

/**
 * Lifecycle cleanup for a deleted session: remove its settled/snoozed/
 * working-since entries from state and storage. Called from every delete
 * path (experiment rows and the original sidebar's delete dialog).
 */
export function notifySessionDeleted(id: string): void {
  const prev = threadSidebarStore.state;
  const settledAtById = omitKey(prev.settledAtById, id);
  const snoozedUntilById = omitKey(prev.snoozedUntilById, id);
  const workingSinceById = omitKey(prev.workingSinceById, id);
  if (
    settledAtById === prev.settledAtById &&
    snoozedUntilById === prev.snoozedUntilById &&
    workingSinceById === prev.workingSinceById
  ) {
    return;
  }
  threadSidebarStore.setState((state) => ({ ...state, settledAtById, snoozedUntilById, workingSinceById }));
  writeJson(SETTLED_STORAGE_KEY, { v: 2, byId: settledAtById });
  writeJson(SNOOZED_STORAGE_KEY, snoozedUntilById);
  persistWorkingSince(workingSinceById);
}

/** Settled at ms (0 = legacy entry with unknown time), or undefined when not settled. */
export function getSettledAt(id: string): number | undefined {
  const at = threadSidebarStore.state.settledAtById[id];
  return typeof at === "number" ? at : undefined;
}

/** React hook: subscribe to the settled flag for a single session id. */
export function useIsSessionSettled(id: string | null | undefined): boolean {
  const settledAtById = useSelector(threadSidebarStore, (s) => s.settledAtById);
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
  const next: SnoozedUntilMap = omitKey(threadSidebarStore.state.snoozedUntilById, id);
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

// --- Shelf collapse states ---

export function setSettledShelfExpanded(expanded: boolean): void {
  threadSidebarStore.setState((prev) => ({ ...prev, settledShelfExpanded: expanded }));
  writeJson(SETTLED_SHELF_EXPANDED_KEY, expanded);
}

export function setSnoozedShelfExpanded(expanded: boolean): void {
  threadSidebarStore.setState((prev) => ({ ...prev, snoozedShelfExpanded: expanded }));
  writeJson(SNOOZED_SHELF_EXPANDED_KEY, expanded);
}

export function useThreadSidebarStore() {
  const state = useSelector(threadSidebarStore);
  return {
    ...state,
    loadThreadSidebarEnabled,
    setThreadSidebarEnabled,
  };
}
