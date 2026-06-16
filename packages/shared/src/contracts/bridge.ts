import type { ArgosEventName, ArgosEventPayload } from "./events";
import type { ArgosRouteInput, ArgosRouteName, ArgosRouteOutput } from "./routes";

export interface ArgosBridge {
  invoke<T extends ArgosRouteName>(routeName: T, input: ArgosRouteInput<T>): Promise<ArgosRouteOutput<T>>;
  on<T extends ArgosEventName>(eventName: T, listener: (payload: ArgosEventPayload<T>) => void): () => void;
}
