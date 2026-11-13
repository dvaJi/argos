import { describe, expect, it } from "vitest";
import { mapToUISession, type UISession } from "#/stores/ui/sessionMapping";
import {
  AUTO_SETTLE_AFTER_MS,
  DEFAULT_LIFECYCLE_SETTINGS,
  canSnooze,
  normalizeLifecycleSettings,
  planLifecycleSweep,
  filterByTitle,
  formatAge,
  formatWakeLabel,
  formatWorkingElapsed,
  highlightSegments,
  partitionThreads,
  planNextThread,
  resolveRowStatus,
  resolveSettled,
  resolveSnoozePresets,
  returnAt,
  shouldRecede,
  visibleShelfRows,
  type LifecycleContext,
  type ThreadSections,
} from "./threadSidebarLogic";

const NOW = 2_000_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function makeSession(overrides: Partial<UISession> = {}): UISession {
  return {
    id: "s1",
    title: "Session",
    agentId: "agent",
    status: "none",
    projectDir: "/tmp/project",
    isPinned: false,
    isDraft: false,
    sessionKind: "regular",
    parentSessionId: null,
    subagentEnabled: false,
    subagentMeta: null,
    createdAt: NOW - HOUR,
    updatedAt: NOW - HOUR,
    ...overrides,
  };
}

function ctx(overrides: Partial<LifecycleContext> = {}): LifecycleContext {
  return {
    overrideById: {},
    snoozeById: {},
    workingSinceById: {},
    returnedAtById: {},
    now: NOW,
    ...overrides,
  };
}

const ids = (sections: ThreadSections) => ({
  pinned: sections.pinned.map((s) => s.id),
  active: sections.active.map((s) => s.id),
  working: sections.working.map((s) => s.id),
  snoozed: sections.snoozed.map((s) => s.id),
  settled: sections.settled.map((s) => s.id),
});

describe("partitionThreads", () => {
  it("applies t3code precedence: snoozed > settled > pinned > working/active", () => {
    const sessions = [
      makeSession({ id: "snoozed-pinned", isPinned: true }),
      makeSession({ id: "settled-pinned", isPinned: true }),
      makeSession({ id: "pinned-working", isPinned: true, status: "working" }),
      makeSession({ id: "working", status: "working" }),
      makeSession({ id: "blocked", status: "blocked" }),
      makeSession({ id: "done", status: "new_results" }),
      makeSession({ id: "draft", isDraft: true }),
      makeSession({ id: "sub", sessionKind: "subagent" }),
    ];
    const result = ids(
      partitionThreads(
        sessions,
        ctx({
          snoozeById: { "snoozed-pinned": { until: NOW + HOUR, at: NOW - 1 } },
          overrideById: { "settled-pinned": { state: "settled", at: NOW - 1 } },
        }),
      ),
    );
    expect(result).toEqual({
      pinned: ["pinned-working"],
      active: ["blocked", "done"],
      working: ["working"],
      snoozed: ["snoozed-pinned"],
      settled: ["settled-pinned"],
    });
  });

  it("sorts Active by return time, not creation time", () => {
    const sessions = [
      makeSession({ id: "new-idle", createdAt: NOW - 10 * 60_000 }),
      makeSession({ id: "old-returned", createdAt: NOW - 5 * DAY }),
      makeSession({ id: "old-unsettled", createdAt: NOW - 3 * DAY }),
    ];
    const result = partitionThreads(
      sessions,
      ctx({
        returnedAtById: { "old-returned": NOW - 60_000 },
        overrideById: { "old-unsettled": { state: "active", at: NOW - 5 * 60_000 } },
      }),
    );
    expect(result.active.map((s) => s.id)).toEqual(["old-returned", "old-unsettled", "new-idle"]);
  });

  it("ignores updatedAt for the inbox order (the daemon bumps it on view)", () => {
    const viewed = makeSession({ id: "viewed", createdAt: NOW - 2 * HOUR, updatedAt: NOW });
    const fresh = makeSession({ id: "fresh", createdAt: NOW - HOUR, updatedAt: NOW - HOUR });
    expect(partitionThreads([viewed, fresh], ctx()).active.map((s) => s.id)).toEqual(["fresh", "viewed"]);
  });

  it("sorts Working by last send, Snoozed by wake, Settled by settled time", () => {
    const result = partitionThreads(
      [
        makeSession({ id: "w1", status: "working" }),
        makeSession({ id: "w2", status: "working" }),
        makeSession({ id: "z1" }),
        makeSession({ id: "z2" }),
        makeSession({ id: "s1" }),
        makeSession({ id: "s2" }),
      ],
      ctx({
        workingSinceById: { w1: NOW - 5000, w2: NOW - 1000 },
        snoozeById: { z1: { until: NOW + 2 * HOUR, at: NOW }, z2: { until: NOW + HOUR, at: NOW } },
        overrideById: { s1: { state: "settled", at: NOW - 2000 }, s2: { state: "settled", at: NOW - 1000 } },
      }),
    );
    expect(ids(result)).toMatchObject({ working: ["w2", "w1"], snoozed: ["z2", "z1"], settled: ["s2", "s1"] });
  });

  it("returns a woken thread to Active, sorted by its wake time", () => {
    const result = partitionThreads(
      [makeSession({ id: "woke", createdAt: NOW - 3 * DAY }), makeSession({ id: "recent", createdAt: NOW - HOUR })],
      ctx({ snoozeById: { woke: { until: NOW - 60_000, at: NOW - 2 * HOUR } } }),
    );
    expect(result.active.map((s) => s.id)).toEqual(["woke", "recent"]);
  });

  it("wakes a snooze early once wokeAt is recorded", () => {
    const result = partitionThreads(
      [makeSession({ id: "a", status: "blocked" })],
      ctx({ snoozeById: { a: { until: NOW + HOUR, at: NOW - HOUR, wokeAt: NOW - 1000 } } }),
    );
    expect(ids(result).active).toEqual(["a"]);
  });
});

