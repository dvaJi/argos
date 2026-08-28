import type {
  UsageDailySeriesPoint,
  UsageModelBreakdownItem,
  UsageServiceDailySeries,
  UsageServiceShare,
  UsageSummary,
} from "@argos/shared-contracts/routes";
import type { UsageStatRecord, UsageWindow } from "./bun-session-repository";

/**
 * Aggregates raw `daemon_usage_stats` rows into the `usage.getStats` response
 * shape. Pure + unit-testable; the daemon dispatcher feeds it rows from SQLite.
 */

export interface UsageAggregation {
  summary: UsageSummary;
  dailySeries: UsageDailySeriesPoint[];
  serviceDailySeries: UsageServiceDailySeries[];
  services: UsageServiceShare[];
  modelBreakdown: UsageModelBreakdownItem[];
}

/**
 * Resolve per-MTok pricing for a provider/model so `costUsd: null` rows
 * (e.g. scanned local Codex/Claude sessions) can be estimated.
 */
export type UsageCostEstimator = (
  providerId: string,
  modelId: string,
  /** Prompt size of the request — enables long-context tiered pricing. */
  contextTokens?: number,
) => {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
} | null;

/**
 * Built-in per-MTok pricing (USD) fallback for models the daemon's provider DB
 * may not cover. Mirrors public API rates for Codex (OpenAI) and Claude models.
 */
