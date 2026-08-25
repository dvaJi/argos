import { RemoteControlRouteClient } from "@argos/client-sdk";
import { invokeDaemonRoute } from "#/routes/daemonRouteProxy";
import type { RemoteControlPresenterLike } from "./interface";

/**
 * Remote-control shell facade: extends the typed daemon route client and
 * satisfies the Electron-side port surface. State and channel runtimes are
 * daemon-owned.
 */
export class RemoteControlPresenter extends RemoteControlRouteClient implements RemoteControlPresenterLike {
  constructor() {
    super((route, input) => invokeDaemonRoute(route, input));
  }

  async initialize(): Promise<void> {}

  async destroy(): Promise<void> {}
}
