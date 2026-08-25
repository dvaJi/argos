import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  oauthStartGithubCopilotDeviceFlowLoginRoute,
  oauthStartGithubCopilotLoginRoute,
} from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

/**
 * Typed client for OAuth login flows that require Electron (local callback
 * server + system browser). Desktop-only `oauth.*` routes.
 */
export function createOAuthClient(bridge: ArgosBridge = getArgosBridge()) {
  async function startGitHubCopilotLogin(providerId: string) {
    const result = await bridge.invoke(oauthStartGithubCopilotLoginRoute.name, { providerId });
    return result.started;
  }

  async function startGitHubCopilotDeviceFlowLogin(providerId: string) {
    const result = await bridge.invoke(oauthStartGithubCopilotDeviceFlowLoginRoute.name, { providerId });
    return result.started;
  }

  return {
    startGitHubCopilotLogin,
    startGitHubCopilotDeviceFlowLogin,
  };
}

type OAuthClient = ReturnType<typeof createOAuthClient>;

export type { OAuthClient };