describe("resolveSettled (auto-settle)", () => {
  const stale = makeSession({ id: "stale", createdAt: NOW - 10 * DAY, updatedAt: NOW - 9 * DAY });

  it("auto-settles threads inactive for longer than 7 days", () => {
    expect(resolveSettled(stale, ctx())).toEqual({ settled: true, settledAt: NOW - 9 * DAY, auto: true });
  });

  it("keeps threads active within the window", () => {
    const recent = makeSession({ createdAt: NOW - 10 * DAY, updatedAt: NOW - 10 * DAY });
    expect(resolveSettled(recent, ctx({ returnedAtById: { s1: NOW - DAY } })).settled).toBe(false);
  });

  it("never auto-settles pinned, working, blocked or snoozed threads", () => {
    for (const overrides of [{ isPinned: true }, { status: "working" as const }, { status: "blocked" as const }]) {
      expect(resolveSettled({ ...stale, ...overrides }, ctx()).settled).toBe(false);
    }
    expect(resolveSettled(stale, ctx({ snoozeById: { stale: { until: NOW + HOUR, at: NOW } } })).settled).toBe(false);
  });

  it("is exempted by a manual un-settle override", () => {
    expect(resolveSettled(stale, ctx({ overrideById: { stale: { state: "active", at: 1 } } })).settled).toBe(false);
  });

  it("honours a manual settle with its timestamp (legacy 0 falls back to updatedAt)", () => {
    const fresh = makeSession({ id: "f", updatedAt: NOW - 5 });
    expect(resolveSettled(fresh, ctx({ overrideById: { f: { state: "settled", at: NOW - 10 } } })).settledAt).toBe(
      NOW - 10,
    );
    expect(resolveSettled(fresh, ctx({ overrideById: { f: { state: "settled", at: 0 } } })).settledAt).toBe(NOW - 5);
  });

  it("can be disabled", () => {
    expect(resolveSettled(stale, ctx({ autoSettleAfterMs: null })).settled).toBe(false);
    expect(AUTO_SETTLE_AFTER_MS).toBe(7 * DAY);
  });
});

describe("returnAt", () => {
  it("is the newest of created, send, returned, woke and un-settle", () => {
    const session = makeSession({ createdAt: NOW - DAY });
    expect(returnAt(session, ctx({ workingSinceById: { s1: NOW - 100 } }))).toBe(NOW - 100);
    expect(returnAt(session, ctx({ overrideById: { s1: { state: "active", at: NOW - 50 } } }))).toBe(NOW - 50);
    expect(returnAt(session, ctx())).toBe(NOW - DAY);
  });
});

