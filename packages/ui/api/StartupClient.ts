import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import type { ArgosEventPayload } from "@argos/shared-contracts/events";
import { startupWorkloadChangedEvent } from "@argos/shared-contracts/events";
import { startupGetBootstrapRoute } from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

export function createStartupClient(bridge: ArgosBridge = getArgosBridge()) {
  async function getBootstrap() {
    const result = await bridge.invoke(startupGetBootstrapRoute.name, {});
    return result.bootstrap;
  }

  function onWorkloadChanged(listener: (payload: ArgosEventPayload<"startup.workload.changed">) => void) {
    return bridge.on(startupWorkloadChangedEvent.name, listener);
  }

  return {
    getBootstrap,
    onWorkloadChanged,
  };
}

type StartupClient = ReturnType<typeof createStartupClient>;
