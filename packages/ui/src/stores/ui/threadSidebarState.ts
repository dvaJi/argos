import type { UISession } from "./session";

/**
 * Pure thread-sidebar lifecycle-state helpers (no React, no store, no side
 * effects) — the testable core behind `stores/ui/threadSidebar.ts`
 * (docs/features/thread-sidebar-v3): storage parsing + legacy migration,
 * session-transition diffing (working-since, returned-at, early snooze wake),
 * and lifecycle-map pruning. View logic lives in
 * `components/threads/threadSidebarLogic.ts`.
 */

/** Timestamp map keyed by session id (ms). */
export type TimestampMap = Record<string, number>;

/**
 * Explicit lifecycle override (t3code `settledOverride`): `settled` is a
 * manual settle; `active` is a manual un-settle, which also exempts the
 * thread from auto-settle.
 */
export interface LifecycleOverride {
  state: "settled" | "active";
  /** When the override was set (ms); 0 = unknown (migrated legacy entry). */
  at: number;
}
export type OverrideMap = Record<string, LifecycleOverride>;

export interface SnoozeEntry {
  /** Scheduled wake time (ms). */
  until: number;
  /** When the thread was snoozed (ms); 0 = unknown (legacy entry). */
  at: number;
  /** Early wake (approval request / new failure) observed at (ms). */
  wokeAt?: number;
}
export type SnoozeMap = Record<string, SnoozeEntry>;

const WORKING = "working";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse persisted overrides. v3: `{ v: 3, byId: { id: { state, at } } }`.
 * Without a v3 record, migrate the legacy settled record (v2
 * `{ v: 2, byId: { id: ms } }` or v1 `{ id: true }`) into `settled` overrides.
 */
export function parseOverrideRecord(raw: unknown, legacySettled: unknown): OverrideMap {
  const next: OverrideMap = {};
  if (isRecord(raw) && raw.v === 3 && isRecord(raw.byId)) {
    for (const [id, entry] of Object.entries(raw.byId)) {
      if (!isRecord(entry)) continue;
      const state = entry.state;
      const at = entry.at;
      if ((state === "settled" || state === "active") && typeof at === "number" && at >= 0) {
        next[id] = { state, at };
      }
    }
    return next;
  }
  if (!isRecord(legacySettled)) return next;
  if (legacySettled.v === 2 && isRecord(legacySettled.byId)) {
    for (const [id, at] of Object.entries(legacySettled.byId)) {
      if (typeof at === "number" && at >= 0) next[id] = { state: "settled", at };
    }
    return next;
  }
  for (const [id, value] of Object.entries(legacySettled)) {
    if (value === true) next[id] = { state: "settled", at: 0 };
  }
  return next;
}

/**
 * Parse persisted snoozes. v2: `{ v: 2, byId: { id: { until, at, wokeAt? } } }`.
 * Legacy `{ id: untilMs }` migrates to `{ until, at: 0 }`.
 */
export function parseSnoozeRecord(raw: unknown): SnoozeMap {
  const next: SnoozeMap = {};
  if (!isRecord(raw)) return next;
  if (raw.v === 2 && isRecord(raw.byId)) {
    for (const [id, entry] of Object.entries(raw.byId)) {
      if (!isRecord(entry) || typeof entry.until !== "number" || entry.until <= 0) continue;
      const parsed: SnoozeEntry = { until: entry.until, at: typeof entry.at === "number" ? entry.at : 0 };
      if (typeof entry.wokeAt === "number" && entry.wokeAt > 0) parsed.wokeAt = entry.wokeAt;
      next[id] = parsed;
    }
    return next;
  }
  for (const [id, until] of Object.entries(raw)) {
    if (typeof until === "number" && until > 0) next[id] = { until, at: 0 };
  }
  return next;
}

export function parseTimestampRecord(raw: unknown): TimestampMap {
  const next: TimestampMap = {};
  if (!isRecord(raw)) return next;
  for (const [id, at] of Object.entries(raw)) {
    if (typeof at === "number" && at > 0) next[id] = at;
  }
  return next;
}

/** A snooze that has not woken yet (scheduled or early). */
export function isSnoozePending(entry: SnoozeEntry | undefined, now: number): boolean {
  return entry !== undefined && entry.wokeAt === undefined && entry.until > now;
}

export interface TransitionMaps {
  overrideById: OverrideMap;
  workingSinceById: TimestampMap;
  returnedAtById: TimestampMap;
  snoozeById: SnoozeMap;
}

export interface TransitionResult {
  next: TransitionMaps;
  changed: boolean;
}

/** Copy-on-write record updates: the first write copies, later writes reuse the copy. */
function cowRecord<T>(source: Record<string, T>) {
  let value = source;
  return {
    get: () => value,
    set(id: string, entry: T | null) {
      if (value === source) value = { ...source };
      if (entry === null) delete value[id];
      else value[id] = entry;
    },
  };
}

