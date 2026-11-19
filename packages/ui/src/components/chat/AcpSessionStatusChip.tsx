import { Icon } from "@iconify/react";
import { useAcpSessionStatus } from "../../hooks/useAcpSessionStatus";

/**
 * Compact chip showing the ACP session's agent-side status (`in_memory` or
 * `saved`) as a diagnostic indicator. Hidden for non-ACP sessions or when
 * the agent doesn't support `session/status`.
 */
export default function AcpSessionStatusChip({
  conversationId,
  isAcpSession,
}: {
  conversationId: string;
  isAcpSession: boolean;
}) {
  const status = useAcpSessionStatus(conversationId, isAcpSession);
  if (!status || !isAcpSession) return null;

  const label = status === "in_memory" ? "In memory" : status === "saved" ? "Saved" : status;
  return (
    <span
      data-testid="acp-session-status"
      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
    >
      <Icon icon="lucide:database" className="size-3" />
      {label}
    </span>
  );
}
