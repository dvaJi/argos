import zod from "zod";
import { defineRouteContract } from "../common";
import { WindowStateSchema } from "../domainSchemas";

export const windowGetCurrentStateRoute = defineRouteContract({
  name: "window.getCurrentState",
  input: zod.object({}).default({}),
  output: zod.object({
    state: WindowStateSchema,
  }),
});

export const windowMinimizeCurrentRoute = defineRouteContract({
  name: "window.minimizeCurrent",
  input: zod.object({}).default({}),
  output: zod.object({
    state: WindowStateSchema,
  }),
});

export const windowToggleMaximizeCurrentRoute = defineRouteContract({
  name: "window.toggleMaximizeCurrent",
  input: zod.object({}).default({}),
  output: zod.object({
    state: WindowStateSchema,
  }),
});

export const windowCloseCurrentRoute = defineRouteContract({
  name: "window.closeCurrent",
  input: zod.object({}).default({}),
  output: zod.object({
    closed: zod.boolean(),
  }),
});

export const windowCloseFloatingCurrentRoute = defineRouteContract({
  name: "window.closeFloatingCurrent",
  input: zod.object({}).default({}),
  output: zod.object({
    closed: zod.boolean(),
  }),
});

export const windowPreviewFileRoute = defineRouteContract({
  name: "window.previewFile",
  input: zod.object({
    filePath: zod.string().min(1),
  }),
  output: zod.object({
    previewed: zod.boolean(),
  }),
});
