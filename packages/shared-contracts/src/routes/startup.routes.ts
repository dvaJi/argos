import zod from "zod";
import { StartupBootstrapShellSchema, defineRouteContract } from "../common";

export const startupGetBootstrapRoute = defineRouteContract({
  name: "startup.getBootstrap",
  input: zod.object({}),
  output: zod.object({
    bootstrap: StartupBootstrapShellSchema,
  }),
});
