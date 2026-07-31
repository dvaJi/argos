import zod from "zod";
import { TimestampMsSchema, defineEventContract } from "../common";

const rateLimitConfigPayload = zod.object({
  providerId: zod.string(),
  config: zod.object({
    qpsLimit: zod.number(),
    enabled: zod.boolean(),
  }),
});

/** A provider's rate-limit config changed. */
export const providersRateLimitConfigUpdatedEvent = defineEventContract({
  name: "providers.rateLimitConfigUpdated",
  payload: rateLimitConfigPayload,
});

/** A provider call was queued waiting for a rate-limit slot. */
export const providersRateLimitRequestQueuedEvent = defineEventContract({
  name: "providers.rateLimitRequestQueued",
  payload: zod.object({
    providerId: zod.string(),
    queueLength: zod.number().int().nonnegative(),
    requestId: zod.string(),
  }),
});

/** A queued/allotted provider call completed (counts against the QPS budget). */
export const providersRateLimitRequestExecutedEvent = defineEventContract({
  name: "providers.rateLimitRequestExecuted",
  payload: zod.object({
    providerId: zod.string(),
    timestamp: TimestampMsSchema,
    currentQps: zod.number(),
  }),
});

/** A provider call was rejected because the rate limit was exceeded. */
export const providersRateLimitLimitExceededEvent = defineEventContract({
  name: "providers.rateLimitLimitExceeded",
  payload: zod.object({
    providerId: zod.string(),
    timestamp: TimestampMsSchema,
  }),
});
