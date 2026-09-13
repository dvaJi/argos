import { describe, expect, it } from "vitest";
import type { UISession } from "#/stores/ui/session";
import {
  collectThreadSidebarShortcutSessions,
  filterByTitle,
  formatAge,
  formatWakeCountdown,
  formatWorkingElapsed,
  highlightSegments,
  partitionThreads,
  resolveThreadPill,
  resolveThreadStatus,
  type ThreadSections,
} from "./threadSidebarLogic";

const NOW = 1_000_000_000;

function makeSession(overrides: Partial<UISession> = {}): UISession {
  return {
    id: "s1",
    title: "Session",
    agentId: "agent",
    status: "completed",
    projectDir: "/tmp/project",
    isPinned: false,
    isDraft: false,
    sessionKind: "regular",
    parentSessionId: null,
    subagentEnabled: false,
    subagentMeta: null,
    createdAt: NOW - 60_000,
    updatedAt: NOW - 30_000,
    ...overrides,
  };
}

const emptyHelpers = {
  settledAtById: {} as Record<string, number>,
  snoozedUntilById: {} as Record<string, number>,
  now: NOW,
};

function ids(sections: ThreadSections): Record<keyof ThreadSections, string[]> {
  return {
    pinned: sections.pinned.map((s) => s.id),
    active: sections.active.map((s) => s.id),
    snoozed: sections.snoozed.map((s) => s.id),
    settled: sections.settled.map((s) => s.id),
  };
}

describe("resolveThreadStatus", () => {
  it("maps attention states ahead of activity", () => {
    expect(resolveThreadStatus({ status: "blocked" })).toBe("approval");
    expect(resolveThreadStatus({ status: "error" })).toBe("failed");
    expect(resolveThreadStatus({ status: "working" })).toBe("working");
    expect(resolveThreadStatus({ status: "new_results" })).toBe("unseen");
    expect(resolveThreadStatus({ status: "completed" })).toBe("ready");
    expect(resolveThreadStatus({ status: "none" })).toBe("ready");
  });

  it("maps statuses to pills; quiet statuses have no pill", () => {
    expect(resolveThreadPill("approval")?.label).toBe("Pending approval");
    expect(resolveThreadPill("failed")?.label).toBe("Failed");
    expect(resolveThreadPill("working")?.label).toBe("Working");
    expect(resolveThreadPill("unseen")?.label).toBe("Completed");
    expect(resolveThreadPill("ready")).toBeNull();
  });
});

describe("partitionThreads", () => {
  it("hides drafts and non-regular sessions", () => {
    const sections = partitionThreads(
      [
        makeSession({ id: "draft", isDraft: true }),
        makeSession({ id: "subagent", sessionKind: "subagent" }),
        makeSession({ id: "regular" }),
      ],
      emptyHelpers,
    );
    expect(ids(sections)).toEqual({ pinned: [], active: ["regular"], snoozed: [], settled: [] });
  });

  it("pinned wins over settled; working sessions never render as settled", () => {
    const sections = partitionThreads(
      [
        makeSession({ id: "pinned-settled", isPinned: true }),
        makeSession({ id: "settled-working", status: "working" }),
        makeSession({ id: "settled" }),
      ],
      {
        ...emptyHelpers,
        settledAtById: { "pinned-settled": NOW - 1000, settled: NOW - 2000, "settled-working": NOW - 3000 },
      },
    );
    const sectionIds = ids(sections);
    expect(sectionIds.pinned).toEqual(["pinned-settled"]);
    expect(sectionIds.settled).toEqual(["settled"]);
    expect(sectionIds.active).toEqual(["settled-working"]);
  });

  it("keeps the currently open session out of the snoozed shelf", () => {
    const session = makeSession({ id: "open" });
    const helpers = { ...emptyHelpers, snoozedUntilById: { open: NOW + 60_000 } };
    expect(partitionThreads([session], helpers).snoozed.map((s) => s.id)).toEqual(["open"]);
    expect(partitionThreads([session], { ...helpers, activeSessionId: "open" }).active.map((s) => s.id)).toEqual([
      "open",
    ]);
  });

  it("sorts settled newest first; legacy settledAt=0 entries are not settled (they stay active)", () => {
    const a = makeSession({ id: "a", createdAt: NOW - 3000, updatedAt: NOW - 3000 });
    const b = makeSession({ id: "b", createdAt: NOW - 1000, updatedAt: NOW - 1000 });
    const c = makeSession({ id: "c", createdAt: NOW - 9000, updatedAt: NOW - 9000 });
    const sections = partitionThreads([a, c, b], {
      ...emptyHelpers,
      settledAtById: { a: NOW - 1000, b: NOW - 4000, c: NOW - 2000 },
    });
    expect(sections.settled.map((s) => s.id)).toEqual(["a", "c", "b"]);

    // v1-migrated booleans map to 0 (unknown time) and are not settled yet.
    const legacy = makeSession({ id: "legacy", createdAt: NOW - 9000, updatedAt: NOW - 500 });
    const migrated = partitionThreads([legacy], { ...emptyHelpers, settledAtById: { legacy: 0 } });
    expect(migrated.settled).toEqual([]);
    expect(migrated.active.map((s) => s.id)).toEqual(["legacy"]);

    const snoozedFirst = makeSession({ id: "first", createdAt: NOW - 5000 });
    const snoozedLater = makeSession({ id: "later", createdAt: NOW - 1000 });
    const snoozed = partitionThreads([snoozedLater, snoozedFirst], {
      ...emptyHelpers,
      snoozedUntilById: { first: NOW + 1000, later: NOW + 60_000 },
    });
    expect(snoozed.snoozed.map((s) => s.id)).toEqual(["first", "later"]);
  });
});

