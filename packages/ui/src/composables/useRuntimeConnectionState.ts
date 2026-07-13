import { useEffect, useState } from "react";
import type { ConnectionState } from "@argos/shared-contracts/connection";
import { getRuntimeConnectionState, subscribeRuntimeConnectionState } from "#api/runtime";

/** Tracks whether the preload bridge can currently deliver daemon-backed routes. */
export function useRuntimeConnectionState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(() => getRuntimeConnectionState());

  useEffect(() => subscribeRuntimeConnectionState(setState), []);

  return state;
}
