import zod from "zod";
import type { SkillMetadata } from "@argos/shared/types/skill";
import { EntityIdSchema, defineEventContract } from "../common";

const SkillMetadataSchema = zod.custom<SkillMetadata>();

export const skillsCatalogChangedEvent = defineEventContract({
  name: "skills.catalog.changed",
  payload: zod.object({
    reason: zod.enum(["discovered", "installed", "uninstalled", "metadata-updated"]),
    name: zod.string().optional(),
    skill: SkillMetadataSchema.optional(),
    skills: zod.array(SkillMetadataSchema).optional(),
    version: zod.number().int(),
  }),
});

export const skillsSessionChangedEvent = defineEventContract({
  name: "skills.session.changed",
  payload: zod.object({
    conversationId: EntityIdSchema,
    skills: zod.array(zod.string()),
    change: zod.enum(["activated", "deactivated"]),
    version: zod.number().int(),
  }),
});
