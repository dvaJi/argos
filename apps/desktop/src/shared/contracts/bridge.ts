import type { ArgosEventName, ArgosEventPayload } from "./events";
import type { ArgosRouteInput, ArgosRouteName, ArgosRouteOutput } from "./routes";
import type { WorkspaceEntry } from "../workspaceConfig";

export interface ArgosBridge {
  invoke<T extends ArgosRouteName>(routeName: T, input: ArgosRouteInput<T>): Promise<ArgosRouteOutput<T>>;
  on<T extends ArgosEventName>(eventName: T, listener: (payload: ArgosEventPayload<T>) => void): () => void;
  workspace?: {
    switchTo: (id: string) => Promise<void>;
    list: () => WorkspaceEntry[];
    getActive: () => WorkspaceEntry | undefined;
    add: (entry: Omit<WorkspaceEntry, "id" | "createdAt">) => WorkspaceEntry;
    remove: (id: string) => void;
    rename: (id: string, name: string) => void;
  };
}
