import zod from "zod";
import { defineRouteContract } from "../common";

const UpdateInfoSchema = zod
  .object({
    version: zod.string(),
    releaseDate: zod.string(),
    releaseNotes: zod.string(),
    githubUrl: zod.string().optional(),
    downloadUrl: zod.string().optional(),
    isMock: zod.boolean().optional(),
  })
  .nullable();

const UpdateProgressSchema = zod
  .object({
    bytesPerSecond: zod.number(),
    percent: zod.number(),
    transferred: zod.number(),
    total: zod.number(),
  })
  .nullable();

export const upgradeGetStatusRoute = defineRouteContract({
  name: "upgrade.getStatus",
  input: zod.object({}),
  output: zod.object({
    snapshot: zod.object({
      status: zod.enum(["checking", "available", "not-available", "downloading", "downloaded", "error"]).nullable(),
      progress: UpdateProgressSchema,
      error: zod.string().nullable(),
      updateInfo: UpdateInfoSchema,
    }),
  }),
});

export const upgradeCheckRoute = defineRouteContract({
  name: "upgrade.check",
  input: zod.object({
    type: zod.string().optional(),
  }),
  output: zod.object({
    checked: zod.literal(true),
  }),
});

export const upgradeOpenDownloadRoute = defineRouteContract({
  name: "upgrade.openDownload",
  input: zod.object({
    type: zod.enum(["github", "official"]),
  }),
  output: zod.object({
    opened: zod.literal(true),
  }),
});

export const upgradeStartDownloadRoute = defineRouteContract({
  name: "upgrade.startDownload",
  input: zod.object({}),
  output: zod.object({
    started: zod.boolean(),
  }),
});

export const upgradeMockDownloadedRoute = defineRouteContract({
  name: "upgrade.mockDownloaded",
  input: zod.object({}),
  output: zod.object({
    updated: zod.boolean(),
  }),
});

export const upgradeClearMockRoute = defineRouteContract({
  name: "upgrade.clearMock",
  input: zod.object({}),
  output: zod.object({
    updated: zod.boolean(),
  }),
});

export const upgradeRestartToUpdateRoute = defineRouteContract({
  name: "upgrade.restartToUpdate",
  input: zod.object({}),
  output: zod.object({
    restarted: zod.boolean(),
  }),
});
