import { describe, expect, it, vi } from "vitest";
import {
  BunSessionRepository,
  usageWindowCutoffMs,
  usageDateKey,
  type UsageStatRecord,
} from "../src/host/bun-session-repository";

/**
 * Focused tests for the daemon usage-stats capture layer.
 *
 * `BunSessionRepository` runs against `bun:sqlite` at runtime, which isn't
 * available under vitest (node env), so we emulate the small SQL surface the
 * repository uses for `upsertUsageStat` / `getUsageStatsRows` with in-memory maps.
 */
function createUsageFakeDb() {
  const usageStats = new Map<string, Record<string, unknown>>();

  const db = {
    state: { usageStats },
    exec: vi.fn(),
    prepare(sql: string) {
      return {
        run: (...params: unknown[]) => {
          if (sql.includes("INSERT INTO daemon_usage_stats")) {
            const [
              message_id,
              session_id,
              provider_id,
              model_id,
              usage_date,
              input_tokens,
              cached_input_tokens,
              cache_write_input_tokens,
              output_tokens,
              reasoning_tokens,
              total_tokens,
              cost_usd,
              cost_source,
              created_at,
            ] = params as unknown[];
            usageStats.set(String(message_id), {
              message_id,
              session_id,
              provider_id,
              model_id,
              usage_date,
              input_tokens,
              cached_input_tokens,
              cache_write_input_tokens,
              output_tokens,
              reasoning_tokens,
              total_tokens,
              cost_usd,
              cost_source,
              created_at,
            });
            return { changes: 1 };
          }
          return { changes: 0 };
        },
        all: (...params: unknown[]) => {
          if (sql.includes("FROM daemon_usage_stats")) {
            const [cutoff] = params as unknown[];
            return Array.from(usageStats.values()).filter((row) => (row.created_at as number) >= (cutoff as number));
          }
          return [];
        },
        get: () => undefined,
      };
    },
  };

  return db;
}

function makeRepository(db: ReturnType<typeof createUsageFakeDb>): BunSessionRepository {
  return new BunSessionRepository(db as never, undefined);
}

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

describe("usage window helpers", () => {
  it("computes the cutoff for each window", () => {
    const now = 1_800_000_000_000;
    expect(usageWindowCutoffMs("past24h", now)).toBe(now - 24 * 60 * 60 * 1000);
    expect(usageWindowCutoffMs("7d", now)).toBe(now - 7 * 24 * 60 * 60 * 1000);
    expect(usageWindowCutoffMs("30d", now)).toBe(now - 30 * 24 * 60 * 60 * 1000);
    expect(usageWindowCutoffMs("90d", now)).toBe(now - 90 * 24 * 60 * 60 * 1000);
  });

  it("formats local date keys", () => {
    expect(usageDateKey(new Date(2026, 7, 12).getTime())).toBe("2026-08-12");
    expect(usageDateKey(new Date(2026, 0, 3).getTime())).toBe("2026-01-03");
  });
});

describe("BunSessionRepository usage stats", () => {
  it("upserts and reads back a usage stat", () => {
    const db = createUsageFakeDb();
    const repo = makeRepository(db);

    repo.upsertUsageStat(record());

    const rows = repo.getUsageStatsRows("30d");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      messageId: "m1",
      sessionId: "s1",
      providerId: "pi",
      modelId: "argos",
      inputTokens: 1000,
      cachedInputTokens: 200,
      cacheWriteInputTokens: 100,
      outputTokens: 300,
      reasoningTokens: 50,
      totalTokens: 1300,
      costUsd: 0.01,
      costSource: "estimated",
    });
  });

  it("overwrites on conflict by message id", () => {
    const db = createUsageFakeDb();
    const repo = makeRepository(db);

    repo.upsertUsageStat(record({ messageId: "m1", totalTokens: 100 }));
    repo.upsertUsageStat(record({ messageId: "m1", totalTokens: 250 }));

    const rows = repo.getUsageStatsRows("30d");
    expect(rows).toHaveLength(1);
    expect(rows[0].totalTokens).toBe(250);
  });

  it("filters rows by window cutoff", () => {
    const db = createUsageFakeDb();
    const repo = makeRepository(db);

    const now = Date.now();
    repo.upsertUsageStat(record({ messageId: "old", createdAt: now - 60 * 24 * 60 * 60 * 1000 }));
    repo.upsertUsageStat(record({ messageId: "new", createdAt: now - 60 * 60 * 1000 }));

    expect(repo.getUsageStatsRows("7d")).toHaveLength(1);
    expect(repo.getUsageStatsRows("7d")[0].messageId).toBe("new");
    expect(repo.getUsageStatsRows("90d")).toHaveLength(2);
  });
});
