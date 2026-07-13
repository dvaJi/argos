import zod from "zod";
import type { DialogButton, DialogIcon } from "@argos/shared/presenter";
import { EntityIdSchema, defineRouteContract } from "../common";

const DialogIconSchema = zod.custom<DialogIcon>();
const DialogButtonSchema = zod.custom<DialogButton>();

export const dialogRespondRoute = defineRouteContract({
  name: "dialog.respond",
  input: zod.object({
    id: EntityIdSchema,
    button: zod.string(),
  }),
  output: zod.object({
    handled: zod.literal(true),
  }),
});

export const dialogErrorRoute = defineRouteContract({
  name: "dialog.error",
  input: zod.object({
    id: EntityIdSchema,
  }),
  output: zod.object({
    handled: zod.literal(true),
  }),
});

export const dialogRequestSchema = zod.object({
  id: EntityIdSchema,
  title: zod.string(),
  description: zod.string().optional(),
  icon: DialogIconSchema.optional(),
  buttons: zod.array(DialogButtonSchema),
  timeout: zod.number(),
});
