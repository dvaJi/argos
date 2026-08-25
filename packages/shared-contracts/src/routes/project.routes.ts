import zod from "zod";
import { defineRouteContract } from "../common";
import { EnvironmentSummarySchema, ProjectSchema } from "../domainSchemas";

export const projectListRecentRoute = defineRouteContract({
  name: "project.listRecent",
  input: zod.object({
    limit: zod.number().int().positive().optional(),
  }),
  output: zod.object({
    projects: zod.array(ProjectSchema),
  }),
});

export const projectListEnvironmentsRoute = defineRouteContract({
  name: "project.listEnvironments",
  input: zod.object({}).default({}),
  output: zod.object({
    environments: zod.array(EnvironmentSummarySchema),
  }),
});

export const projectOpenDirectoryRoute = defineRouteContract({
  name: "project.openDirectory",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    opened: zod.boolean(),
  }),
});

export const projectSelectDirectoryRoute = defineRouteContract({
  name: "project.selectDirectory",
  input: zod.object({}).default({}),
  output: zod.object({
    path: zod.string().nullable(),
  }),
});

export const projectPathExistsRoute = defineRouteContract({
  name: "project.pathExists",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    exists: zod.boolean(),
  }),
});
