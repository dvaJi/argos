import type { UISession } from "#/stores/ui/session";
import {
  isSnoozePending,
  type OverrideMap,
  type SnoozeEntry,
  type SnoozeMap,
  type TimestampMap,
} from "#/stores/ui/threadSidebarState";

/**
 * Pure thread-sidebar view logic, mirroring t3code's Sidebar.logic.ts /
 * threadInbox.ts / threadSettled.ts (docs/features/thread-sidebar-v3):
 * lifecycle resolution, five-section partitioning, inbox sorting, row status,
 * snooze presets and labels. No React, no store, no side effects.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** t3code's server default (`sidebarAutoSettleAfterDays = 7`). */
export const AUTO_SETTLE_AFTER_MS = 7 * DAY_MS;

export type ThreadSectionId = "pinned" | "active" | "working" | "snoozed" | "settled";

/** Lifecycle timers in days; null = off (docs/features/thread-archive). */
export interface LifecycleSettings {
  autoSettleDays: number | null;
  autoArchiveDays: number | null;
  autoDeleteDays: number | null;
}

export const DEFAULT_LIFECYCLE_SETTINGS: LifecycleSettings = {
  autoSettleDays: 7,
  autoArchiveDays: 30,
  autoDeleteDays: null,
};

/** Day choices offered in Settings (null = Off). */
export const LIFECYCLE_DAY_OPTIONS = [1, 3, 7, 14, 30, 90] as const;

/** Tolerant parse of the persisted config entry; missing fields take defaults, invalid values turn off. */
export function normalizeLifecycleSettings(raw: unknown): LifecycleSettings {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const days = (key: keyof LifecycleSettings): number | null => {
    if (!(key in record)) return DEFAULT_LIFECYCLE_SETTINGS[key];
    const value = record[key];
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
  };
  return {
    autoSettleDays: days("autoSettleDays"),
    autoArchiveDays: days("autoArchiveDays"),
    autoDeleteDays: days("autoDeleteDays"),
  };
}

export function daysToMs(days: number | null): number | null {
  return days === null ? null : days * DAY_MS;
}

export interface LifecycleContext {
  overrideById: OverrideMap;
  snoozeById: SnoozeMap;
  workingSinceById: TimestampMap;
  returnedAtById: TimestampMap;
  now: number;
  /** Defaults to AUTO_SETTLE_AFTER_MS; null disables auto-settle. */
  autoSettleAfterMs?: number | null;
}

type LifecycleSession = Pick<UISession, "id" | "status" | "isPinned" | "createdAt" | "updatedAt">;

export function isSidebarVisibleSession(session: Pick<UISession, "isDraft" | "sessionKind">): boolean {
  return !session.isDraft && (session.sessionKind ?? "regular") === "regular";
}

/** When a snooze ended (scheduled or early), or null while pending / absent. */
export function snoozeWokeAt(entry: SnoozeEntry | undefined, now: number): number | null {
  if (!entry) return null;
  if (entry.wokeAt !== undefined) return entry.wokeAt;
  return entry.until <= now ? entry.until : null;
}

/**
 * Last observed activity: created, last send (working-since), run returned,
 * snooze woke. `updatedAt` is deliberately excluded — the daemon bumps it on
 * view/rename/pin, so it would reshuffle the inbox when a thread is opened.
 */
export function lastActivityAt(session: LifecycleSession, ctx: LifecycleContext): number {
  return Math.max(
    session.createdAt,
    ctx.workingSinceById[session.id] ?? 0,
    ctx.returnedAtById[session.id] ?? 0,
    snoozeWokeAt(ctx.snoozeById[session.id], ctx.now) ?? 0,
  );
}

/** t3code sortInboxThreadsByReturn key: activity or a manual un-settle. */
export function returnAt(session: LifecycleSession, ctx: LifecycleContext): number {
  const override = ctx.overrideById[session.id];
  return Math.max(lastActivityAt(session, ctx), override?.state === "active" ? override.at : 0);
}

