import zod from "zod";
import { defineRouteContract } from "../common";

/**
 * Managed toolchains: one daemon-owned resolver for external runtimes
 * (Node, uv, ripgrep) with an explicit persisted source and verified
 * managed installs. See docs/features/managed-toolchains.
 */

export const TOOLCHAIN_NAMES = ["node", "uv", "ripgrep"] as const;
export type ToolchainName = (typeof TOOLCHAIN_NAMES)[number];

export const TOOLCHAIN_SOURCES = ["bundled", "managed", "system", "custom", "unconfigured"] as const;
export const TOOLCHAIN_SOURCE_SCHEMA = zod.enum(TOOLCHAIN_SOURCES);
export type ToolchainSource = (typeof TOOLCHAIN_SOURCES)[number];

const toolchainNameSchema = zod.enum(TOOLCHAIN_NAMES);

export const toolchainsInstallStateSchema = zod.object({
  phase: zod.enum(["idle", "downloading", "extracting", "activating"]),
  tool: toolchainNameSchema,
  version: zod.string(),
  startedAt: zod.number(),
});

export const toolchainsStatusSchema = zod.object({
  tool: toolchainNameSchema,
  source: TOOLCHAIN_SOURCE_SCHEMA,
  explicit: zod.boolean(),
  path: zod.string().nullable(),
  version: zod.string().nullable(),
  error: zod.string().nullable(),
  pin: zod.string().nullable(),
  install: toolchainsInstallStateSchema.nullable(),
});

export type ToolchainStatus = zod.infer<typeof toolchainsStatusSchema>;
export type ToolchainsInstallState = zod.infer<typeof toolchainsInstallStateSchema>;

export const toolchainsListRoute = defineRouteContract({
  name: "toolchains.list",
  input: zod.object({}).default({}),
  output: zod.object({
    tools: zod.array(toolchainsStatusSchema),
  }),
});

// Only explicit user choices persist: a selected custom path, or an
// explicit "unconfigured". Derived sources (managed/bundled/system) are
// recomputed on demand so a PATH refresh or a removed seed cannot leave a
// stale pointer behind.
export const toolchainsSetSourceRoute = defineRouteContract({
  name: "toolchains.setSource",
  input: zod
    .object({
      tool: toolchainNameSchema,
      source: zod.enum(["custom", "unconfigured"]),
      path: zod.string().min(1).optional(),
    })
    .superRefine((value, ctx) => {
      if (value.source === "custom" && !value.path) {
        ctx.addIssue({ code: "custom", message: "A custom source requires a path", path: ["path"] });
      }
    }),
  output: zod.object({
    status: toolchainsStatusSchema,
  }),
});

export const toolchainsRemoveSourceRoute = defineRouteContract({
  name: "toolchains.removeSource",
  input: zod.object({
    tool: toolchainNameSchema,
  }),
  output: zod.object({
    status: toolchainsStatusSchema,
  }),
});

export const toolchainsInstallRoute = defineRouteContract({
  name: "toolchains.install",
  input: zod.object({
    tool: zod.enum(["node", "uv"]),
  }),
  output: zod.object({
    started: zod.boolean(),
    status: toolchainsStatusSchema,
  }),
});

export const toolchainsCancelInstallRoute = defineRouteContract({
  name: "toolchains.cancelInstall",
  input: zod.object({
    tool: zod.enum(["node", "uv"]),
  }),
  output: zod.object({
    cancelled: zod.boolean(),
    status: toolchainsStatusSchema,
  }),
});
