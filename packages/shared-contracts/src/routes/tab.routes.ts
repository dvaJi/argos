import zod from "zod";
import { defineRouteContract } from "../common";
import { RectangleSchema } from "../domainSchemas";

const TabWatermarkTextsSchema = zod
  .object({
    brand: zod.string().optional(),
    time: zod.string().optional(),
    tip: zod.string().optional(),
    model: zod.string().optional(),
    provider: zod.string().optional(),
  })
  .optional();

const TabWatermarkConfigSchema = zod
  .object({
    isDark: zod.boolean().optional(),
    version: zod.string().optional(),
    texts: TabWatermarkTextsSchema,
  })
  .optional();

export const tabNotifyRendererReadyRoute = defineRouteContract({
  name: "tab.notifyRendererReady",
  input: zod.object({}).default({}),
  output: zod.object({
    notified: zod.boolean(),
  }),
});

export const tabNotifyRendererActivatedRoute = defineRouteContract({
  name: "tab.notifyRendererActivated",
  input: zod.object({
    sessionId: zod.string().min(1),
  }),
  output: zod.object({
    notified: zod.boolean(),
  }),
});

export const tabCaptureCurrentAreaRoute = defineRouteContract({
  name: "tab.captureCurrentArea",
  input: zod.object({
    rect: RectangleSchema,
  }),
  output: zod.object({
    imageData: zod.string().nullable(),
  }),
});

export const tabStitchImagesWithWatermarkRoute = defineRouteContract({
  name: "tab.stitchImagesWithWatermark",
  input: zod.object({
    images: zod.array(zod.string()),
    watermark: TabWatermarkConfigSchema,
  }),
  output: zod.object({
    imageData: zod.string().nullable(),
  }),
});
