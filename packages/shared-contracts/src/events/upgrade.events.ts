import zod from "zod";
import { defineEventContract } from "../common";

const UpgradeInfoSchema = zod
  .object({
    version: zod.string(),
    releaseDate: zod.string(),
    releaseNotes: zod.string(),
    githubUrl: zod.string().optional(),
    downloadUrl: zod.string().optional(),
    isMock: zod.boolean().optional(),
  })
  .nullable();

export const upgradeStatusChangedEvent = defineEventContract({
  name: "upgrade.status.changed",
  payload: zod.object({
    status: zod.enum(["checking", "available", "not-available", "downloading", "downloaded", "error"]).nullable(),
    error: zod.string().optional().nullable(),
    info: UpgradeInfoSchema.optional(),
    type: zod.string().optional(),
    version: zod.number().int(),
  }),
});

export const upgradeProgressEvent = defineEventContract({
  name: "upgrade.progress",
  payload: zod.object({
    bytesPerSecond: zod.number(),
    percent: zod.number(),
    transferred: zod.number(),
    total: zod.number(),
    version: zod.number().int(),
  }),
});

export const upgradeWillRestartEvent = defineEventContract({
  name: "upgrade.willRestart",
  payload: zod.object({
    version: zod.number().int(),
  }),
});

export const upgradeErrorEvent = defineEventContract({
  name: "upgrade.error",
  payload: zod.object({
    error: zod.string(),
    version: zod.number().int(),
  }),
});
