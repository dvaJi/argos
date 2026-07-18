import { RemoteControlRouteClient } from "@argos/client-sdk";
import { invokeDaemonRoute } from "#/routes/daemonRouteProxy";
import type { RemoteControlPresenterLike } from "./interface";

/**
 * Legacy presenter compatibility surface.
 *
 * The daemon owns all remote-control state and long-lived channel runtimes;
 * Electron only forwards existing presenter calls to typed daemon routes.
 */
export class RemoteControlPresenter extends RemoteControlRouteClient implements RemoteControlPresenterLike {
  constructor() {
    super((route, input) => invokeDaemonRoute(route, input));
  }

  async initialize(): Promise<void> {}

  async destroy(): Promise<void> {}
}
