import { describe, expect, it } from "vitest";
import {
  diffSessionTransitions,
  parseOverrideRecord,
  parseSnoozeRecord,
  pruneLifecycleEntries,
  type TransitionMaps,
} from "./threadSidebarState";

const NOW = 1_000_000;
const empty = (): TransitionMaps => ({ overrideById: {}, workingSinceById: {}, returnedAtById: {}, snoozeById: {} });

describe("parseOverrideRecord", () => {
  it("reads v3 overrides", () => {
    expect(
      parseOverrideRecord({ v: 3, byId: { a: { state: "active", at: 5 }, bad: { state: "x", at: 1 } } }, null),
    ).toEqual({ a: { state: "active", at: 5 } });
  });
  it("migrates legacy v2 and v1 settled records", () => {
    expect(parseOverrideRecord(null, { v: 2, byId: { a: 10 } })).toEqual({ a: { state: "settled", at: 10 } });
    expect(parseOverrideRecord(null, { a: true, b: false })).toEqual({ a: { state: "settled", at: 0 } });
  });
  it("prefers v3 over legacy", () => {
    expect(parseOverrideRecord({ v: 3, byId: {} }, { a: true })).toEqual({});
  });
});

describe("parseSnoozeRecord", () => {
  it("reads v2 entries and migrates legacy numbers", () => {
    expect(parseSnoozeRecord({ v: 2, byId: { a: { until: 9, at: 3, wokeAt: 4 } } })).toEqual({
      a: { until: 9, at: 3, wokeAt: 4 },
    });
    expect(parseSnoozeRecord({ a: 9, b: "x" })).toEqual({ a: { until: 9, at: 0 } });
  });
});

describe("diffSessionTransitions", () => {
  it("keeps persisted working-since on first observation (restart survival)", () => {
    const maps = { ...empty(), workingSinceById: { a: 500 } };
    const result = diffSessionTransitions([{ id: "a", status: "working", updatedAt: 900 }], [], maps, NOW);
    expect(result.changed).toBe(false);
    expect(result.next.workingSinceById).toEqual({ a: 500 });
  });

  it("stamps a send and a return for observed transitions", () => {
    const sent = diffSessionTransitions(
      [{ id: "a", status: "working", updatedAt: 1 }],
      [{ id: "a", status: "none" }],
      empty(),
      NOW,
    );
    expect(sent.next.workingSinceById).toEqual({ a: NOW });
    const returned = diffSessionTransitions(
      [{ id: "a", status: "new_results", updatedAt: 1 }],
      [{ id: "a", status: "working" }],
      sent.next,
      NOW + 10,
    );
    expect(returned.next.workingSinceById).toEqual({});
    expect(returned.next.returnedAtById).toEqual({ a: NOW + 10 });
  });

  it("seeds a missing return time from updatedAt once on first observation", () => {
    const seeded = diffSessionTransitions([{ id: "a", status: "none", updatedAt: 700 }], [], empty(), NOW);
    expect(seeded.next.returnedAtById).toEqual({ a: 700 });
    const later = diffSessionTransitions(
      [{ id: "a", status: "none", updatedAt: 900 }],
      [],
      { ...empty(), returnedAtById: { a: 700 } },
      NOW,
    );
    expect(later.changed).toBe(false);
  });

  it("stamps a return for a run that finished while the app was closed", () => {
    const result = diffSessionTransitions(
      [{ id: "a", status: "new_results", updatedAt: 800 }],
      [],
      { ...empty(), workingSinceById: { a: 500 }, returnedAtById: { a: 100 } },
      NOW,
    );
    expect(result.next.workingSinceById).toEqual({});
    expect(result.next.returnedAtById).toEqual({ a: 800 });
  });

  it("clears the settle override when a turn starts", () => {
    const maps = { ...empty(), overrideById: { a: { state: "settled" as const, at: 10 } } };
    const started = diffSessionTransitions(
      [{ id: "a", status: "working", updatedAt: 1 }],
      [{ id: "a", status: "none" }],
      maps,
      NOW,
    );
    expect(started.next.overrideById).toEqual({});
  });

  it("on first observation clears the override only if the turn started after it", () => {
    const maps = { ...empty(), overrideById: { a: { state: "settled" as const, at: 600 } } };
    const before = diffSessionTransitions([{ id: "a", status: "working", updatedAt: 500 }], [], maps, NOW);
    expect(before.next.overrideById).toEqual(maps.overrideById);
    const after = diffSessionTransitions([{ id: "a", status: "working", updatedAt: 700 }], [], maps, NOW);
    expect(after.next.overrideById).toEqual({});
  });

  it("wakes a pending snooze early on approval or a new failure", () => {
    const snoozed = { ...empty(), snoozeById: { a: { until: NOW + 1000, at: NOW - 1000 } } };
    const blocked = diffSessionTransitions([{ id: "a", status: "blocked", updatedAt: 1 }], [], snoozed, NOW);
    expect(blocked.next.snoozeById.a?.wokeAt).toBe(NOW);
    const failed = diffSessionTransitions(
      [{ id: "a", status: "error", updatedAt: 1 }],
      [{ id: "a", status: "working" }],
      snoozed,
      NOW,
    );
    expect(failed.next.snoozeById.a?.wokeAt).toBe(NOW);
    const staleError = diffSessionTransitions([{ id: "a", status: "error", updatedAt: 1 }], [], snoozed, NOW);
    expect(staleError.next.snoozeById.a?.wokeAt).toBeUndefined();
  });
});

describe("pruneLifecycleEntries", () => {
  it("drops unknown ids and keeps references when unchanged", () => {
    const maps = {
      overrideById: { kept: { state: "settled" as const, at: 1 }, gone: { state: "active" as const, at: 2 } },
      snoozeById: { gone: { until: 3, at: 0 } },
      workingSinceById: {},
      returnedAtById: { kept: 4 },
    };
    const result = pruneLifecycleEntries(maps, new Set(["kept"]));
    expect(result.changed).toBe(true);
    expect(result.next.overrideById).toEqual({ kept: { state: "settled", at: 1 } });
    expect(result.next.snoozeById).toEqual({});
    expect(result.next.returnedAtById).toBe(maps.returnedAtById);
  });
});
