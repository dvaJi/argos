import { describe, expect, it, vi } from "bun:test";
import { DaemonPlanRuntime } from "../src/host/daemonPlanRuntime";

function createHarness() {
  let planJson: string | null = null;
  const setPlanJson = vi.fn(async (_sessionId: string, value: string | null) => {
    planJson = value;
  });
  const runtime = new DaemonPlanRuntime({
    sessionRepository: {
      getPlanJson: async () => planJson,
      setPlanJson,
    },
  });
  return { runtime, setPlanJson, getPlanJson: () => planJson };
}

describe("DaemonPlanRuntime", () => {
  it("stores the full plan for sessions.getPlan", async () => {
    const harness = createHarness();
    const plan = await harness.runtime.submit("session-1", {
      objective: "Ship it",
      steps: ["Read", "Write"],
      files: ["src/a.ts"],
      risks: [],
      verification: ["bun test"],
    });
    expect(plan.revision).toBe(1);
    expect(harness.setPlanJson).toHaveBeenCalledTimes(1);
    expect(await harness.runtime.get("session-1")).toMatchObject({
      objective: "Ship it",
      steps: ["Read", "Write"],
      files: ["src/a.ts"],
      verification: ["bun test"],
      revision: 1,
    });
  });

  it("increments the revision", async () => {
    const harness = createHarness();
    await harness.runtime.submit("session-1", { objective: "One", steps: ["a"] });
    const second = await harness.runtime.submit("session-1", { objective: "Two", steps: ["b"] });
    expect(second.revision).toBe(2);
  });

  it("rejects an empty plan", async () => {
    const harness = createHarness();
    await expect(harness.runtime.submit("session-1", { objective: "Missing steps", steps: [] })).rejects.toThrow();
  });
});