describe("visibleShelfRows", () => {
  const rows = [makeSession({ id: "a" }), makeSession({ id: "b" })];
  it("renders everything when expanded", () => {
    expect(visibleShelfRows(rows, true, null).map((s) => s.id)).toEqual(["a", "b"]);
  });
  it("keeps only the open thread when collapsed", () => {
    expect(visibleShelfRows(rows, false, "b").map((s) => s.id)).toEqual(["b"]);
    expect(visibleShelfRows(rows, false, null)).toEqual([]);
  });
});

describe("planNextThread", () => {
  it("moves to the next un-parked row, wrapping around", () => {
    const parked = new Set(["c"]);
    expect(planNextThread(["a", "b", "c", "d"], "b", (id) => parked.has(id))).toBe("d");
    expect(planNextThread(["a", "b", "c"], "b", (id) => parked.has(id))).toBe("a");
  });
  it("returns null when nothing is left", () => {
    expect(planNextThread(["a"], "a", () => false)).toBeNull();
    expect(planNextThread(["a", "b"], "missing", () => false)).toBeNull();
  });
});

describe("row status", () => {
  it("follows approval > failed > working > woke > done priority", () => {
    expect(resolveRowStatus({ status: "blocked" }, true)).toBe("approval");
    expect(resolveRowStatus({ status: "error" }, true)).toBe("failed");
    expect(resolveRowStatus({ status: "working" }, true)).toBe("working");
    expect(resolveRowStatus({ status: "new_results" }, true)).toBe("woke");
    expect(resolveRowStatus({ status: "new_results" }, false)).toBe("done");
    expect(resolveRowStatus({ status: "none" }, false)).toBe("ready");
  });
  it("recedes working and seen ready rows unless selected", () => {
    expect(shouldRecede("working", false)).toBe(true);
    expect(shouldRecede("ready", false)).toBe(true);
    expect(shouldRecede("done", false)).toBe(false);
    expect(shouldRecede("ready", true)).toBe(false);
  });
  it("does not offer snooze while awaiting approval", () => {
    expect(canSnooze({ status: "blocked" })).toBe(false);
    expect(canSnooze({ status: "none" })).toBe(true);
  });
});

describe("resolveSnoozePresets", () => {
  it("lists t3code presets soonest first", () => {
    // Wednesday 10:00 local.
    const now = new Date(2026, 10, 11, 10, 0, 0);
    const presets = resolveSnoozePresets(now);
    expect(presets.map((p) => p.label)).toEqual(["In 1 hour", "In 3 hours", "This evening", "Tomorrow", "Next week"]);
    expect(new Date(presets[4]!.until).getDay()).toBe(1);
  });
  it("drops past today options and dedupes same-minute wakes", () => {
    // Sunday 20:00: "today 18:00" is past; Monday 09:00 == tomorrow 09:00.
    const presets = resolveSnoozePresets(new Date(2026, 10, 15, 20, 0, 0));
    expect(presets.map((p) => p.label)).toEqual(["In 1 hour", "In 3 hours", "Tomorrow"]);
  });
});

describe("labels", () => {
  it("formats wake labels with ceiling units", () => {
    expect(formatWakeLabel(NOW + 30_000, NOW)).toBe("1m");
    expect(formatWakeLabel(NOW + 61 * 60_000, NOW)).toBe("2h");
    expect(formatWakeLabel(NOW + 25 * HOUR, NOW)).toBe("2d");
    expect(formatWakeLabel(NOW - 1, NOW)).toBe("now");
  });
  it("formats ages and working durations", () => {
    expect(formatAge(NOW - 30_000, NOW)).toBe("now");
    expect(formatAge(NOW - 5 * 60_000, NOW)).toBe("5m");
    expect(formatAge(NOW - 3 * DAY, NOW)).toBe("3d");
    expect(formatWorkingElapsed(NOW - 12_000, NOW)).toBe("12s");
    expect(formatWorkingElapsed(NOW - 125 * 60_000, NOW)).toBe("2h 5m");
  });
  it("highlights and filters by title", () => {
    expect(highlightSegments("Fix Login bug", "login")).toEqual([
      { text: "Fix ", match: false },
      { text: "Login", match: true },
      { text: " bug", match: false },
    ]);
    const rows = [makeSession({ id: "a", title: "Alpha" }), makeSession({ id: "b", title: "Beta" })];
    expect(filterByTitle(rows, "ALP").map((s) => s.id)).toEqual(["a"]);
  });
});