describe("collectThreadSidebarShortcutSessions", () => {
  const sections: ThreadSections = {
    pinned: [makeSession({ id: "p" })],
    active: [makeSession({ id: "a" })],
    snoozed: [makeSession({ id: "s" })],
    settled: [makeSession({ id: "d" })],
  };

  it("returns nothing while collapsed and excludes settled", () => {
    expect(collectThreadSidebarShortcutSessions({ collapsed: true, sections, snoozedShelfExpanded: true })).toEqual([]);
    const expanded = collectThreadSidebarShortcutSessions({ collapsed: false, sections, snoozedShelfExpanded: true });
    expect(expanded.map((s) => s.id)).toEqual(["p", "a", "s"]);
  });

  it("hides collapsed-shelf snoozed rows and caps at ten", () => {
    const collapsedShelf = collectThreadSidebarShortcutSessions({
      collapsed: false,
      sections,
      snoozedShelfExpanded: false,
    });
    expect(collapsedShelf.map((s) => s.id)).toEqual(["p", "a"]);

    const many: ThreadSections = {
      pinned: [],
      active: Array.from({ length: 12 }, (_, i) => makeSession({ id: `s${i}` })),
      snoozed: [],
      settled: [],
    };
    expect(
      collectThreadSidebarShortcutSessions({ collapsed: false, sections: many, snoozedShelfExpanded: true }),
    ).toHaveLength(10);
  });
});

describe("title filtering and highlighting", () => {
  it("filterByTitle is case-insensitive and preserves order", () => {
    const sessions = [makeSession({ id: "1", title: "Fix the bug" }), makeSession({ id: "2", title: "Add feature" })];
    expect(filterByTitle(sessions, "  BUG ").map((s) => s.id)).toEqual(["1"]);
    expect(filterByTitle(sessions, "")).toHaveLength(2);
  });

  it("highlightSegments marks matches case-insensitively and keeps gaps", () => {
    expect(highlightSegments("Fix the Bug", "bug")).toEqual([
      { text: "Fix the ", match: false },
      { text: "Bug", match: true },
    ]);
    expect(highlightSegments("abab", "ab")).toEqual([
      { text: "ab", match: true },
      { text: "ab", match: true },
    ]);
    expect(highlightSegments("plain", "")).toEqual([{ text: "plain", match: false }]);
  });
});

describe("time formatting", () => {
  it("formatAge buckets elapsed time", () => {
    expect(formatAge(NOW - 500, NOW)).toBe("now");
    expect(formatAge(NOW - 5 * 60_000, NOW)).toBe("5m");
    expect(formatAge(NOW - 3 * 3_600_000, NOW)).toBe("3h");
    expect(formatAge(NOW - 2 * 86_400_000, NOW)).toBe("2d");
    expect(formatAge(NOW - 14 * 86_400_000, NOW)).toBe("2w");
    expect(formatAge(NOW - 90 * 86_400_000, NOW)).toBe("3mo");
  });

  it("formatWorkingElapsed renders t3code-style durations", () => {
    expect(formatWorkingElapsed(NOW - 45_000, NOW)).toBe("45s");
    expect(formatWorkingElapsed(NOW - 5 * 60_000, NOW)).toBe("5m");
    expect(formatWorkingElapsed(NOW - 2 * 3_600_000 - 7 * 60_000, NOW)).toBe("2h 7m");
  });

  it("formatWakeCountdown counts down to the wake time", () => {
    expect(formatWakeCountdown(NOW + 30_000, NOW)).toBe("in <1m");
    expect(formatWakeCountdown(NOW + 59 * 60_000, NOW)).toBe("in 59m");
    expect(formatWakeCountdown(NOW + 2 * 3_600_000 + 5 * 60_000, NOW)).toBe("in 2h 05m");
  });
});
