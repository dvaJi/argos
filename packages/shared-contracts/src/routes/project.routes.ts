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

// --- Project settings (docs/features/project-settings) ---

export const ProjectIconSchema = zod.object({
  /** `icon`: an iconify name from the curated list; `image`: a data URL (≤ 256 KB). */
  kind: zod.enum(["icon", "image"]),
  value: zod.string().min(1).max(350_000),
});

export const ProjectDefaultModelSchema = zod.object({
  providerId: zod.string().min(1),
  modelId: zod.string().min(1),
});

export const ProjectWorkspaceModeSchema = zod.enum(["current", "worktree"]);

export const ProjectSettingsSchema = zod.object({
  /** Canonical key (`normalizeProjectKey`). */
  key: zod.string(),
  /** Path as last saved (display + filesystem use). */
  path: zod.string(),
  /** Display name; null = automatic (folder name). */
  name: zod.string().nullable(),
  icon: ProjectIconSchema.nullable(),
  pinnedAt: zod.number().nullable(),
  archivedAt: zod.number().nullable(),
  defaultModel: ProjectDefaultModelSchema.nullable(),
  defaultWorkspace: ProjectWorkspaceModeSchema.nullable(),
  updatedAt: zod.number(),
});

export const ProjectSettingsPatchSchema = zod.object({
  name: zod.string().max(120).nullable().optional(),
  icon: ProjectIconSchema.nullable().optional(),
  pinned: zod.boolean().optional(),
  archived: zod.boolean().optional(),
  defaultModel: ProjectDefaultModelSchema.nullable().optional(),
  defaultWorkspace: ProjectWorkspaceModeSchema.nullable().optional(),
});

export const projectListSettingsRoute = defineRouteContract({
  name: "project.listSettings",
  input: zod.object({}).default({}),
  output: zod.object({
    projects: zod.array(ProjectSettingsSchema),
  }),
});

export const projectUpdateSettingsRoute = defineRouteContract({
  name: "project.updateSettings",
  input: zod.object({
    path: zod.string().min(1),
    patch: ProjectSettingsPatchSchema,
  }),
  output: zod.object({
    project: ProjectSettingsSchema,
  }),
});

export const ProjectCheckoutSchema = zod.object({
  /** The requested path, echoed back. */
  path: zod.string(),
  /** Main worktree of the containing repository; null when not a git repo. */
  repoRoot: zod.string().nullable(),
  /** True when the path is inside a linked (non-main) worktree: its project is `repoRoot`. */
  isLinkedWorktree: zod.boolean(),
  /** Checked-out branch; null for detached HEAD / non-repos. */
  branch: zod.string().nullable(),
});

/**
 * Resolve session project dirs to their repository + branch. Only paths the
 * daemon already knows as session project dirs are inspected; others come back
 * as nulls.
 */
export const projectDescribeCheckoutsRoute = defineRouteContract({
  name: "project.describeCheckouts",
  input: zod.object({
    paths: zod.array(zod.string().min(1)).max(200),
  }),
  output: zod.object({
    checkouts: zod.array(ProjectCheckoutSchema),
  }),
});

export type ProjectSettings = zod.infer<typeof ProjectSettingsSchema>;
export type ProjectSettingsPatch = zod.infer<typeof ProjectSettingsPatchSchema>;
export type ProjectCheckout = zod.infer<typeof ProjectCheckoutSchema>;
