import zod from "zod";
import { defineRouteContract } from "../common";
import { RectangleSchema, YoBrowserStatusSchema } from "../domainSchemas";

export const browserGetStatusRoute = defineRouteContract({
  name: "browser.getStatus",
  input: zod.object({
    sessionId: zod.string().min(1),
  }),
  output: zod.object({
    status: YoBrowserStatusSchema,
  }),
});

export const browserLoadUrlRoute = defineRouteContract({
  name: "browser.loadUrl",
  input: zod.object({
    sessionId: zod.string().min(1),
    url: zod.string().min(1),
    timeoutMs: zod.number().int().positive().optional(),
  }),
  output: zod.object({
    status: YoBrowserStatusSchema,
  }),
});

export const browserAttachCurrentWindowRoute = defineRouteContract({
  name: "browser.attachCurrentWindow",
  input: zod.object({
    sessionId: zod.string().min(1),
  }),
  output: zod.object({
    attached: zod.boolean(),
  }),
});

export const browserUpdateCurrentWindowBoundsRoute = defineRouteContract({
  name: "browser.updateCurrentWindowBounds",
  input: zod.object({
    sessionId: zod.string().min(1),
    bounds: RectangleSchema,
    visible: zod.boolean(),
  }),
  output: zod.object({
    updated: zod.boolean(),
  }),
});

export const browserDetachRoute = defineRouteContract({
  name: "browser.detach",
  input: zod.object({
    sessionId: zod.string().min(1),
  }),
  output: zod.object({
    detached: zod.boolean(),
  }),
});

export const browserDestroyRoute = defineRouteContract({
  name: "browser.destroy",
  input: zod.object({
    sessionId: zod.string().min(1),
  }),
  output: zod.object({
    destroyed: zod.boolean(),
  }),
});

export const browserGoBackRoute = defineRouteContract({
  name: "browser.goBack",
  input: zod.object({
    sessionId: zod.string().min(1),
  }),
  output: zod.object({
    status: YoBrowserStatusSchema,
  }),
});

export const browserGoForwardRoute = defineRouteContract({
  name: "browser.goForward",
  input: zod.object({
    sessionId: zod.string().min(1),
  }),
  output: zod.object({
    status: YoBrowserStatusSchema,
  }),
});

export const browserReloadRoute = defineRouteContract({
  name: "browser.reload",
  input: zod.object({
    sessionId: zod.string().min(1),
  }),
  output: zod.object({
    status: YoBrowserStatusSchema,
  }),
});

export const browserClearSandboxDataRoute = defineRouteContract({
  name: "browser.clearSandboxData",
  input: zod.object({}).default({}),
  output: zod.object({
    cleared: zod.boolean(),
  }),
});
