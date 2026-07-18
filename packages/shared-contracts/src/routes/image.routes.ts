import zod from "zod";
import { defineRouteContract } from "../common";

const ImageOperationSchema = zod.discriminatedUnion("type", [
  zod.object({
    type: zod.literal("metadata"),
  }),
  zod.object({
    type: zod.literal("resize"),
    width: zod.number().int().positive().optional(),
    height: zod.number().int().positive().optional(),
    fit: zod.enum(["inside", "cover", "fill", "contain"]).optional().default("inside"),
    withoutEnlargement: zod.boolean().optional().default(true),
  }),
  zod.object({
    type: zod.literal("jpeg"),
    quality: zod.number().int().min(1).max(100).optional().default(80),
  }),
  zod.object({
    type: zod.literal("png"),
  }),
  zod.object({
    type: zod.literal("webp"),
    quality: zod.number().int().min(1).max(100).optional().default(80),
  }),
  zod.object({
    type: zod.literal("gif"),
  }),
  zod.object({
    type: zod.literal("composite"),
    buffers: zod.array(
      zod.object({
        base64: zod.string().min(1),
        top: zod.number().int().min(0),
        left: zod.number().int().min(0),
      }),
    ),
  }),
  zod.object({
    type: zod.literal("toFormat"),
    format: zod.enum(["jpeg", "png", "webp", "gif", "raw"]),
    quality: zod.number().int().min(1).max(100).optional(),
  }),
]);

export const imageProcessRoute = defineRouteContract({
  name: "image.process",
  input: zod.object({
    imageBase64: zod.string().min(1),
    operations: zod.array(ImageOperationSchema),
  }),
  output: zod.object({
    imageBase64: zod.string(),
    metadata: zod
      .object({
        width: zod.number().int().positive().optional(),
        height: zod.number().int().positive().optional(),
        format: zod.string().optional(),
      })
      .optional(),
  }),
});