const BUILTIN_MODEL_PRICES: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> =
  {
    // OpenAI Codex / GPT-5.x (per MTok)
    "gpt-5.6": { input: 1.5, output: 8, cacheRead: 0.15, cacheWrite: 1.5 },
    "gpt-5.5": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
    "gpt-5.4": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
    "gpt-5.3": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
    "gpt-5.2": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
    "gpt-5.1": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
    "gpt-5": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
    "gpt-4.1": { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
    "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5 },
    o3: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
    "o4-mini": { input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 1.1 },
    // Anthropic Claude (per MTok)
    "claude-opus": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    "claude-sonnet": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    "claude-haiku": { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  };

/** Match a model id against the built-in table by prefix (e.g. gpt-5.6-luna → gpt-5.6). */
export function resolveBuiltinModelPrice(modelId: string): {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
} | null {
  const normalized = modelId.toLowerCase();
  const keys = Object.keys(BUILTIN_MODEL_PRICES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (normalized.startsWith(key)) {
      return BUILTIN_MODEL_PRICES[key];
    }
  }
  return null;
}

export function aggregateUsageStats(
  rows: UsageStatRecord[],
  window: UsageWindow,
  estimateCost?: UsageCostEstimator,
): UsageAggregation {
  // ACP is a protocol, not a service: its rows carry cumulative context size
  // (or cost only) and no real per-model token splits. Filter them once so
  // summary, daily series, services, and breakdown all use the same dataset.
  const scoped = rows.filter((row) => row.providerId !== "acp");
  const priced = estimateCost
    ? scoped.map((row) => (row.costUsd !== null ? row : estimateRowCost(row, estimateCost)))
    : scoped;
  const summary = buildSummary(priced, estimateCost);
  return {
    summary,
    dailySeries: buildDailySeries(priced, window),
    serviceDailySeries: buildServiceDailySeries(priced, window),
    services: buildServices(priced),
    modelBreakdown: buildModelBreakdown(priced),
  };
}

function estimateRowCost(row: UsageStatRecord, estimateCost: UsageCostEstimator): UsageStatRecord {
  // The context size that drives long-context tiered pricing is the prompt
  // size (inputTokens includes cached + cache-write portions; output excluded).
  const rate = estimateCost(row.providerId, row.modelId, row.inputTokens);
  if (!rate) return row;
  const uncachedInput = Math.max(row.inputTokens - row.cachedInputTokens - row.cacheWriteInputTokens, 0);
  const costUsd =
    (uncachedInput * rate.input +
      row.outputTokens * rate.output +
      row.cachedInputTokens * (rate.cacheRead ?? rate.input) +
      row.cacheWriteInputTokens * (rate.cacheWrite ?? rate.input)) /
    1_000_000;
  return { ...row, costUsd, costSource: "estimated" };
}

function costSourceFor(rows: UsageStatRecord[]): UsageSummary["costSource"] {
  const sources = new Set(rows.map((row) => row.costSource));
  if (sources.size === 0) return "none";
  if (sources.size === 1) return sources.has("reported") ? "reported" : sources.has("estimated") ? "estimated" : "none";
  return "mixed";
}

function buildSummary(rows: UsageStatRecord[], estimateCost?: UsageCostEstimator): UsageSummary {
  const inputTokens = rows.reduce((sum, row) => sum + row.inputTokens, 0);
  const outputTokens = rows.reduce((sum, row) => sum + row.outputTokens, 0);
  const cachedInputTokens = rows.reduce((sum, row) => sum + row.cachedInputTokens, 0);
  const cacheWriteInputTokens = rows.reduce((sum, row) => sum + row.cacheWriteInputTokens, 0);
  const reasoningTokens = rows.reduce((sum, row) => sum + row.reasoningTokens, 0);
  const processedTokens = inputTokens + outputTokens;
  const rawCost = rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);

  // Cache savings: what cached input would have cost at the real input rate.
  // Use the cost estimator's input price (per MTok), never the observed
  // cost/token ratio (which includes output + cache cost and overstates).
  let cacheSavingsUsd: number | null = null;
  if (estimateCost && cachedInputTokens > 0) {
    const inputRates = new Set<number>();
    for (const row of rows) {
      const rate = estimateCost(row.providerId, row.modelId);
      if (rate) inputRates.add(rate.input);
    }
    if (inputRates.size === 1) {
      cacheSavingsUsd = (cachedInputTokens * Array.from(inputRates)[0]) / 1_000_000;
    }
  }

  const activeDays = new Set(rows.map((row) => row.usageDate)).size;
  const sessionIds = new Set(rows.map((row) => row.sessionId));

  // Cost quality (t3code-style CostQuality shares): how much of the computed
  // cost is provider-reported vs estimated from the catalog, plus how many
  // turns carried no cost data at all.
  let reportedCostUsd = 0;
  let estimatedCostUsd = 0;
  let unpricedTurns = 0;
  for (const row of rows) {
    if (row.costSource === "reported" && row.costUsd !== null) reportedCostUsd += row.costUsd;
    else if (row.costSource === "estimated" && row.costUsd !== null) estimatedCostUsd += row.costUsd;
    else unpricedTurns += 1;
  }
  const qualityTotal = reportedCostUsd + estimatedCostUsd;
  const costQuality: UsageSummary["costQuality"] = {
    reportedShare: qualityTotal > 0 ? reportedCostUsd / qualityTotal : null,
    estimatedShare: qualityTotal > 0 ? estimatedCostUsd / qualityTotal : null,
    unpricedTurns,
  };

  return {
    rawTokenCostUsd: rawCost > 0 ? rawCost : null,
    processedTokens,
    cachedInputTokens,
    uncachedInputTokens: Math.max(inputTokens - cachedInputTokens - cacheWriteInputTokens, 0),
    outputTokens,
    reasoningTokens,
    cacheSavingsUsd,
    activeDays,
    messageCount: rows.length,
    sessionCount: sessionIds.size,
    costSource: costSourceFor(rows),
    costQuality,
  };
}

function buildDailySeries(rows: UsageStatRecord[], window: UsageWindow): UsageDailySeriesPoint[] {
  const byDate = new Map<string, { costUsd: number; input: number; output: number; cached: number; total: number }>();
  for (const row of rows) {
    const bucket = byDate.get(row.usageDate) ?? { costUsd: 0, input: 0, output: 0, cached: 0, total: 0 };
    bucket.costUsd += row.costUsd ?? 0;
    bucket.input += row.inputTokens;
    bucket.output += row.outputTokens;
    bucket.cached += row.cachedInputTokens;
    bucket.total += row.totalTokens;
    byDate.set(row.usageDate, bucket);
  }

  const days: UsageDailySeriesPoint[] = [];
  const now = new Date();
  const count = window === "past24h" ? 1 : window === "7d" ? 7 : window === "30d" ? 30 : 90;
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
    const bucket = byDate.get(key);
    days.push({
      date: key,
      costUsd: bucket && bucket.costUsd > 0 ? bucket.costUsd : null,
      inputTokens: bucket?.input ?? 0,
      outputTokens: bucket?.output ?? 0,
      cachedInputTokens: bucket?.cached ?? 0,
      totalTokens: bucket?.total ?? 0,
    });
  }
  return days;
}

