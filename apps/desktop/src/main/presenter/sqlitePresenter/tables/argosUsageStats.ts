import type { DatabaseLike as Database } from "../dbType";
import { BaseTable } from "./baseTable";
import type { UsageStatsRecordInput } from "../../usageStats";

export interface ArgosUsageStatsRow {
  message_id: string;
  session_id: string;
  usage_date: string;
  provider_id: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens: number;
  estimated_cost_usd: number | null;
  source: "backfill" | "live";
  created_at: number;
  updated_at: number;
}

type AggregateRow = {
  message_count: number;
  session_count: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cached_input_tokens: number | null;
  estimated_cost_usd: number | null;
  priced_messages: number;
};

export interface ArgosUsageStatsSummary {
  messageCount: number;
  sessionCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number | null;
}

export interface ArgosUsageStatsMostActiveDay {
  date: string | null;
  messageCount: number;
}

export interface ArgosUsageStatsCalendarRow {
  date: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number | null;
}

export interface ArgosUsageStatsBreakdownRow {
  id: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number | null;
}

function normalizeAggregate(row: AggregateRow | undefined): ArgosUsageStatsSummary {
  return {
    messageCount: row?.message_count ?? 0,
    sessionCount: row?.session_count ?? 0,
    inputTokens: row?.input_tokens ?? 0,
    outputTokens: row?.output_tokens ?? 0,
    totalTokens: row?.total_tokens ?? 0,
    cachedInputTokens: row?.cached_input_tokens ?? 0,
    estimatedCostUsd: row && row.priced_messages > 0 ? (row.estimated_cost_usd ?? 0) : null,
  };
}

export class ArgosUsageStatsTable extends BaseTable {
  constructor(db: Database) {
    super(db, "argos_usage_stats");
  }

  getCreateTableSQL(): string {
    return `
      CREATE TABLE IF NOT EXISTS argos_usage_stats (
        message_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        usage_date TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_input_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL,
        source TEXT NOT NULL DEFAULT 'live',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_argos_usage_stats_date ON argos_usage_stats(usage_date);
      CREATE INDEX IF NOT EXISTS idx_argos_usage_stats_provider_date ON argos_usage_stats(provider_id, usage_date);
      CREATE INDEX IF NOT EXISTS idx_argos_usage_stats_model_date ON argos_usage_stats(model_id, usage_date);
    `;
  }

  getMigrationSQL(version: number): string | null {
    if (version === 17) {
      return this.getCreateTableSQL();
    }
    if (version === 22) {
      return `ALTER TABLE argos_usage_stats ADD COLUMN cache_write_input_tokens INTEGER NOT NULL DEFAULT 0;`;
    }
    return null;
  }

  getLatestVersion(): number {
    return 22;
  }

