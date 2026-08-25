import zod from "zod";
import { defineRouteContract } from "../common";

/**
 * NowledgeMem knowledge-mesh connection settings.
 *
 * Desktop-only: the presenter performs local health-check fetches against the
 * user's NowledgeMem instance and stores config in the desktop config store.
 * Registered verbatim in DESKTOP_ONLY_ROUTE_PREFIXES.
 */

export const nowledgeMemGetConfigRoute = defineRouteContract({
  name: "nowledgeMem.getConfig",
  input: zod.object({}).default({}),
  output: zod.object({
    config: zod.object({
      baseUrl: zod.string(),
      apiKey: zod.string().optional(),
      timeout: zod.number(),
    }),
  }),
});

export const nowledgeMemUpdateConfigRoute = defineRouteContract({
  name: "nowledgeMem.updateConfig",
  input: zod.object({
    config: zod.object({
      baseUrl: zod.string().optional(),
      apiKey: zod.string().optional(),
      timeout: zod.number().optional(),
    }),
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export const nowledgeMemTestConnectionRoute = defineRouteContract({
  name: "nowledgeMem.testConnection",
  input: zod.object({}).default({}),
  output: zod.object({
    result: zod.object({
      success: zod.boolean(),
      data: zod.unknown().optional(),
      error: zod.string().optional(),
      status: zod.number().optional(),
    }),
  }),
});
