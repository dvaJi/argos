import { describe, expect, it } from "bun:test";
import type { ProviderAggregate } from "@argos/shared/types/model-db";
import { resolveModelCost } from "../src/host/modelCost";

/**
 * Tier-aware pricing resolution (docs/features/tiered-cost-estimation):
 * flat fallback, `context_over_200k` shorthand, explicit `tiers` precedence.
 */

const catalog: ProviderAggregate = {
  providers: {
    tiered: {
      id: "tiered",
      models: [
        {
          id: "long-context-model",
          cost: {
            input: 5,
            output: 30,
            cache_read: 0.5,
            context_over_200k: { input: 10, output: 45 },
            tiers: [{ tier: { type: "context", size: 272_000 }, input: 12, output: 50 }],
          },
        },
      ],
    },
  },
} as unknown as ProviderAggregate;

const fakePresenter = {
  getDaemonProviderDb: () => ({ catalog }),
};

describe("resolveModelCost tiered pricing", () => {
  it("uses flat rates when no context size is given", () => {
    const rate = resolveModelCost(fakePresenter, "tiered", "long-context-model");
    expect(rate).toEqual({ input: 5, output: 30, cacheRead: 0.5, cacheWrite: 5 });
  });

  it("uses flat rates below the shorthand threshold", () => {
    const rate = resolveModelCost(fakePresenter, "tiered", "long-context-model", 100_000);
    expect(rate?.input).toBe(5);
    expect(rate?.output).toBe(30);
  });

  it("applies the context_over_200k shorthand above 200k tokens", () => {
    const rate = resolveModelCost(fakePresenter, "tiered", "long-context-model", 250_000);
    expect(rate?.input).toBe(10);
    expect(rate?.output).toBe(45);
    // cache_read missing on the tier → falls back to the flat rate
    expect(rate?.cacheRead).toBe(0.5);
  });

  it("prefers the largest explicit tier at or below the context size", () => {
    const rate = resolveModelCost(fakePresenter, "tiered", "long-context-model", 300_000);
    expect(rate?.input).toBe(12);
    expect(rate?.output).toBe(50);
  });

  it("returns undefined without usable cost data", () => {
    expect(resolveModelCost({ getDaemonProviderDb: () => ({ catalog: null }) }, "tiered", "long-context-model")).toBe(
      undefined,
    );
  });
});
