import type { ArgosBridge } from "@shared/contracts/bridge";
import type { ArgosRouteInput, ArgosRouteName, ArgosRouteOutput } from "@shared/contracts/routes";

export function getArgosBridge(): ArgosBridge {
  if (!window.argos) {
    throw new Error("window.argos is not available");
  }

  return window.argos;
}

export async function invokeArgosRoute<T extends ArgosRouteName>(
  routeName: T,
  input: ArgosRouteInput<T>,
): Promise<ArgosRouteOutput<T>> {
  return await getArgosBridge().invoke(routeName, input);
}
