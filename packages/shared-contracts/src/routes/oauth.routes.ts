import zod from "zod";
import { defineRouteContract } from "../common";

/**
 * GitHub Copilot OAuth device-flow routes.
 *
 * Desktop-only: the flow spins up a local callback server and opens the
 * system browser. Registered verbatim in DESKTOP_ONLY_ROUTE_PREFIXES.
 */

export const oauthStartGithubCopilotLoginRoute = defineRouteContract({
  name: "oauth.startGithubCopilotLogin",
  input: zod.object({
    providerId: zod.string(),
  }),
  output: zod.object({
    started: zod.boolean(),
  }),
});

export const oauthStartGithubCopilotDeviceFlowLoginRoute = defineRouteContract({
  name: "oauth.startGithubCopilotDeviceFlowLogin",
  input: zod.object({
    providerId: zod.string(),
  }),
  output: zod.object({
    started: zod.boolean(),
  }),
});
