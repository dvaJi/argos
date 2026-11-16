import zod from "zod";
import { defineRouteContract } from "../common";

export const UsageWindowSchema = zod.enum(["past24h", "7d", "30d", "90d"]);

export const UsageDailySeriesPointSchema = zod.object({
  date: zod.string(),
  costUsd: zod.number().nullable(),
  inputTokens: zod.number(),
  outputTokens: zod.number(),
  cachedInputTokens: zod.number(),
  totalTokens: zod.number(),
});

export const UsageServiceShareSchema = zod.object({
  id: zod.string(),
  label: zod.string(),
  costUsd: zod.number().nullable(),
  costShare: zod.number(),
  totalTokens: zod.number(),
  messageCount: zod.number(),
});

export const UsageModelBreakdownItemSchema = zod.object({
  id: zod.string(),
  label: zod.string(),
  providerId: zod.string(),
  costUsd: zod.number().nullable(),
  costShare: zod.number(),
  totalTokens: zod.number(),
  inputTokens: zod.number(),
  outputTokens: zod.number(),
  cachedInputTokens: zod.number(),
  messageCount: zod.number(),
});

export const UsageCostQualitySchema = zod.object({
  /** Fraction of the computed cost that is provider-reported (0..1). */
  reportedShare: zod.number().nullable(),
  /** Fraction of the computed cost that was estimated from the catalog (0..1). */
  estimatedShare: zod.number().nullable(),
  /** Turns with no cost data at all. */
  unpricedTurns: zod.number(),
});

export const UsageSummarySchema = zod.object({
  rawTokenCostUsd: zod.number().nullable(),
  processedTokens: zod.number(),
  cachedInputTokens: zod.number(),
  uncachedInputTokens: zod.number(),
  outputTokens: zod.number(),
  reasoningTokens: zod.number(),
  cacheSavingsUsd: zod.number().nullable(),
  activeDays: zod.number(),
  messageCount: zod.number(),
  sessionCount: zod.number(),
  costSource: zod.enum(["reported", "estimated", "mixed", "none"]),
  costQuality: UsageCostQualitySchema,
});

export const UsageServiceDailySeriesSchema = zod.object({
  serviceId: zod.string(),
  points: zod.array(UsageDailySeriesPointSchema),
});

export const UsageStatsOutputSchema = zod.object({
  window: UsageWindowSchema,
  summary: UsageSummarySchema,
  dailySeries: zod.array(UsageDailySeriesPointSchema),
  serviceDailySeries: zod.array(UsageServiceDailySeriesSchema),
  services: zod.array(UsageServiceShareSchema),
  modelBreakdown: zod.array(UsageModelBreakdownItemSchema),
});

export const usageGetStatsRoute = defineRouteContract({
  name: "usage.getStats",
  input: zod.object({
    window: UsageWindowSchema.default("30d"),
    service: zod.string().optional(),
  }),
  output: UsageStatsOutputSchema,
});

export type UsageWindow = zod.infer<typeof UsageWindowSchema>;
export type UsageStatsOutput = zod.infer<typeof UsageStatsOutputSchema>;
export type UsageSummary = zod.infer<typeof UsageSummarySchema>;
export type UsageCostQuality = zod.infer<typeof UsageCostQualitySchema>;
export type UsageDailySeriesPoint = zod.infer<typeof UsageDailySeriesPointSchema>;
export type UsageServiceShare = zod.infer<typeof UsageServiceShareSchema>;
export type UsageServiceDailySeries = zod.infer<typeof UsageServiceDailySeriesSchema>;
export type UsageModelBreakdownItem = zod.infer<typeof UsageModelBreakdownItemSchema>;

/** One subscription quota window (e.g. Codex 5h session, 7d weekly). */
export const UsageLimitWindowSchema = zod.object({
  id: zod.string(),
  label: zod.string(),
  /** 0..100, already rolled over to 0 when the window has reset. */
  usedPercent: zod.number(),
  windowMinutes: zod.number().nullable(),
  /** Epoch ms of the next reset, when known. */
  resetsAt: zod.number().nullable(),
});

export const UsageLimitProviderSchema = zod.object({
  id: zod.string(),
  label: zod.string(),
  plan: zod.string().nullable(),
  /** Epoch ms of the log entry the snapshot came from. */
  observedAt: zod.number().nullable(),
  windows: zod.array(UsageLimitWindowSchema),
});

export const UsageLimitsOutputSchema = zod.object({
  providers: zod.array(UsageLimitProviderSchema),
});

export const usageGetLimitsRoute = defineRouteContract({
  name: "usage.getLimits",
  input: zod.object({}).default({}),
  output: UsageLimitsOutputSchema,
});

export type UsageLimitWindow = zod.infer<typeof UsageLimitWindowSchema>;
export type UsageLimitProvider = zod.infer<typeof UsageLimitProviderSchema>;
export type UsageLimitsOutput = zod.infer<typeof UsageLimitsOutputSchema>;
