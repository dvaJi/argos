import zod from "zod";
import { TimestampMsSchema, defineEventContract } from "../common";
import { WorkspaceInvalidationKindSchema, WorkspaceInvalidationSourceSchema } from "../domainSchemas";

export const workspaceInvalidatedEvent = defineEventContract({
  name: "workspace.invalidated",
  payload: zod.object({
    workspacePath: zod.string(),
    kind: WorkspaceInvalidationKindSchema,
    source: WorkspaceInvalidationSourceSchema,
    version: TimestampMsSchema,
  }),
});
