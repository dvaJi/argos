import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import type { ArgosRouteInput, ArgosRouteName, ArgosRouteOutput } from "@argos/shared-contracts/routes";

export function getArgosBridge(): ArgosBridge {
  if (!window.argos) {
    throw new Error("window.argos is not available");
  }

  return window.argos;
}

async function invokeArgosRoute<T extends ArgosRouteName>(
  routeName: T,
  input: ArgosRouteInput<T>,
): Promise<ArgosRouteOutput<T>> {
  return await getArgosBridge().invoke(routeName, input);
}
