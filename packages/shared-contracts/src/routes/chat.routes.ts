import zod from "zod";
import {
  EntityIdSchema,
  SendMessageInputSchema,
  ToolInteractionResponseSchema,
  ToolInteractionResultSchema,
  defineRouteContract,
} from "../common";

export const chatSendMessageRoute = defineRouteContract({
  name: "chat.sendMessage",
  input: zod.object({
    sessionId: EntityIdSchema,
    content: zod.union([zod.string(), SendMessageInputSchema]),
  }),
  output: zod.object({
    accepted: zod.boolean(),
    requestId: EntityIdSchema.nullable(),
    messageId: EntityIdSchema.nullable(),
  }),
});

export const chatSteerActiveTurnRoute = defineRouteContract({
  name: "chat.steerActiveTurn",
  input: zod.object({
    sessionId: EntityIdSchema,
    content: zod.union([zod.string(), SendMessageInputSchema]),
  }),
  output: zod.object({
    accepted: zod.boolean(),
  }),
});

export const chatStopStreamRoute = defineRouteContract({
  name: "chat.stopStream",
  input: zod
    .object({
      sessionId: EntityIdSchema.optional(),
      requestId: EntityIdSchema.optional(),
    })
    .refine((value) => Boolean(value.sessionId || value.requestId), {
      message: "sessionId or requestId is required",
    }),
  output: zod.object({
    stopped: zod.boolean(),
  }),
});

export const chatRespondToolInteractionRoute = defineRouteContract({
  name: "chat.respondToolInteraction",
  input: zod.object({
    sessionId: EntityIdSchema,
    messageId: EntityIdSchema,
    toolCallId: EntityIdSchema,
    response: ToolInteractionResponseSchema,
  }),
  output: zod
    .object({
      accepted: zod.literal(true),
    })
    .extend(ToolInteractionResultSchema.shape),
});
