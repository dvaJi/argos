import zod from "zod";
import { TimestampMsSchema, defineEventContract } from "../common";

export const providersChangedEvent = defineEventContract({
  name: "providers.changed",
  payload: zod.object({
    reason: zod.enum([
      "providers",
      "provider-atomic-update",
      "provider-batch-update",
      "provider-db-loaded",
      "provider-db-updated",
    ]),
    providerIds: zod.array(zod.string()).optional(),
    version: TimestampMsSchema,
  }),
});
