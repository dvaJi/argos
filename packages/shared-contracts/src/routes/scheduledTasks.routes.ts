import zod from "zod";
import { defineRouteContract } from "../common";
import {
  SCHEDULED_TASKS_VERSION,
  SCHEDULED_TASK_TRIGGER_KINDS,
  SCHEDULED_TASK_ACTION_KINDS,
} from "@shared/scheduledTasks";

export const scheduledTaskTriggerKindSchema = zod.enum(SCHEDULED_TASK_TRIGGER_KINDS);
export const scheduledTaskActionKindSchema = zod.enum(SCHEDULED_TASK_ACTION_KINDS);

const hourSchema = zod.number().int().min(0).max(23);
const minuteSchema = zod.number().int().min(0).max(59);
const dayOfWeekSchema = zod.number().int().min(0).max(6);

export const scheduledTaskTriggerSchema = zod.discriminatedUnion("kind", [
  zod.object({
    kind: zod.literal("once"),
    firesAt: zod.number().int().nonnegative(),
  }),
  zod.object({
    kind: zod.literal("daily"),
    hour: hourSchema,
    minute: minuteSchema,
  }),
  zod.object({
    kind: zod.literal("weekly"),
    dayOfWeek: dayOfWeekSchema,
    hour: hourSchema,
    minute: minuteSchema,
  }),
]);

export const scheduledTaskActionSchema = zod.discriminatedUnion("kind", [
  zod.object({
    kind: zod.literal("notify"),
    title: zod.string().max(200),
    body: zod.string().max(2000),
  }),
  zod.object({
    kind: zod.literal("prompt"),
    title: zod.string().max(200),
    message: zod.string().max(20000),
    autoSend: zod.boolean(),
    agentId: zod.string().optional(),
    providerId: zod.string().optional(),
    modelId: zod.string().optional(),
    systemPrompt: zod.string().max(20000).optional(),
  }),
]);

export const scheduledTaskSchema = zod.object({
  id: zod.string().min(1),
  name: zod.string().min(1).max(200),
  enabled: zod.boolean(),
  trigger: scheduledTaskTriggerSchema,
  action: scheduledTaskActionSchema,
  createdAt: zod.number().int().nonnegative(),
  lastFiredAt: zod.number().int().nonnegative().nullable(),
});

export const scheduledTasksSettingsSchema = zod.object({
  version: zod.literal(SCHEDULED_TASKS_VERSION),
  tasks: zod.array(scheduledTaskSchema),
});

export const scheduledTasksListRoute = defineRouteContract({
  name: "scheduledTasks.list",
  input: zod.object({}),
  output: zod.object({
    settings: scheduledTasksSettingsSchema,
  }),
});

export const scheduledTasksUpsertInputSchema = scheduledTaskSchema
  .omit({ id: true, createdAt: true, lastFiredAt: true })
  .extend({
    id: zod.string().min(1).optional(),
  });

export const scheduledTasksUpsertRoute = defineRouteContract({
  name: "scheduledTasks.upsert",
  input: scheduledTasksUpsertInputSchema,
  output: zod.object({
    task: scheduledTaskSchema,
    settings: scheduledTasksSettingsSchema,
  }),
});

export const scheduledTasksDeleteRoute = defineRouteContract({
  name: "scheduledTasks.delete",
  input: zod.object({
    id: zod.string().min(1),
  }),
  output: zod.object({
    settings: scheduledTasksSettingsSchema,
  }),
});

export const scheduledTasksToggleRoute = defineRouteContract({
  name: "scheduledTasks.toggle",
  input: zod.object({
    id: zod.string().min(1),
    enabled: zod.boolean(),
  }),
  output: zod.object({
    task: scheduledTaskSchema,
    settings: scheduledTasksSettingsSchema,
  }),
});

export const scheduledTasksFireNowRoute = defineRouteContract({
  name: "scheduledTasks.fireNow",
  input: zod.object({
    id: zod.string().min(1),
  }),
  output: zod.object({
    task: scheduledTaskSchema,
    settings: scheduledTasksSettingsSchema,
  }),
});
