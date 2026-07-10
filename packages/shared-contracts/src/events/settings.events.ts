import zod from "zod";
import { TimestampMsSchema, defineEventContract } from "../common";
import { SettingsKeySchema, SettingsSnapshotValuesSchema } from "../routes/settings.routes";

export const settingsChangedEvent = defineEventContract({
  name: "settings.changed",
  payload: zod.object({
    changedKeys: zod.array(SettingsKeySchema).min(1),
    version: TimestampMsSchema,
    values: SettingsSnapshotValuesSchema.partial(),
  }),
});