/** Per-service daily series, so the UI can filter the chart by harness client-side. */
function buildServiceDailySeries(rows: UsageStatRecord[], window: UsageWindow): UsageServiceDailySeries[] {
  const byService = new Map<string, UsageStatRecord[]>();
  for (const row of rows) {
    const list = byService.get(row.providerId) ?? [];
    list.push(row);
    byService.set(row.providerId, list);
  }
  return Array.from(byService.entries()).map(([serviceId, serviceRows]) => ({
    serviceId,
    points: buildDailySeries(serviceRows, window),
  }));
}

/** Service display names for the usage view service band. */
const SERVICE_LABELS: Record<string, string> = {
  argos: "Argos",
  codex: "Codex",
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  gemini: "Gemini",
  pi: "Argos",
};

function buildServices(rows: UsageStatRecord[]): UsageServiceShare[] {
  const byProvider = new Map<string, { id: string; costUsd: number; totalTokens: number; messageCount: number }>();
  for (const row of rows) {
    const bucket = byProvider.get(row.providerId) ?? {
      id: row.providerId,
      costUsd: 0,
      totalTokens: 0,
      messageCount: 0,
    };
    bucket.costUsd += row.costUsd ?? 0;
    bucket.totalTokens += row.totalTokens;
    bucket.messageCount += 1;
    byProvider.set(row.providerId, bucket);
  }

  const totalCost = Array.from(byProvider.values()).reduce((sum, item) => sum + item.costUsd, 0);
  const services = Array.from(byProvider.values()).map((item) => ({
    ...item,
    label: SERVICE_LABELS[item.id] ?? item.id,
    costShare: totalCost > 0 ? item.costUsd / totalCost : 0,
  }));
  services.sort((a, b) => b.costUsd - a.costUsd);
  return services;
}

function buildModelBreakdown(rows: UsageStatRecord[]): UsageModelBreakdownItem[] {
  const byModel = new Map<
    string,
    {
      id: string;
      label: string;
      providerId: string;
      costUsd: number;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      messageCount: number;
    }
  >();
  for (const row of rows) {
    const key = `${row.providerId}::${row.modelId}`;
    const bucket = byModel.get(key) ?? {
      id: row.modelId,
      label: row.modelId,
      providerId: row.providerId,
      costUsd: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      messageCount: 0,
    };
    bucket.costUsd += row.costUsd ?? 0;
    bucket.totalTokens += row.totalTokens;
    bucket.inputTokens += row.inputTokens;
    bucket.outputTokens += row.outputTokens;
    bucket.cachedInputTokens += row.cachedInputTokens;
    bucket.messageCount += 1;
    byModel.set(key, bucket);
  }

  const totalCost = Array.from(byModel.values()).reduce((sum, item) => sum + item.costUsd, 0);
  const items = Array.from(byModel.values()).map((item) => ({
    ...item,
    costShare: totalCost > 0 ? item.costUsd / totalCost : 0,
  }));
  items.sort((a, b) => b.costUsd - a.costUsd);
  return items;
}
