import { useEffect, useState } from "react";
import { createSessionClient } from "#api/SessionClient";

const sessionClient = createSessionClient();

/**
 * Queries `session/status` for the active ACP session. Returns the raw
 * status string ("in_memory" | "saved" | agent-defined) or null when the
 * agent doesn't support the status capability or the session isn't ACP.
 */
export function useAcpSessionStatus(
  conversationId: string,
  isAcpSession: boolean,
  /** True while a turn runs; the status is re-queried each time it settles. */
  turnActive = false,
): string | null {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    // Query between turns: the agent may bind or persist the session only
    // once a turn has run, so each settle refreshes the chip.
    if (!isAcpSession || !conversationId || turnActive) return;
    let cancelled = false;
    sessionClient
      .getAcpSessionStatus(conversationId)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, isAcpSession, turnActive]);

  return status;
}
