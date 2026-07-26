import zod from "zod";
import { defineRouteContract } from "../common";

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
    capabilities: zod.array(zod.string()),
    compatible: zod.boolean(),
  }),
});

export type ConnectionEnvironment = zod.infer<typeof connectionDescribeEnvironmentRoute.output>;
