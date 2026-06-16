import type { ConnectionState } from "@shared/contracts/connection";
import { getRuntimeConnectionState, subscribeRuntimeConnectionState } from "./runtime";

export function createConnectionClient() {
  function getState(): ConnectionState {
    return getRuntimeConnectionState();
  }

  function onStateChange(listener: (state: ConnectionState) => void): () => void {
    return subscribeRuntimeConnectionState(listener);
  }

  return {
    getState,
    onStateChange,
  };
}

export type ConnectionClient = ReturnType<typeof createConnectionClient>;
