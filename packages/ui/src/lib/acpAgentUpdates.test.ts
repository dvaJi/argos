import { describe, expect, it, vi } from "vitest";
import type { AcpRegistryAgent } from "@argos/shared/presenter";
import { getAgentsWithUpdates, hasAgentUpdate, updateAgentsSequentially } from "./acpAgentUpdates";

const makeAgent = (overrides: Partial<AcpRegistryAgent> = {}): AcpRegistryAgent => ({
  id: "agent",
  name: "Agent",
  version: "2.0.0",
  distribution: { npx: { package: "agent-pkg" } },
  source: "registry",
  enabled: true,
  installState: { status: "installed", version: "1.0.0" },
  ...overrides,
});

describe("hasAgentUpdate", () => {
  it("flags package (npx) agents whose recorded version lags the registry", () => {
    expect(hasAgentUpdate(makeAgent())).toBe(true);
  });

  it("flags binary agents whose recorded version lags the registry", () => {
    expect(
      hasAgentUpdate(makeAgent({ distribution: { binary: { "windows-x86_64": { archive: "a.zip", cmd: "a" } } } })),
    ).toBe(true);
  });

  it("ignores up-to-date, not-installed, errored and unversioned agents", () => {
    expect(hasAgentUpdate(makeAgent({ installState: { status: "installed", version: "2.0.0" } }))).toBe(false);
    expect(hasAgentUpdate(makeAgent({ installState: null }))).toBe(false);
    expect(hasAgentUpdate(makeAgent({ installState: { status: "error", version: "1.0.0" } }))).toBe(false);
    expect(hasAgentUpdate(makeAgent({ installState: { status: "installed", version: null } }))).toBe(false);
  });

  it("filters a list", () => {
    const stale = makeAgent({ id: "stale" });
    const fresh = makeAgent({ id: "fresh", installState: { status: "installed", version: "2.0.0" } });
    expect(getAgentsWithUpdates([stale, fresh]).map((a) => a.id)).toEqual(["stale"]);
  });
});

describe("updateAgentsSequentially", () => {
  it("runs updates one at a time and reports returned error states as failures", async () => {
    let running = 0;
    let maxConcurrent = 0;
    const update = vi.fn<(id: string) => Promise<{ status: string; error?: string }>>(async (id: string) => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await Promise.resolve();
      running -= 1;
      if (id === "b") return { status: "error", error: "download failed" };
      if (id === "c") throw new Error("boom");
      return { status: "installed" };
    });

    const outcomes = await updateAgentsSequentially(
      [makeAgent({ id: "a" }), makeAgent({ id: "b" }), makeAgent({ id: "c" })],
      update,
    );

    expect(maxConcurrent).toBe(1);
    expect(outcomes.map((o) => [o.agent.id, o.ok])).toEqual([
      ["a", true],
      ["b", false],
      ["c", false],
    ]);
  });
});
