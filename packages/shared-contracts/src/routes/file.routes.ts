import zod from "zod";
import { defineRouteContract } from "../common";
import { PreparedMessageFileSchema } from "../domainSchemas";

const FileImageActionInputSchema = zod.object({
  source: zod.string().min(1),
  mimeType: zod.string().optional(),
  suggestedName: zod.string().optional(),
});

export const fileGetMimeTypeRoute = defineRouteContract({
  name: "file.getMimeType",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    mimeType: zod.string(),
  }),
});

export const filePrepareFileRoute = defineRouteContract({
  name: "file.prepareFile",
  input: zod.object({
    path: zod.string().min(1),
    mimeType: zod.string().optional(),
  }),
  output: zod.object({
    file: PreparedMessageFileSchema,
  }),
});

export const filePrepareDirectoryRoute = defineRouteContract({
  name: "file.prepareDirectory",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    file: PreparedMessageFileSchema,
  }),
});

export const fileReadFileRoute = defineRouteContract({
  name: "file.readFile",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    content: zod.string(),
  }),
});

export const fileIsDirectoryRoute = defineRouteContract({
  name: "file.isDirectory",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    isDirectory: zod.boolean(),
  }),
});

export const fileWriteImageBase64Route = defineRouteContract({
  name: "file.writeImageBase64",
  input: zod.object({
    name: zod.string().min(1),
    content: zod.string().min(1),
  }),
  output: zod.object({
    path: zod.string(),
  }),
});

export const fileSaveImageRoute = defineRouteContract({
  name: "file.saveImage",
  input: FileImageActionInputSchema,
  output: zod.object({
    canceled: zod.boolean(),
    path: zod.string().optional(),
  }),
});

export const fileCopyImageRoute = defineRouteContract({
  name: "file.copyImage",
  input: FileImageActionInputSchema,
  output: zod.object({
    copied: zod.boolean(),
  }),
});
