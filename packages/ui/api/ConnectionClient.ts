import type { ConnectionState } from "@argos/shared-contracts/connection";
import { getRuntimeConnectionState, subscribeRuntimeConnectionState } from "./runtime";

export type PairingTokenResult =
  | { ok: true; pairingUrl: string; pairingCode?: string; expiresAt: number }
  | { ok: false; error: { code?: string; message?: string } };

/**
 * Request a one-time browser-access pairing token from the daemon.
 * The settings renderer is served by the daemon (same origin; `/api` is proxied
 * to the daemon in dev), so this resolves directly against the daemon's auth
 * endpoint without going through Electron IPC.
 */
export async function requestPairingToken(): Promise<PairingTokenResult> {
  const response = await fetch("/api/v1/pair/token", { method: "POST" });
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: "daemon_unreachable",
        message: `Pairing endpoint returned ${response.status}`,
      },
    };
  }
  return (await response.json()) as PairingTokenResult;
}

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
    requestPairingToken,
  };
}

type ConnectionClient = ReturnType<typeof createConnectionClient>;
