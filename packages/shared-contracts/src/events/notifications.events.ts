import zod from "zod";
import { defineEventContract } from "../common";

/**
 * Backend-originated error surfaced to the UI (e.g. provider/execution failures).
 * Emitted by the daemon so browser-mode renderers also receive it.
 */
export const notificationsShowErrorEvent = defineEventContract({
  name: "notifications.showError",
  payload: zod.object({
    id: zod.string(),
    title: zod.string(),
    message: zod.string(),
    type: zod.string(),
  }),
});

/**
 * The daemon DB layer detected a schema problem and suggests a repair.
 */
export const notificationsDatabaseRepairSuggestedEvent = defineEventContract({
  name: "notifications.databaseRepairSuggested",
  payload: zod.object({
    title: zod.string(),
    message: zod.string(),
    reason: zod.string(),
    dedupeKey: zod.string(),
  }),
});
