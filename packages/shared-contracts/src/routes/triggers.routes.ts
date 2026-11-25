import zod from "zod";
import { defineRouteContract } from "../common";

export const triggerConfigSchema = zod.object({
  path: zod.string().max(2000).optional(),
  pattern: zod.string().max(200).optional(),
});

export const triggerSchema = zod.object({
  id: zod.string(),
  name: zod.string(),
  type: zod.enum(["webhook", "folder"]),
  config: triggerConfigSchema,
  prompt: zod.string(),
  agentId: zod.string(),
  sessionId: zod.string().nullable(),
  trust: zod.enum(["owner", "outside"]),
  enabled: zod.boolean(),
  webhookPath: zod.string().nullable(),
  secret: zod.string().nullable(),
  lastRunAt: zod.number().int().nullable(),
  lastError: zod.string().nullable(),
  createdAt: zod.number().int(),
  updatedAt: zod.number().int(),
});

export const triggerUpsertInputSchema = zod.object({
  id: zod.string().min(1).optional(),
  name: zod.string().min(1).max(200),
  type: zod.enum(["webhook", "folder"]),
  config: triggerConfigSchema,
  prompt: zod.string().min(1).max(20_000),
  agentId: zod.string().min(1),
  sessionId: zod.string().nullable().optional(),
  trust: zod.enum(["owner", "outside"]).optional(),
  enabled: zod.boolean().optional(),
});

export const triggersListRoute = defineRouteContract({
  name: "triggers.list",
  input: zod.object({}),
  output: zod.object({ triggers: zod.array(triggerSchema) }),
});

export const triggersUpsertRoute = defineRouteContract({
  name: "triggers.upsert",
  input: triggerUpsertInputSchema,
  output: zod.object({ trigger: triggerSchema }),
});

export const triggersRemoveRoute = defineRouteContract({
  name: "triggers.remove",
  input: zod.object({ id: zod.string().min(1) }),
  output: zod.object({ removed: zod.boolean() }),
});

export const triggersToggleRoute = defineRouteContract({
  name: "triggers.toggle",
  input: zod.object({ id: zod.string().min(1), enabled: zod.boolean() }),
  output: zod.object({ trigger: triggerSchema }),
});