export interface SettledState {
  settled: boolean;
  /** Settled time for ordering/labels (0 = unknown legacy time). */
  settledAt: number;
  /** True when settled by inactivity rather than a manual settle. */
  auto: boolean;
}

const NOT_SETTLED: SettledState = { settled: false, settledAt: 0, auto: false };

/**
 * Effective settled state — the single rule shared by the list, the chat
 * banner and the agent switcher. A manual override wins; otherwise a thread
 * auto-settles after `autoSettleAfterMs` of inactivity unless it is pinned,
 * working, awaiting approval, or snoozed (t3code isAutoSettlementCandidate).
 * The inactivity clock falls back to `updatedAt` so threads active before
 * lifecycle tracking existed are not settled on first sight.
 */
export function resolveSettled(session: LifecycleSession, ctx: LifecycleContext): SettledState {
  const override = ctx.overrideById[session.id];
  if (override?.state === "settled") return { settled: true, settledAt: override.at || session.updatedAt, auto: false };
  if (override?.state === "active") return NOT_SETTLED;
  const after = ctx.autoSettleAfterMs === undefined ? AUTO_SETTLE_AFTER_MS : ctx.autoSettleAfterMs;
  if (after === null) return NOT_SETTLED;
  if (session.isPinned || session.status === "working" || session.status === "blocked") return NOT_SETTLED;
  if (isSnoozePending(ctx.snoozeById[session.id], ctx.now)) return NOT_SETTLED;
  const inactiveSince = Math.max(lastActivityAt(session, ctx), session.updatedAt);
  if (ctx.now - inactiveSince <= after) return NOT_SETTLED;
  return { settled: true, settledAt: inactiveSince, auto: true };
}

export interface ThreadSections {
  pinned: UISession[];
  active: UISession[];
  working: UISession[];
  snoozed: UISession[];
  settled: UISession[];
}

/**
 * t3code partitionSidebarThreads: precedence snoozed > settled > pinned >
 * working/active. Active is the inbox (newest return first); Working holds
 * running threads (newest send first); Snoozed by wake time; Settled by
 * settled time.
 */
export function partitionThreads(sessions: readonly UISession[], ctx: LifecycleContext): ThreadSections {
  const sections: ThreadSections = { pinned: [], active: [], working: [], snoozed: [], settled: [] };
  const settledAt = new Map<string, number>();
  for (const session of sessions) {
    if (!isSidebarVisibleSession(session)) continue;
    if (isSnoozePending(ctx.snoozeById[session.id], ctx.now)) {
      sections.snoozed.push(session);
      continue;
    }
    const settled = resolveSettled(session, ctx);
    if (settled.settled) {
      settledAt.set(session.id, settled.settledAt);
      sections.settled.push(session);
    } else if (session.isPinned) {
      sections.pinned.push(session);
    } else if (session.status === "working") {
      sections.working.push(session);
    } else {
      sections.active.push(session);
    }
  }
  const byDesc = (key: (session: UISession) => number) => (a: UISession, b: UISession) =>
    key(b) - key(a) || a.id.localeCompare(b.id);
  sections.pinned.sort(byDesc((session) => session.createdAt));
  sections.active.sort(byDesc((session) => returnAt(session, ctx)));
  sections.working.sort(byDesc((session) => Math.max(session.createdAt, ctx.workingSinceById[session.id] ?? 0)));
  sections.snoozed.sort(
    (a, b) => (ctx.snoozeById[a.id]?.until ?? 0) - (ctx.snoozeById[b.id]?.until ?? 0) || a.id.localeCompare(b.id),
  );
  sections.settled.sort(byDesc((session) => settledAt.get(session.id) ?? 0));
  return sections;
}

export interface LifecycleSweepPlan {
  archive: string[];
  delete: string[];
}

