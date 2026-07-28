import type { ArgosEventName, ArgosEventPayload } from "./events";
import type { ArgosRouteInput, ArgosRouteName, ArgosRouteOutput } from "./routes";
import type { WorkspaceEntry } from "@argos/shared/workspaceConfig";

export type RemotePairingProgressStage =
  | "parsing"
  | "reaching"
  | "exchanging"
  | "authenticating"
  | "storing"
  | "connecting"
  | "events"
  | "handshaking"
  | "capabilities";

export interface ArgosBridge {
  invoke<T extends ArgosRouteName>(routeName: T, input: ArgosRouteInput<T>): Promise<ArgosRouteOutput<T>>;
  on<T extends ArgosEventName>(eventName: T, listener: (payload: ArgosEventPayload<T>) => void): () => void;
  workspace?: {
    list: () => WorkspaceEntry[];
    getActive: () => WorkspaceEntry | undefined;
    add: (entry: Omit<WorkspaceEntry, "id" | "createdAt">) => WorkspaceEntry;
    remove: (
      id: string,
      revokeRemoteSession?: boolean,
    ) => Promise<{ localRemoved: boolean; remoteRevoked: boolean | null }>;
    rename: (id: string, name: string) => void;
    updateEndpoint: (id: string, remoteUrl: string) => Promise<void>;
    switchTo: (id: string) => Promise<void>;
    discardCredential?: (credentialRef: string, revokeRemoteSession?: boolean) => Promise<void>;
    pairRemote?: (
      pairingUrl: string,
      onProgress?: (stage: RemotePairingProgressStage) => void,
    ) => Promise<{
      ok: boolean;
      credentialRef?: string;
      remoteUrl?: string;
      sessionId?: string;
      environmentId?: string;
      serverVersion?: string;
      protocolVersion?: number;
      runtimeKind?: "daemon";
      capabilities?: string[];
      error?: { code?: string; message?: string };
    }>;
  };
}
