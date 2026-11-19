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

export const acpAuthRequiredEvent = defineEventContract({
  name: "acp.auth.required",
  payload: zod.object({
    sessionId: zod.string().nullable().optional(),
    agentId: zod.string(),
    workdir: zod.string().nullable().optional(),
    message: zod.string(),
  }),
});

export const acpAuthChangedEvent = defineEventContract({
  name: "providers.acpAuth.changed",
  payload: zod.object({
    agentId: zod.string(),
    workdir: zod.string().nullable().optional(),
    runId: zod.string().nullable().optional(),
    state: zod.enum(["running", "ready", "error", "cancelled"]),
    mode: zod.enum(["agent", "terminal"]).nullable().optional(),
    output: zod.string().nullable().optional(),
    exitCode: zod.number().nullable().optional(),
    error: zod.string().nullable().optional(),
    authStatus: zod
      .object({
        state: zod.string(),
        accounts: zod
          .array(
            zod.object({
              label: zod.string(),
              description: zod.string().nullable().optional(),
              active: zod.boolean().nullable().optional(),
              name: zod.string().nullable().optional(),
              email: zod.string().nullable().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  }),
});