/**
 * Settle → archive → delete timers. `sessions` must be UI-mapped (daemon
 * `generating` → `working`) and include archived sessions. The open session
 * is never archived or deleted; neither are pinned, working or blocked ones.
 */
export function planLifecycleSweep(
  sessions: readonly UISession[],
  ctx: LifecycleContext,
  settings: LifecycleSettings,
  activeSessionId: string | null,
): LifecycleSweepPlan {
  const plan: LifecycleSweepPlan = { archive: [], delete: [] };
  const archiveAfter = daysToMs(settings.autoArchiveDays);
  const deleteAfter = daysToMs(settings.autoDeleteDays);
  for (const session of sessions) {
    if (!isSidebarVisibleSession(session) || session.id === activeSessionId) continue;
    if (session.archivedAt) {
      if (deleteAfter !== null && ctx.now - session.archivedAt > deleteAfter) plan.delete.push(session.id);
      continue;
    }
    if (archiveAfter === null) continue;
    if (session.isPinned || session.status === "working" || session.status === "blocked") continue;
    const settled = resolveSettled(session, ctx);
    if (!settled.settled) continue;
    // "Archive N days after it became settled": an auto-settled thread became
    // settled when it crossed the settle threshold, not at its last activity.
    const settleAfter = ctx.autoSettleAfterMs === undefined ? AUTO_SETTLE_AFTER_MS : ctx.autoSettleAfterMs;
    const settledSince = settled.auto ? settled.settledAt + (settleAfter ?? 0) : settled.settledAt;
    if (ctx.now - settledSince > archiveAfter) plan.archive.push(session.id);
  }
  return plan;
}

/** Collapsed shelves still render the open thread (t3code routeThreadOnly). */
export function visibleShelfRows(
  rows: readonly UISession[],
  expanded: boolean,
  activeSessionId: string | null,
): UISession[] {
  if (expanded) return [...rows];
  return activeSessionId === null ? [] : rows.filter((session) => session.id === activeSessionId);
}

export type ThreadRowStatus = "approval" | "failed" | "working" | "woke" | "done" | "ready";

/** t3code topStatus priority: approval > failed > working > woke > done. */
export function resolveRowStatus(session: Pick<UISession, "status">, isWoke: boolean): ThreadRowStatus {
  switch (session.status) {
    case "blocked":
      return "approval";
    case "error":
      return "failed";
    case "working":
      return "working";
    default:
      if (isWoke) return "woke";
      return session.status === "new_results" ? "done" : "ready";
  }
}

/** t3code shouldRecedeSidebarThread: quiet rows (working, seen ready) recede. */
export function shouldRecede(status: ThreadRowStatus, isSelected: boolean): boolean {
  if (isSelected) return false;
  return status === "working" || status === "ready";
}

/** Snoozing an approval request would hide a thread that is waiting on the user. */
export function canSnooze(session: Pick<UISession, "status">): boolean {
  return session.status !== "blocked";
}

export interface SnoozePreset {
  id: string;
  label: string;
  whenLabel: string;
  until: number;
}

type PresetSetting =
  | { kind: "after"; minutes: number }
  | { kind: "at"; day: "today" | "tomorrow" | "monday"; hour: number };

/** t3code DEFAULT_SNOOZE_PRESETS. */
const SNOOZE_PRESET_SETTINGS: PresetSetting[] = [
  { kind: "after", minutes: 60 },
  { kind: "after", minutes: 180 },
  { kind: "at", day: "today", hour: 18 },
  { kind: "at", day: "tomorrow", hour: 9 },
  { kind: "at", day: "monday", hour: 9 },
];

function timeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** The snooze menu: soonest first, one row per wake minute, past "today" options dropped. */
export function resolveSnoozePresets(now: Date): SnoozePreset[] {
  const presets: SnoozePreset[] = [];
  for (const setting of SNOOZE_PRESET_SETTINGS) {
    if (setting.kind === "after") {
      const wake = new Date(now.getTime() + setting.minutes * MINUTE_MS);
      const hours = setting.minutes / 60;
      presets.push({
        id: `after:${setting.minutes}`,
        label: `In ${hours} hour${hours === 1 ? "" : "s"}`,
        whenLabel: timeLabel(wake),
        until: wake.getTime(),
      });
      continue;
    }
    const daysAhead = setting.day === "today" ? 0 : setting.day === "tomorrow" ? 1 : (1 - now.getDay() + 7) % 7 || 7;
    // Calendar-day advance (not +24h) stays correct across DST changes.
    const wake = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, setting.hour, 0, 0, 0);
    if (wake.getTime() <= now.getTime()) continue;
    const label =
      daysAhead === 0
        ? setting.hour < 12
          ? "This morning"
          : setting.hour < 17
            ? "This afternoon"
            : "This evening"
        : daysAhead === 1
          ? "Tomorrow"
          : "Next week";
    presets.push({
      id: `at:${setting.day}:${setting.hour}`,
      label,
      whenLabel:
        label === "Next week"
          ? `${wake.toLocaleDateString(undefined, { weekday: "short" })} ${timeLabel(wake)}`
          : timeLabel(wake),
      until: wake.getTime(),
    });
  }
  const seen = new Set<number>();
  return presets
    .sort((a, b) => a.until - b.until)
    .filter((preset) => {
      const minute = Math.floor(preset.until / MINUTE_MS);
      if (seen.has(minute)) return false;
      seen.add(minute);
      return true;
    });
}

/** t3code snoozeWakeLabel: ceiling minutes / hours / days. */
export function formatWakeLabel(until: number, now: number): string {
  const remaining = until - now;
  if (remaining <= 0) return "now";
  if (remaining < HOUR_MS) return `${Math.max(1, Math.ceil(remaining / MINUTE_MS))}m`;
  if (remaining < DAY_MS) return `${Math.ceil(remaining / HOUR_MS)}h`;
  return `${Math.ceil(remaining / DAY_MS)}d`;
}

/**
 * t3code planForwardNavigation: after parking (settle/snooze) the open
 * thread, move to the next rendered row after it (wrapping) that is not
 * parked. Null = no candidate (caller starts a new conversation).
 */
export function planNextThread(
  orderedIds: readonly string[],
  currentId: string,
  isParked: (id: string) => boolean,
): string | null {
  const index = orderedIds.indexOf(currentId);
  if (index === -1) return null;
  const rotated = [...orderedIds.slice(index + 1), ...orderedIds.slice(0, index)];
  return rotated.find((id) => id !== currentId && !isParked(id)) ?? null;
}

export interface TitleSegment {
  text: string;
  match: boolean;
}

/** Split a title into matched/unmatched segments for <mark>-style highlight. */
export function highlightSegments(title: string, query: string): TitleSegment[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [{ text: title, match: false }];
  const segments: TitleSegment[] = [];
  let cursor = 0;
  const haystack = title.toLowerCase();
  while (cursor < title.length) {
    const index = haystack.indexOf(normalized, cursor);
    if (index === -1) {
      segments.push({ text: title.slice(cursor), match: false });
      break;
    }
    if (index > cursor) segments.push({ text: title.slice(cursor, index), match: false });
    segments.push({ text: title.slice(index, index + normalized.length), match: true });
    cursor = index + normalized.length;
  }
  return segments.filter((segment) => segment.text.length > 0);
}

/** Case-insensitive title filter that preserves the incoming (section) order. */
export function filterByTitle(sessions: readonly UISession[], query: string): UISession[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...sessions];
  return sessions.filter((session) => session.title.toLowerCase().includes(normalized));
}

export function formatAge(timestamp: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - timestamp) / MINUTE_MS);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

/** t3code formatWorkingDurationLabel: Xs / Xm / Xh Ym. */
export function formatWorkingElapsed(since: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
