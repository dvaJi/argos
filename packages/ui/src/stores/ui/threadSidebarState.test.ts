import { describe, expect, it } from "vitest";
import { diffWorkingTransitions, omitKey, parseSettledRecord, pruneLifecycleEntries } from "./threadSidebarState";

const NOW = 1_000_000_000;

function session(id: string, status: "working" | "completed", updatedAt = NOW - 1000) {
  return { id, status, updatedAt } as const;
}

describe("parseSettledRecord", () => {
  it("parses v2 records and rejects invalid entries", () => {
    expect(parseSettledRecord({ v: 2, byId: { a: 123, b: -5, c: "x" } })).toEqual({ a: 123 });
  });

  it("migrates v1 boolean records to timestamp 0", () => {
    expect(parseSettledRecord({ a: true, b: false })).toEqual({ a: 0 });
  });

  it("tolerates garbage input", () => {
    expect(parseSettledRecord(null)).toEqual({});
    expect(parseSettledRecord("nope")).toEqual({});
    expect(parseSettledRecord([1, 2])).toEqual({});
    expect(parseSettledRecord({ v: 2, byId: [1] })).toEqual({});
  });
});

describe("diffWorkingTransitions", () => {
  it("keeps persisted elapsed time on first observation of a working session (restart survival)", () => {
    const result = diffWorkingTransitions([session("a", "working")], [], { a: NOW - 60_000 }, NOW);
    expect(result.changed).toBe(false);
    expect(result.next).toEqual({ a: NOW - 60_000 });
  });

  it("seeds from updatedAt on first observation without a persisted value", () => {
    const result = diffWorkingTransitions([session("a", "working", NOW - 30_000)], [], {}, NOW);
    expect(result.changed).toBe(true);
    expect(result.next).toEqual({ a: NOW - 30_000 });
  });

  it("stamps now for a known session transitioning into working", () => {
    const result = diffWorkingTransitions([session("a", "working")], [session("a", "completed")], {}, NOW);
    expect(result.changed).toBe(true);
    expect(result.next).toEqual({ a: NOW });
  });

  it("clears entries when a session leaves working", () => {
    const result = diffWorkingTransitions([session("a", "completed")], [session("a", "working")], { a: NOW - 5 }, NOW);
    expect(result.changed).toBe(true);
    expect(result.next).toEqual({});
  });

  it("only manages ids present in the current batch (unknown ids are the sweep's job)", () => {
    const result = diffWorkingTransitions([session("a", "completed")], [], { a: NOW - 5, ghost: NOW - 9 }, NOW);
    expect(result.changed).toBe(true);
    expect(result.next).toEqual({ ghost: NOW - 9 });
  });

  it("leaves working-to-working sessions untouched", () => {
    const result = diffWorkingTransitions([session("a", "working")], [session("a", "working")], { a: 42 }, NOW);
    expect(result.changed).toBe(false);
    expect(result.next).toEqual({ a: 42 });
  });
});

describe("pruneLifecycleEntries", () => {
  it("removes entries for unknown ids across all maps and reports change", () => {
    const result = pruneLifecycleEntries(
      {
        settledAtById: { kept: 1, gone: 2 },
        snoozedUntilById: { gone: 3 },
        workingSinceById: { kept: 4 },
      },
      new Set(["kept"]),
    );
    expect(result.changed).toBe(true);
    expect(result.next).toEqual({
      settledAtById: { kept: 1 },
      snoozedUntilById: {},
      workingSinceById: { kept: 4 },
    });
  });

  it("returns the same references when nothing is prunable", () => {
    const maps = {
      settledAtById: { kept: 1 },
      snoozedUntilById: {},
      workingSinceById: {},
    };
    const result = pruneLifecycleEntries(maps, new Set(["kept"]));
    expect(result.changed).toBe(false);
    expect(result.next.settledAtById).toBe(maps.settledAtById);
  });
});

describe("omitKey", () => {
  it("omits the key or returns the original reference when absent", () => {
    const map = { a: 1, b: 2 };
    expect(omitKey(map, "a")).toEqual({ b: 2 });
    expect(omitKey(map, "missing")).toBe(map);
  });
});