describe("lifecycle settings", () => {
  it("fills defaults and turns invalid values off", () => {
    expect(normalizeLifecycleSettings(undefined)).toEqual(DEFAULT_LIFECYCLE_SETTINGS);
    expect(normalizeLifecycleSettings({ autoSettleDays: null, autoArchiveDays: -3, autoDeleteDays: 14 })).toEqual({
      autoSettleDays: null,
      autoArchiveDays: null,
      autoDeleteDays: 14,
    });
  });

  it("configured auto-settle days drive resolveSettled; null disables it", () => {
    const idle = makeSession({ createdAt: NOW - 4 * DAY, updatedAt: NOW - 4 * DAY });
    expect(resolveSettled(idle, ctx({ autoSettleAfterMs: 3 * DAY })).settled).toBe(true);
    expect(resolveSettled(idle, ctx({ autoSettleAfterMs: null })).settled).toBe(false);
  });
});

describe("planLifecycleSweep", () => {
  const settings = { autoSettleDays: 7, autoArchiveDays: 30, autoDeleteDays: 14 };
  const old = { createdAt: NOW - 60 * DAY, updatedAt: NOW - 60 * DAY };

  it("archives threads settled longer than the archive window", () => {
    const sessions = [
      makeSession({ id: "long-settled", ...old }),
      makeSession({ id: "recently-settled", ...old }),
      makeSession({ id: "pinned", isPinned: true, ...old }),
      makeSession({ id: "active", createdAt: NOW - DAY, updatedAt: NOW - DAY }),
    ];
    const plan = planLifecycleSweep(
      sessions,
      ctx({ overrideById: { "recently-settled": { state: "settled", at: NOW - 2 * DAY } } }),
      settings,
      null,
    );
    expect(plan).toEqual({ archive: ["long-settled"], delete: [] });
  });

  it("starts the archive clock when a thread auto-settled, not at its last activity", () => {
    const idle = (days: number) =>
      makeSession({ id: "idle", createdAt: NOW - days * DAY, updatedAt: NOW - days * DAY });
    const short = { autoSettleDays: 7, autoArchiveDays: 3, autoDeleteDays: null };
    const context = ctx({ autoSettleAfterMs: 7 * DAY });
    expect(planLifecycleSweep([idle(8)], context, short, null).archive).toEqual([]);
    expect(planLifecycleSweep([idle(11)], context, short, null).archive).toEqual(["idle"]);
    // Defaults: 7 to settle + 30 to archive.
    expect(planLifecycleSweep([idle(36)], ctx(), DEFAULT_LIFECYCLE_SETTINGS, null).archive).toEqual([]);
    expect(planLifecycleSweep([idle(38)], ctx(), DEFAULT_LIFECYCLE_SETTINGS, null).archive).toEqual(["idle"]);
  });

  it("deletes archived threads past the delete window and respects Off", () => {
    const sessions = [
      makeSession({ id: "old-archive", archivedAt: NOW - 20 * DAY, ...old }),
      makeSession({ id: "new-archive", archivedAt: NOW - DAY, ...old }),
    ];
    expect(planLifecycleSweep(sessions, ctx(), settings, null).delete).toEqual(["old-archive"]);
    expect(planLifecycleSweep(sessions, ctx(), { ...settings, autoDeleteDays: null }, null).delete).toEqual([]);
    expect(planLifecycleSweep(sessions, ctx(), { ...settings, autoArchiveDays: null }, null).archive).toEqual([]);
  });

  it("never touches the open session", () => {
    const sessions = [
      makeSession({ id: "open", ...old }),
      makeSession({ id: "open-archived", archivedAt: NOW - 20 * DAY, ...old }),
    ];
    expect(planLifecycleSweep(sessions, ctx(), settings, "open")).toEqual({ archive: [], delete: ["open-archived"] });
    expect(planLifecycleSweep(sessions, ctx(), settings, "open-archived").delete).toEqual([]);
  });

  it("never archives a running thread from a raw daemon record", () => {
    const raw = mapToUISession({
      id: "running",
      agentId: "agent",
      title: "Running",
      projectDir: null,
      isPinned: false,
      sessionKind: "regular",
      subagentEnabled: false,
      status: "generating",
      providerId: "acp",
      modelId: "m",
      ...old,
    });
    expect(raw.status).toBe("working");
    expect(planLifecycleSweep([raw], ctx(), settings, null).archive).toEqual([]);
  });
});
