import { useEffect, useState } from "react";
import { createSessionClient } from "#api/SessionClient";

const sessionClient = createSessionClient();

/**
 * Queries `session/status` for the active ACP session. Returns the raw
 * status string ("in_memory" | "saved" | agent-defined) or null when the
 * agent doesn't support the status capability or the session isn't ACP.
 */
export function useAcpSessionStatus(conversationId: string, isAcpSession: boolean): string | null {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isAcpSession || !conversationId) return;
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
  }, [conversationId, isAcpSession]);

  return status;
}
