import { dialogRequestSchema } from "../routes/dialog.routes";
import { defineEventContract } from "../common";
import zod from "zod";

export const dialogRequestedEvent = defineEventContract({
  name: "dialog.requested",
  payload: dialogRequestSchema.extend({
    version: zod.number().int(),
  }),
});
