import zod from "zod";
import { defineEventContract } from "../common";

export const syncBackupStartedEvent = defineEventContract({
  name: "sync.backup.started",
  payload: zod.object({
    version: zod.number().int(),
  }),
});

export const syncBackupCompletedEvent = defineEventContract({
  name: "sync.backup.completed",
  payload: zod.object({
    timestamp: zod.number(),
    version: zod.number().int(),
  }),
});

export const syncBackupErrorEvent = defineEventContract({
  name: "sync.backup.error",
  payload: zod.object({
    error: zod.string().optional(),
    version: zod.number().int(),
  }),
});

export const syncBackupStatusChangedEvent = defineEventContract({
  name: "sync.backup.status.changed",
  payload: zod.object({
    status: zod.string(),
    previousStatus: zod.string().optional(),
    lastSuccessfulBackupTime: zod.number().optional(),
    failed: zod.boolean().optional(),
    message: zod.string().optional(),
    version: zod.number().int(),
  }),
});

export const syncImportStartedEvent = defineEventContract({
  name: "sync.import.started",
  payload: zod.object({
    version: zod.number().int(),
  }),
});

export const syncImportCompletedEvent = defineEventContract({
  name: "sync.import.completed",
  payload: zod.object({
    version: zod.number().int(),
  }),
});

export const syncImportErrorEvent = defineEventContract({
  name: "sync.import.error",
  payload: zod.object({
    error: zod.string().optional(),
    version: zod.number().int(),
  }),
});
