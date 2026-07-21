import zod from "zod";
import { EntityIdSchema, defineRouteContract } from "../common";

export const PiPackageEntrySchema = zod.union([
  zod.string(),
  zod.object({
    source: zod.string(),
    extensions: zod.array(zod.string()).optional(),
    skills: zod.array(zod.string()).optional(),
    prompts: zod.array(zod.string()).optional(),
    themes: zod.array(zod.string()).optional(),
  }),
]);

const PiPackageSearchResultSchema = zod.object({
  name: zod.string(),
  version: zod.string(),
  description: zod.string(),
  publisher: zod.string().optional(),
  updatedAt: zod.string().optional(),
  npmUrl: zod.string(),
});

export const piPackagesListRoute = defineRouteContract({
  name: "piPackages.list",
  input: zod.object({ agentId: EntityIdSchema }),
  output: zod.object({ packages: zod.array(PiPackageEntrySchema) }),
});

export const piPackagesSearchRoute = defineRouteContract({
  name: "piPackages.search",
  input: zod.object({ query: zod.string().default("") }),
  output: zod.object({ packages: zod.array(PiPackageSearchResultSchema) }),
});

export const piPackagesInstallRoute = defineRouteContract({
  name: "piPackages.install",
  input: zod.object({ agentId: EntityIdSchema, package: PiPackageEntrySchema }),
  output: zod.object({ packages: zod.array(PiPackageEntrySchema) }),
});

export const piPackagesRemoveRoute = defineRouteContract({
  name: "piPackages.remove",
  input: zod.object({ agentId: EntityIdSchema, source: zod.string().min(1) }),
  output: zod.object({ packages: zod.array(PiPackageEntrySchema) }),
});

export const piPackagesGetProjectTrustRoute = defineRouteContract({
  name: "piPackages.getProjectTrust",
  input: zod.object({ agentId: EntityIdSchema, projectDir: zod.string().min(1) }),
  output: zod.object({ trusted: zod.boolean() }),
});

export const piPackagesSetProjectTrustRoute = defineRouteContract({
  name: "piPackages.setProjectTrust",
  input: zod.object({ agentId: EntityIdSchema, projectDir: zod.string().min(1), trusted: zod.boolean() }),
  output: zod.object({ trusted: zod.boolean() }),
});
