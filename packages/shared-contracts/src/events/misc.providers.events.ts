import zod from "zod";
import { defineEventContract } from "../common";

export const providersOllamaPullProgressEvent = defineEventContract({
  name: "providers.ollama.pull.progress",
  payload: zod.object({
    eventId: zod.string(),
    providerId: zod.string(),
    modelName: zod.string(),
    completed: zod.number().optional(),
    total: zod.number().optional(),
    status: zod.string().optional(),
    version: zod.number().int(),
  }),
});