/**
 * Diff session-status transitions into the lifecycle maps.
 *
 *  - Turn start (a session observed entering `working`): `workingSince = now`
 *    (the last send) and any settle/un-settle override is cleared — t3code
 *    clears `settledOverride` on every turn start, wherever it came from
 *    (composer, retry, queued follow-up, agent continuation).
 *  - Turn end (known session leaving `working`): `returnedAt = now`, so the
 *    thread resurfaces at the top of the Active inbox.
 *  - First observation (startup / newly paged): a working session keeps its
 *    persisted working-since (restart survival) or seeds from `updatedAt`; its
 *    override is cleared only if the turn evidently started after it. A
 *    non-working session that was persisted as working finished while the app
 *    was closed → `returnedAt` stamped. A session with no `returnedAt` is
 *    seeded once from `updatedAt`, so a cold start already has an inbox order
 *    (seeded only when absent: later view/pin bumps of `updatedAt` never
 *    reorder anything).
 *  - Pending snooze + `blocked` (approval request), or a known session newly
 *    entering `error`: early wake (`wokeAt = now`), t3code's
 *    threadRaisedHandWhileSnoozed.
 */
export function diffSessionTransitions(
  current: readonly Pick<UISession, "id" | "status" | "updatedAt">[],
  previous: readonly Pick<UISession, "id" | "status">[],
  maps: TransitionMaps,
  now: number,
): TransitionResult {
  const prevStatusById = new Map(previous.map((session) => [session.id, session.status]));
  const overrides = cowRecord(maps.overrideById);
  const working = cowRecord(maps.workingSinceById);
  const returned = cowRecord(maps.returnedAtById);
  const snoozes = cowRecord(maps.snoozeById);

  for (const session of current) {
    const previousStatus = prevStatusById.get(session.id);
    const firstObservation = previousStatus === undefined;
    const isWorking = session.status === WORKING;
    const persistedSince = working.get()[session.id];
    const override = overrides.get()[session.id];

    if (isWorking && previousStatus !== WORKING) {
      if (firstObservation) {
        const since =
          typeof persistedSince === "number" && persistedSince > 0
            ? persistedSince
            : session.updatedAt > 0
              ? session.updatedAt
              : now;
        if (since !== persistedSince) working.set(session.id, since);
        if (override && since > override.at) overrides.set(session.id, null);
      } else {
        working.set(session.id, now);
        if (override) overrides.set(session.id, null);
      }
    } else if (!isWorking && previousStatus === WORKING) {
      if (persistedSince !== undefined) working.set(session.id, null);
      returned.set(session.id, now);
    } else if (!isWorking && firstObservation) {
      if (persistedSince !== undefined) {
        working.set(session.id, null);
        returned.set(session.id, Math.max(session.updatedAt, persistedSince));
      } else if (returned.get()[session.id] === undefined && session.updatedAt > 0) {
        returned.set(session.id, session.updatedAt);
      }
    }

    const snooze = snoozes.get()[session.id];
    if (snooze && isSnoozePending(snooze, now)) {
      const raisedHand =
        session.status === "blocked" || (session.status === "error" && !firstObservation && previousStatus !== "error");
      if (raisedHand) snoozes.set(session.id, { ...snooze, wokeAt: now });
    }
  }

  const next: TransitionMaps = {
    overrideById: overrides.get(),
    workingSinceById: working.get(),
    returnedAtById: returned.get(),
    snoozeById: snoozes.get(),
  };
  const changed =
    next.overrideById !== maps.overrideById ||
    next.workingSinceById !== maps.workingSinceById ||
    next.returnedAtById !== maps.returnedAtById ||
    next.snoozeById !== maps.snoozeById;
  return { next, changed };
}

/** Copy of `map` without `id`; same reference when the id is absent. */
export function omitKey<T>(map: Record<string, T>, id: string): Record<string, T> {
  if (!(id in map)) return map;
  const next = { ...map };
  delete next[id];
  return next;
}

export interface ThreadLifecycleMaps {
  overrideById: OverrideMap;
  snoozeById: SnoozeMap;
  workingSinceById: TimestampMap;
  returnedAtById: TimestampMap;
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
  const prune = <T>(map: Record<string, T>): Record<string, T> => {
    let pruned: Record<string, T> | null = null;
    for (const id of Object.keys(map)) {
      if (knownIds.has(id)) continue;
      if (!pruned) pruned = { ...map };
      delete pruned[id];
    }
    return pruned ?? map;
  };
  const next: ThreadLifecycleMaps = {
    overrideById: prune(maps.overrideById),
    snoozeById: prune(maps.snoozeById),
    workingSinceById: prune(maps.workingSinceById),
    returnedAtById: prune(maps.returnedAtById),
  };
  const changed =
    next.overrideById !== maps.overrideById ||
    next.snoozeById !== maps.snoozeById ||
    next.workingSinceById !== maps.workingSinceById ||
    next.returnedAtById !== maps.returnedAtById;
  return { next, changed };
}
