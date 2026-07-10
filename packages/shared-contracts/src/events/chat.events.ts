import zod from "zod";
import { AssistantMessageBlockSchema, EntityIdSchema, TimestampMsSchema, defineEventContract } from "../common";

const AgentPlanItemSchema = zod.object({
  step: zod.string(),
  status: zod.enum(["pending", "in_progress", "completed"]),
});

export const chatStreamUpdatedEvent = defineEventContract({
  name: "chat.stream.updated",
  payload: zod.object({
    kind: zod.literal("snapshot"),
    requestId: EntityIdSchema,
    sessionId: EntityIdSchema,
    messageId: EntityIdSchema,
    updatedAt: TimestampMsSchema,
    blocks: zod.array(AssistantMessageBlockSchema),
  }),
});

export const chatStreamCompletedEvent = defineEventContract({
  name: "chat.stream.completed",
  payload: zod.object({
    requestId: EntityIdSchema,
    sessionId: EntityIdSchema,
    messageId: EntityIdSchema,
    completedAt: TimestampMsSchema,
  }),
});

export const chatStreamFailedEvent = defineEventContract({
  name: "chat.stream.failed",
  payload: zod.object({
    requestId: EntityIdSchema,
    sessionId: EntityIdSchema,
    messageId: EntityIdSchema,
    failedAt: TimestampMsSchema,
    error: zod.string(),
  }),
});

export const chatPlanUpdatedEvent = defineEventContract({
  name: "chat.plan.updated",
  payload: zod.object({
    sessionId: EntityIdSchema,
    messageId: EntityIdSchema,
    toolCallId: zod.string().optional(),
    plan: zod.array(AgentPlanItemSchema),
    explanation: zod.string().optional(),
    revision: zod.number().int().positive(),
    updatedAt: zod.string(),
  }),
});
