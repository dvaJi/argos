import zod from "zod";
import { defineRouteContract } from "../common";

export const ARGOS_CAPABILITIES = ["chat", "sessions", "project-files", "mcp", "skills", "browser"] as const;
export type ArgosCapability = (typeof ARGOS_CAPABILITIES)[number];

export const connectionDescribeEnvironmentRoute = defineRouteContract({
  name: "connection.describeEnvironment",
  input: zod.object({
    clientVersion: zod.string().optional(),
    protocolVersion: zod.number().int().positive().default(1),
    runtimeKind: zod.enum(["electron", "browser"]).default("electron"),
  }),
  output: zod.object({
    environmentId: zod.string(),
    serverVersion: zod.string(),
    protocolVersion: zod.number().int().positive(),
    runtimeKind: zod.literal("daemon"),
    capabilities: zod.array(zod.enum(ARGOS_CAPABILITIES)),
    compatible: zod.boolean(),
  }),
});

export type ConnectionEnvironment = zod.infer<typeof connectionDescribeEnvironmentRoute.output>;
