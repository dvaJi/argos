import zod from "zod";
import { defineEventContract } from "../common";

export const triggersUpdatedEvent = defineEventContract({
  name: "triggers.updated",
  payload: zod.object({
    triggerId: zod.string(),
    version: zod.number().int(),
  }),
});
