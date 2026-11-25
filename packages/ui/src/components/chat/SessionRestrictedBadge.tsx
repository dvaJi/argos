import { Icon } from "@iconify/react";
import { useSessionAgentMode } from "#/composables/chat/useComposerGenerationControls";

export default function SessionRestrictedBadge({ sessionId }: { sessionId: string }) {
  const { restricted } = useSessionAgentMode(sessionId);
  if (!restricted) return null;
  return (
    <div
      className="mx-auto mb-2 flex w-full max-w-4xl items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200"
      title="This run was started by outside content. Read-only tools apply."
      data-testid="session-restricted-badge"
    >
      <Icon icon="lucide:shield-alert" className="h-3.5 w-3.5 shrink-0" />
      <span>Restricted run: outside content can only use read-only tools.</span>
    </div>
  );
}
