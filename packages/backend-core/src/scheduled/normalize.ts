import { randomUUID } from "node:crypto";
import zod from "zod";
import {
  SCHEDULED_TASKS_VERSION,
  type ScheduledTask,
  type ScheduledTaskAction,
  type ScheduledTaskTrigger,
  type ScheduledTasksSettings,
  createDefaultScheduledTasksSettings,
} from "@shared/scheduledTasks";

const TriggerSchema = zod.discriminatedUnion("kind", [
  zod.object({ kind: zod.literal("once"), firesAt: zod.number().int().nonnegative() }),
  zod.object({
    kind: zod.literal("daily"),
    hour: zod.number().int().min(0).max(23),
    minute: zod.number().int().min(0).max(59),
  }),
  zod.object({
    kind: zod.literal("weekly"),
    dayOfWeek: zod.number().int().min(0).max(6),
    hour: zod.number().int().min(0).max(23),
    minute: zod.number().int().min(0).max(59),
  }),
]);

const ActionSchema = zod.discriminatedUnion("kind", [
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

const ScheduledTaskSchema = zod.object({
  id: zod.string().min(1),
  name: zod.string().min(1).max(200),
  enabled: zod.boolean(),
  trigger: TriggerSchema,
  action: ActionSchema,
  createdAt: zod.number().int().nonnegative(),
  lastFiredAt: zod.number().int().nonnegative().nullable(),
});

const LooseSchedulerSettingsSchema = zod.object({
  version: zod.unknown().optional(),
  tasks: zod.array(zod.unknown()).optional(),
});

const sanitizeTrigger = (input: unknown): ScheduledTaskTrigger | null => {
  const parsed = TriggerSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

const sanitizeAction = (input: unknown): ScheduledTaskAction | null => {
  const parsed = ActionSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

const sanitizeTask = (input: unknown, fallbackIndex: number, now: number): ScheduledTask | null => {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const trigger = sanitizeTrigger(record.trigger);
  const action = sanitizeAction(record.action);
  if (!trigger || !action) {
    return null;
  }

  const id = typeof record.id === "string" && record.id.trim().length > 0 ? record.id.trim() : randomUUID();
  const name =
    typeof record.name === "string" && record.name.trim().length > 0
      ? record.name.trim().slice(0, 200)
      : `Task ${fallbackIndex + 1}`;
  const enabled = record.enabled === true;
  const createdAt =
    typeof record.createdAt === "number" && Number.isFinite(record.createdAt) && record.createdAt > 0
      ? record.createdAt
      : now;
  const lastFiredAt =
    typeof record.lastFiredAt === "number" && Number.isFinite(record.lastFiredAt) && record.lastFiredAt > 0
      ? record.lastFiredAt
      : null;

  const candidate = { id, name, enabled, trigger, action, createdAt, lastFiredAt };
  const parsed = ScheduledTaskSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};

const makeUniqueTaskId = (id: string, seenIds: Set<string>): string => {
  if (!seenIds.has(id)) {
    return id;
  }

  let suffix = 2;
  let nextId = `${id}-${suffix}`;
  while (seenIds.has(nextId)) {
    suffix += 1;
    nextId = `${id}-${suffix}`;
  }
  return nextId;
};

export const normalizeScheduledTasksConfig = (input: unknown, now: number = Date.now()): ScheduledTasksSettings => {
  const defaults = createDefaultScheduledTasksSettings();
  if (input == null) {
    return defaults;
  }

  const parsed = LooseSchedulerSettingsSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("[ScheduledTasks] Invalid config, using defaults:", parsed.error?.message);
    return defaults;
  }

  const rawTasks = Array.isArray(parsed.data.tasks) ? parsed.data.tasks : [];
  const seenIds = new Set<string>();
  const tasks = rawTasks.reduce<ScheduledTask[]>((acc, candidate, index) => {
    const sanitized = sanitizeTask(candidate, index, now);
    if (sanitized) {
      const id = makeUniqueTaskId(sanitized.id, seenIds);
      seenIds.add(id);
      acc.push(id === sanitized.id ? sanitized : { ...sanitized, id });
    } else {
      console.warn(`[ScheduledTasks] Dropping malformed task at index ${index}`);
    }
    return acc;
  }, []);

  return {
    version: SCHEDULED_TASKS_VERSION,
    tasks,
  };
};

const startOfMinute = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setSeconds(0, 0);
  return date.getTime();
};

const buildWallClockToday = (reference: number, hour: number, minute: number, dayOffset = 0): number => {
  const date = new Date(reference);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
};

export const computeNextFireAt = (task: ScheduledTask, after: number): number | null => {
  const trigger = task.trigger;
  switch (trigger.kind) {
    case "once": {
      if (task.lastFiredAt) {
        return null;
      }
      return trigger.firesAt > after ? trigger.firesAt : null;
    }
    case "daily": {
      let candidate = buildWallClockToday(after, trigger.hour, trigger.minute, 0);
      if (candidate <= after) {
        candidate = buildWallClockToday(after, trigger.hour, trigger.minute, 1);
      }
      return candidate;
    }
    case "weekly": {
      const reference = new Date(after);
      const currentDay = reference.getDay();
      let dayOffset = (trigger.dayOfWeek - currentDay + 7) % 7;
      let candidate = buildWallClockToday(after, trigger.hour, trigger.minute, dayOffset);
      if (candidate <= after) {
        dayOffset += 7;
        candidate = buildWallClockToday(after, trigger.hour, trigger.minute, dayOffset);
      }
      return candidate;
    }
    default:
      return null;
  }
};

export const shouldBackfillOneShot = (task: ScheduledTask, now: number): boolean => {
  if (task.trigger.kind !== "once") {
    return false;
  }
  if (task.lastFiredAt) {
    return false;
  }
  return task.trigger.firesAt <= now;
};

export const startOfMinuteForTests = startOfMinute;
