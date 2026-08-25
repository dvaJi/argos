import zod from "zod";
import { defineRouteContract } from "../common";
import { DeviceInfoSchema } from "../domainSchemas";

export const deviceGetAppVersionRoute = defineRouteContract({
  name: "device.getAppVersion",
  input: zod.object({}).default({}),
  output: zod.object({
    version: zod.string(),
  }),
});

export const deviceGetInfoRoute = defineRouteContract({
  name: "device.getInfo",
  input: zod.object({}).default({}),
  output: zod.object({
    info: DeviceInfoSchema,
  }),
});

export const deviceSelectDirectoryRoute = defineRouteContract({
  name: "device.selectDirectory",
  input: zod.object({}).default({}),
  output: zod.object({
    canceled: zod.boolean(),
    filePaths: zod.array(zod.string()),
  }),
});

export const deviceRestartAppRoute = defineRouteContract({
  name: "device.restartApp",
  input: zod.object({}).default({}),
  output: zod.object({
    restarted: zod.boolean(),
  }),
});

export const deviceSanitizeSvgRoute = defineRouteContract({
  name: "device.sanitizeSvg",
  input: zod.object({
    svgContent: zod.string(),
  }),
  output: zod.object({
    content: zod.string().nullable(),
  }),
});

export const deviceSelectFilesRoute = defineRouteContract({
  name: "device.selectFiles",
  input: zod.object({
    filters: zod
      .array(
        zod.object({
          name: zod.string(),
          extensions: zod.array(zod.string()),
        }),
      )
      .optional(),
    multiple: zod.boolean().optional(),
  }),
  output: zod.object({
    canceled: zod.boolean(),
    filePaths: zod.array(zod.string()),
  }),
});

export const deviceResetDataByTypeRoute = defineRouteContract({
  name: "device.resetDataByType",
  input: zod.object({
    types: zod.array(zod.string()),
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});