  upsert(row: UsageStatsRecordInput): void {
    this.db
      .prepare(
        `INSERT INTO argos_usage_stats (
          message_id,
          session_id,
          usage_date,
          provider_id,
          model_id,
          input_tokens,
          output_tokens,
          total_tokens,
          cached_input_tokens,
          cache_write_input_tokens,
          estimated_cost_usd,
          source,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(message_id) DO UPDATE SET
          session_id = excluded.session_id,
          usage_date = excluded.usage_date,
          provider_id = excluded.provider_id,
          model_id = excluded.model_id,
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          total_tokens = excluded.total_tokens,
          cached_input_tokens = excluded.cached_input_tokens,
          cache_write_input_tokens = excluded.cache_write_input_tokens,
          estimated_cost_usd = excluded.estimated_cost_usd,
          source = excluded.source,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        row.messageId,
        row.sessionId,
        row.usageDate,
        row.providerId,
        row.modelId,
        row.inputTokens,
        row.outputTokens,
        row.totalTokens,
        row.cachedInputTokens,
        row.cacheWriteInputTokens,
        row.estimatedCostUsd,
        row.source,
        row.createdAt,
        row.updatedAt,
      );
  }

  getByMessageId(messageId: string): ArgosUsageStatsRow | undefined {
    return this.db.prepare("SELECT * FROM argos_usage_stats WHERE message_id = ?").get(messageId) as
      | ArgosUsageStatsRow
      | undefined;
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM argos_usage_stats").get() as {
      count: number;
    };
    return row.count;
  }

  deleteAll(): void {
    this.db.prepare("DELETE FROM argos_usage_stats").run();
  }

  getRecordingStartedAt(): number | null {
    const row = this.db.prepare("SELECT MIN(created_at) AS started_at FROM argos_usage_stats").get() as {
      started_at: number | null;
    };
    return row.started_at ?? null;
  }

  getSummary(): ArgosUsageStatsSummary {
    const row = this.db
      .prepare(
        `SELECT
          COUNT(*) AS message_count,
          COUNT(DISTINCT session_id) AS session_count,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(total_tokens) AS total_tokens,
          SUM(cached_input_tokens) AS cached_input_tokens,
          SUM(COALESCE(estimated_cost_usd, 0)) AS estimated_cost_usd,
          COUNT(estimated_cost_usd) AS priced_messages
        FROM argos_usage_stats`,
      )
      .get() as AggregateRow | undefined;

    return normalizeAggregate(row);
  }

  getMostActiveDay(): ArgosUsageStatsMostActiveDay {
    const row = this.db
      .prepare(
        `SELECT
          usage_date AS date,
          COUNT(*) AS message_count
        FROM argos_usage_stats
        GROUP BY usage_date
        ORDER BY message_count DESC, usage_date ASC
        LIMIT 1`,
      )
      .get() as { date: string | null; message_count: number | null } | undefined;

    return {
      date: row?.date ?? null,
      messageCount: row?.message_count ?? 0,
    };
  }

  getDailyCalendarRows(dateFrom: string): ArgosUsageStatsCalendarRow[] {
    const rows = this.db
      .prepare(
        `SELECT
          usage_date AS date,
          COUNT(*) AS message_count,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(total_tokens) AS total_tokens,
          SUM(cached_input_tokens) AS cached_input_tokens,
          SUM(COALESCE(estimated_cost_usd, 0)) AS estimated_cost_usd,
          COUNT(estimated_cost_usd) AS priced_messages
        FROM argos_usage_stats
        WHERE usage_date >= ?
        GROUP BY usage_date
        ORDER BY usage_date ASC`,
      )
      .all(dateFrom) as Array<AggregateRow & { date: string }>;

    return rows.map((row) => ({
      date: row.date,
      messageCount: row.message_count,
      inputTokens: row.input_tokens ?? 0,
      outputTokens: row.output_tokens ?? 0,
      totalTokens: row.total_tokens ?? 0,
      cachedInputTokens: row.cached_input_tokens ?? 0,
      estimatedCostUsd: row.priced_messages > 0 ? (row.estimated_cost_usd ?? 0) : null,
    }));
  }

  getProviderBreakdownRows(): ArgosUsageStatsBreakdownRow[] {
    const rows = this.db
      .prepare(
        `SELECT
          provider_id AS id,
          COUNT(*) AS message_count,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(total_tokens) AS total_tokens,
          SUM(cached_input_tokens) AS cached_input_tokens,
          SUM(COALESCE(estimated_cost_usd, 0)) AS estimated_cost_usd,
          COUNT(estimated_cost_usd) AS priced_messages
        FROM argos_usage_stats
        GROUP BY provider_id`,
      )
      .all() as Array<AggregateRow & { id: string }>;

    return rows.map((row) => ({
      id: row.id,
      messageCount: row.message_count,
      inputTokens: row.input_tokens ?? 0,
      outputTokens: row.output_tokens ?? 0,
      totalTokens: row.total_tokens ?? 0,
      cachedInputTokens: row.cached_input_tokens ?? 0,
      estimatedCostUsd: row.priced_messages > 0 ? (row.estimated_cost_usd ?? 0) : null,
    }));
  }

  getModelBreakdownRows(limit = 10): ArgosUsageStatsBreakdownRow[] {
    const rows = this.db
      .prepare(
        `SELECT
          model_id AS id,
          COUNT(*) AS message_count,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(total_tokens) AS total_tokens,
          SUM(cached_input_tokens) AS cached_input_tokens,
          SUM(COALESCE(estimated_cost_usd, 0)) AS estimated_cost_usd,
          COUNT(estimated_cost_usd) AS priced_messages
        FROM argos_usage_stats
        GROUP BY model_id
        ORDER BY
          CASE WHEN COUNT(estimated_cost_usd) > 0 THEN SUM(COALESCE(estimated_cost_usd, 0)) ELSE -1 END DESC,
          SUM(total_tokens) DESC,
          model_id ASC
        LIMIT ?`,
      )
      .all(limit) as Array<AggregateRow & { id: string }>;

    return rows.map((row) => ({
      id: row.id,
      messageCount: row.message_count,
      inputTokens: row.input_tokens ?? 0,
      outputTokens: row.output_tokens ?? 0,
      totalTokens: row.total_tokens ?? 0,
      cachedInputTokens: row.cached_input_tokens ?? 0,
      estimatedCostUsd: row.priced_messages > 0 ? (row.estimated_cost_usd ?? 0) : null,
    }));
  }
}
