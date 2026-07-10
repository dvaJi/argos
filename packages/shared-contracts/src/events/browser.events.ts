import zod from "zod";
import { TimestampMsSchema, defineEventContract } from "../common";
import { YoBrowserStatusSchema } from "../domainSchemas";

const BrowserStatusChangeReasonSchema = zod.enum(["created", "updated", "closed", "focused", "visibility"]);

export const browserOpenRequestedEvent = defineEventContract({
  name: "browser.open.requested",
  payload: zod.object({
    sessionId: zod.string(),
    windowId: zod.number().int(),
    url: zod.string(),
    version: TimestampMsSchema,
  }),
});

export const browserStatusChangedEvent = defineEventContract({
  name: "browser.status.changed",
  payload: zod.object({
    sessionId: zod.string(),
    reason: BrowserStatusChangeReasonSchema,
    windowId: zod.number().int().nullable().optional(),
    visible: zod.boolean().optional(),
    status: YoBrowserStatusSchema.nullable(),
    version: TimestampMsSchema,
  }),
});

export const browserActivityChangedEvent = defineEventContract({
  name: "browser.activity.changed",
  payload: zod.object({
    id: zod.string().min(1),
    sessionId: zod.string().min(1),
    windowId: zod.number().int().nullable(),
    pageId: zod.string().optional(),
    kind: zod.enum(["navigation", "vision", "pointer", "scroll", "keyboard"]),
    action: zod.enum([
      "navigate",
      "reload",
      "screenshot",
      "dom",
      "runtime",
      "mouse_move",
      "mouse_click",
      "mouse_wheel",
      "key",
    ]),
    phase: zod.enum(["started", "completed", "failed"]),
    point: zod
      .object({
        x: zod.number(),
        y: zod.number(),
      })
      .optional(),
    rect: zod
      .object({
        x: zod.number(),
        y: zod.number(),
        width: zod.number(),
        height: zod.number(),
      })
      .optional(),
    direction: zod.enum(["up", "down", "left", "right"]).optional(),
    timestamp: TimestampMsSchema,
  }),
});
