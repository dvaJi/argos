import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { usageGetStatsRoute } from "@argos/shared-contracts/routes";
import { BunSessionRepository, type UsageStatRecord } from "../src/host/bun-session-repository";

/**
 * Proves `usage.getStats` returns aggregated data through the daemon dispatcher
 * when the session repository has usage rows — the same path the Pi/ACP
 * execution ports write through.
 */
const testDirs: string[] = [];
let usageHome = "";

beforeEach(() => {
  usageHome = fs.mkdtempSync(path.join(os.tmpdir(), "argos-usage-home-"));
  testDirs.push(usageHome);
  process.env.ARGOS_USAGE_HOME = usageHome;
});

afterEach(() => {
  delete process.env.ARGOS_USAGE_HOME;
  for (const dir of testDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function createUsageFakeDb() {
  const usageStats = new Map<string, Record<string, unknown>>();

  const db = {
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

function seedRecord(overrides: Partial<UsageStatRecord> = {}): UsageStatRecord {
  // Local date key, matching production's usageDateKey/toDateKey (never UTC).
  const now = new Date();
  const localDate = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
  return {
    messageId: "m1",
    sessionId: "s1",
    providerId: "argos",
    modelId: "argos",
    usageDate: localDate,
    inputTokens: 1000,
    cachedInputTokens: 200,
    cacheWriteInputTokens: 100,
    outputTokens: 300,
    reasoningTokens: 50,
    totalTokens: 1300,
    costUsd: 0.0123,
    costSource: "reported",
    createdAt: Date.now(),
    ...overrides,
  };
}

/** Build a dispatcher wired to the fake usage DB + repository (14 positional args). */
function createUsageDispatch(repo: BunSessionRepository, db: unknown) {
  return createDaemonDispatcher(
    {} as never,
    {} as never,
    repo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    db as never,
  );
}

describe("usage.getStats dispatch", () => {
  it("aggregates repository usage rows into the route response", async () => {
    const db = createUsageFakeDb();
    const repo = new BunSessionRepository(db as never, undefined);
    repo.upsertUsageStat(seedRecord());
    repo.upsertUsageStat(
      seedRecord({ messageId: "m2", providerId: "acp", modelId: "opencode", costUsd: 0.04, costSource: "estimated" }),
    );

    const dispatch = createUsageDispatch(repo, db);

    const result = await dispatch(usageGetStatsRoute.name, { window: "30d" });

    expect(result.summary.messageCount).toBe(1);
    expect(result.summary.processedTokens).toBe(1300);
    expect(result.summary.rawTokenCostUsd).toBeCloseTo(0.0123, 5);
    expect(result.summary.costSource).toBe("reported");
    // ACP rows are excluded from the summary entirely (protocol, not a service).
    expect(result.services).toHaveLength(1);
    expect(result.services[0]).toMatchObject({ id: "argos", label: "Argos" });
    expect(result.modelBreakdown).toHaveLength(1);
    expect(result.dailySeries.at(-1)?.totalTokens).toBe(1300);
  });

  it("filters rows by service when a provider id is requested", async () => {
    const db = createUsageFakeDb();
    const repo = new BunSessionRepository(db as never, undefined);
    repo.upsertUsageStat(seedRecord({ messageId: "m1" }));
    repo.upsertUsageStat(
      seedRecord({
        messageId: "m2",
        providerId: "codex",
        modelId: "gpt-5.6-luna",
        costUsd: 0.1,
        costSource: "estimated",
      }),
    );

    const dispatch = createUsageDispatch(repo, db);

    const result = await dispatch(usageGetStatsRoute.name, { window: "30d", service: "codex" });

    expect(result.summary.messageCount).toBe(1);
    expect(result.summary.rawTokenCostUsd).toBeCloseTo(0.1, 5);
    expect(result.services).toHaveLength(1);
    expect(result.services[0]).toMatchObject({ id: "codex" });
    expect(result.modelBreakdown).toHaveLength(1);
    expect(result.modelBreakdown[0]).toMatchObject({ providerId: "codex", label: "gpt-5.6-luna" });
  });

  it("returns an empty-but-valid payload when no usage rows exist", async () => {
    const db = createUsageFakeDb();
    const repo = new BunSessionRepository(db as never, undefined);

    const dispatch = createUsageDispatch(repo, db);

    const result = await dispatch(usageGetStatsRoute.name, { window: "30d" });
    expect(result.summary.messageCount).toBe(0);
    expect(result.summary.rawTokenCostUsd).toBeNull();
    expect(result.services).toEqual([]);
    expect(result.modelBreakdown).toEqual([]);
    expect(result.dailySeries).toHaveLength(30);
  });
});
