import { describe, expect, it } from "bun:test";
import { aggregateUsageStats, resolveBuiltinModelPrice } from "../src/host/usageStatsAggregator";
import type { UsageStatRecord } from "../src/host/bun-session-repository";

function record(overrides: Partial<UsageStatRecord> = {}): UsageStatRecord {
  return {
    messageId: "m1",
    sessionId: "s1",
    providerId: "pi",
    modelId: "argos",
    usageDate: "2026-08-12",
    inputTokens: 1000,
    cachedInputTokens: 200,
    cacheWriteInputTokens: 100,
    outputTokens: 300,
    reasoningTokens: 50,
    totalTokens: 1300,
    costUsd: 0.01,
    costSource: "estimated",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("aggregateUsageStats", () => {
  it("computes summary totals and cost source", () => {
    const rows = [
      record({ messageId: "a", costUsd: 0.02, costSource: "reported" }),
      record({ messageId: "b", costUsd: 0.04, costSource: "reported" }),
    ];
    const { summary } = aggregateUsageStats(rows, "30d");

    expect(summary.messageCount).toBe(2);
    expect(summary.sessionCount).toBe(1);
    expect(summary.processedTokens).toBe(2 * (1000 + 300));
    expect(summary.cachedInputTokens).toBe(400);
    expect(summary.uncachedInputTokens).toBe(2 * (1000 - 200 - 100));
    expect(summary.outputTokens).toBe(600);
    expect(summary.reasoningTokens).toBe(100);
    expect(summary.rawTokenCostUsd).toBe(0.06);
    expect(summary.costSource).toBe("reported");
  });

  it("marks cost source as mixed when sources differ", () => {
    const rows = [
      record({ messageId: "a", costSource: "reported" }),
      record({ messageId: "b", costSource: "estimated" }),
    ];
    const { summary } = aggregateUsageStats(rows, "30d");
    expect(summary.costSource).toBe("mixed");
  });

  it("returns null cost when no row has a cost", () => {
    const rows = [record({ messageId: "a", costUsd: null, costSource: "none" })];
    const { summary } = aggregateUsageStats(rows, "30d");
    expect(summary.rawTokenCostUsd).toBeNull();
    expect(summary.costSource).toBe("none");
  });

  it("groups by provider and model, excluding ACP", () => {
    const rows = [
      record({ messageId: "a", providerId: "argos", modelId: "deepseek-chat", costUsd: 0.02, totalTokens: 100 }),
      record({ messageId: "b", providerId: "acp", modelId: "opencode", costUsd: 0.06, totalTokens: 300 }),
    ];
    const { summary, services, modelBreakdown } = aggregateUsageStats(rows, "30d");

    // ACP is a protocol, not a service — excluded from every panel, including
    // the summary (so totals never disagree with the breakdown lists).
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({ id: "argos", label: "Argos", costUsd: 0.02, costShare: 1 });

    expect(modelBreakdown).toHaveLength(1);
    expect(modelBreakdown[0]).toMatchObject({ id: "deepseek-chat" });

    expect(summary.messageCount).toBe(1);
    expect(summary.processedTokens).toBe(1000 + 300);
    expect(summary.rawTokenCostUsd).toBeCloseTo(0.02, 5);
    expect(summary.costSource).toBe("estimated");
  });

  it("builds a daily series covering the window", () => {
    const rows = [record({ messageId: "a", usageDate: new Date().toISOString().slice(0, 10) })];
    const { dailySeries } = aggregateUsageStats(rows, "7d");
    expect(dailySeries).toHaveLength(7);
    expect(dailySeries.at(-1)?.totalTokens).toBe(1300);
    expect(dailySeries[0].totalTokens).toBe(0);
  });

  it("estimates cost for rows without a reported cost", () => {
    const rows = [
      record({
        messageId: "a",
        providerId: "codex",
        modelId: "gpt-5.2-codex",
        costUsd: null,
        costSource: "estimated",
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        cacheWriteInputTokens: 0,
        outputTokens: 100_000,
      }),
    ];
    const { summary, modelBreakdown } = aggregateUsageStats(rows, "30d", () => ({
      input: 3, // $3/MTok
      output: 15, // $15/MTok
    }));

    expect(summary.rawTokenCostUsd).toBeCloseTo(3 + 1.5, 5);
    expect(summary.costSource).toBe("estimated");
    expect(modelBreakdown[0].costUsd).toBeCloseTo(4.5, 5);
  });

  it("resolves builtin pricing by model prefix", () => {
    expect(resolveBuiltinModelPrice("gpt-5.6-luna")).toMatchObject({ input: 1.5, output: 8 });
    expect(resolveBuiltinModelPrice("gpt-5.6-sol")).toMatchObject({ input: 1.5, output: 8 });
    expect(resolveBuiltinModelPrice("claude-opus-4-5")).toMatchObject({ input: 15, output: 75 });
    expect(resolveBuiltinModelPrice("unknown-model")).toBeNull();
  });
});
