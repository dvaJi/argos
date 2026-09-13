import type { UISession } from "./session";

/**
 * Pure thread-sidebar lifecycle-state helpers (no React, no store, no side
 * effects) — the testable core behind `stores/ui/threadSidebar.ts`:
 * settled-storage parsing (v1→v2), working-since transition diffing, and
 * lifecycle-map pruning. View logic lives in
 * `components/threads/threadSidebarLogic.ts`.
 */

/** Timestamp map keyed by session id (ms). */
export type TimestampMap = Record<string, number>;
export type SettledAtMap = TimestampMap;
export type SnoozedUntilMap = TimestampMap;

export const WORKING_STATUS = "working" as const;

/**
 * Parse the persisted settled record. v2: `{ v: 2, byId: { id: settledAtMs } }`.
 * v1: `{ id: true }` booleans migrate to 0 (unknown settled time, sorted by
 * updatedAt downstream).
 */
export function parseSettledRecord(raw: unknown): SettledAtMap {
  const next: SettledAtMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return next;
  const record = raw as Record<string, unknown>;
  if (record.v === 2 && record.byId && typeof record.byId === "object" && !Array.isArray(record.byId)) {
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

export interface WorkingTransitionResult {
  next: TimestampMap;
  changed: boolean;
}

/**
 * Diff session-status transitions into the persisted working-since map.
 *
 * Semantics:
 *  - First observation of a session (id absent from `previous`): a working
 *    session keeps its persisted elapsed time (restart survival) or seeds from
 *    `updatedAt`; a non-working session drops any stale persisted entry. This
 *    is what makes the "Working Ns" pill survive restarts — sessions load
 *    asynchronously after this module initializes, so the first batch must not
 *    stamp `now` over persisted values.
 *  - Known session transitioning into `working`: fresh `now` stamp.
 *  - Known session leaving `working`: entry removed.
 */
export function diffWorkingTransitions(
  current: readonly Pick<UISession, "id" | "status" | "updatedAt">[],
  previous: readonly Pick<UISession, "id" | "status">[],
  existing: TimestampMap,
  now: number,
): WorkingTransitionResult {
  const prevStatusById = new Map(previous.map((session) => [session.id, session.status]));
  const next: TimestampMap = { ...existing };
  let changed = false;
  for (const session of current) {
    const previousStatus = prevStatusById.get(session.id);
    if (session.status === WORKING_STATUS && previousStatus !== WORKING_STATUS) {
      if (previousStatus === undefined) {
        const persisted = next[session.id];
        if (typeof persisted !== "number" || persisted <= 0) {
          next[session.id] = session.updatedAt > 0 ? session.updatedAt : now;
          changed = true;
        }
      } else {
        next[session.id] = now;
        changed = true;
      }
    } else if (session.status !== WORKING_STATUS && previousStatus === WORKING_STATUS) {
      delete next[session.id];
      changed = true;
    } else if (previousStatus === undefined && session.status !== WORKING_STATUS && session.id in next) {
      delete next[session.id];
      changed = true;
    }
  }
  return { next, changed };
}

export interface ThreadLifecycleMaps {
  settledAtById: SettledAtMap;
  snoozedUntilById: SnoozedUntilMap;
  workingSinceById: TimestampMap;
}

/** Copy of `map` without `id`; same reference when the id is absent. */
export function omitKey(map: TimestampMap, id: string): TimestampMap {
  if (!(id in map)) return map;
  const next = { ...map };
  delete next[id];
  return next;
}

export interface PruneResult {
  next: ThreadLifecycleMaps;
  changed: boolean;
}

/**
 * Drop lifecycle entries for session ids that are no longer known. Only call
 * with the *complete* id set (never a partial page) — an absent id is only
 * proof of deletion once the whole history is loaded.
 */
export function pruneLifecycleEntries(maps: ThreadLifecycleMaps, knownIds: ReadonlySet<string>): PruneResult {
  const prune = (map: TimestampMap): TimestampMap => {
    let pruned: TimestampMap | null = null;
    for (const id of Object.keys(map)) {
      if (knownIds.has(id)) continue;
      if (!pruned) pruned = { ...map };
      delete pruned[id];
    }
    return pruned ?? map;
  };
  const settledAtById = prune(maps.settledAtById);
  const snoozedUntilById = prune(maps.snoozedUntilById);
  const workingSinceById = prune(maps.workingSinceById);
  const changed =
    settledAtById !== maps.settledAtById ||
    snoozedUntilById !== maps.snoozedUntilById ||
    workingSinceById !== maps.workingSinceById;
  return { next: { settledAtById, snoozedUntilById, workingSinceById }, changed };
}
