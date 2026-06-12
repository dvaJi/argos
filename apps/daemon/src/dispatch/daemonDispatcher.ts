import type { DeepchatRouteName } from "@argos/shared-contracts/routes";
import { dispatchConfigRoute } from "@argos/backend-core/dispatch/config/configRouteHandler";
import type { IConfigPresenter } from "@shared/presenter";

const CONFIG_ROUTE_PREFIX = "config.";

function isConfigRoute(route: DeepchatRouteName): boolean {
  return route.startsWith(CONFIG_ROUTE_PREFIX);
}

export function createDaemonDispatcher(configPresenter: IConfigPresenter) {
  return async function dispatchDaemonRoute(route: DeepchatRouteName, input: unknown): Promise<unknown> {
    if (isConfigRoute(route)) {
      return dispatchConfigRoute(configPresenter, route, input);
    }

    throw new Error(`Route not supported in daemon mode: ${route}`);
  };
}
