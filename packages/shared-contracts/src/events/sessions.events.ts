import zod from "zod";
import type { PendingSessionInputRecord } from "@argos/shared/types/agent-interface";
import { EntityIdSchema, SessionStatusSchema, defineEventContract } from "../common";
import { AcpConfigStateSchema } from "../domainSchemas";

const PendingSessionInputRecordSchema = zod.custom<PendingSessionInputRecord>();

const AcpSessionCommandSchema = zod.object({
  name: zod.string(),
  description: zod.string(),
  input: zod
    .object({
      hint: zod.string(),
    })
    .nullable()
    .optional(),
});

export const sessionsUpdatedEvent = defineEventContract({
  name: "sessions.updated",
  payload: zod.object({
    sessionIds: zod.array(EntityIdSchema),
    reason: zod.enum(["created", "activated", "deactivated", "list-refreshed", "updated", "deleted"]),
    activeSessionId: EntityIdSchema.nullable().optional(),
    webContentsId: zod.number().int().optional(),
  }),
});

export const sessionsStatusChangedEvent = defineEventContract({
  name: "sessions.status.changed",
  payload: zod.object({
    sessionId: EntityIdSchema,
    status: SessionStatusSchema,
    reason: zod.string().optional(),
    version: zod.number().int(),
  }),
});

export const sessionsPendingInputsChangedEvent = defineEventContract({
  name: "sessions.pendingInputs.changed",
  payload: zod.object({
    sessionId: EntityIdSchema,
    items: zod.array(PendingSessionInputRecordSchema).optional(),
    version: zod.number().int(),
  }),
});

export const sessionsAcpCommandsReadyEvent = defineEventContract({
  name: "sessions.acp.commands.ready",
  payload: zod.object({
    conversationId: EntityIdSchema,
    agentId: EntityIdSchema,
    commands: zod.array(AcpSessionCommandSchema),
    version: zod.number().int(),
  }),
});

export const sessionsAcpConfigOptionsReadyEvent = defineEventContract({
  name: "sessions.acp.configOptions.ready",
  payload: zod.object({
    conversationId: EntityIdSchema.optional(),
    agentId: EntityIdSchema,
    workdir: zod.string(),
    configState: AcpConfigStateSchema,
    version: zod.number().int(),
  }),
});
