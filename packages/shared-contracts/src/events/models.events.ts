import zod from "zod";
import { TimestampMsSchema, defineEventContract } from "../common";
import { ModelConfigSchema } from "../domainSchemas";

export const modelsChangedEvent = defineEventContract({
  name: "models.changed",
  payload: zod.object({
    reason: zod.enum([
      "provider-models",
      "custom-models",
      "provider-db-loaded",
      "provider-db-updated",
      "runtime-refresh",
      "agents",
    ]),
    providerId: zod.string().optional(),
    version: TimestampMsSchema,
  }),
});

export const modelsStatusChangedEvent = defineEventContract({
  name: "models.status.changed",
  payload: zod.object({
    providerId: zod.string(),
    modelId: zod.string(),
    enabled: zod.boolean(),
    version: TimestampMsSchema,
  }),
});

export const modelBatchStatusChangedEvent = defineEventContract({
  name: "models.batch.status.changed",
  payload: zod.object({
    providerId: zod.string(),
    updates: zod.array(
      zod.object({
        modelId: zod.string(),
        enabled: zod.boolean(),
      }),
    ),
    version: TimestampMsSchema,
  }),
});

export const modelsConfigChangedEvent = defineEventContract({
  name: "models.config.changed",
  payload: zod.object({
    changeType: zod.enum(["updated", "reset", "imported"]),
    providerId: zod.string().optional(),
    modelId: zod.string().optional(),
    config: ModelConfigSchema.optional(),
    overwrite: zod.boolean().optional(),
    version: TimestampMsSchema,
  }),
});
