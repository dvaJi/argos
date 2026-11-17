import ComposerModelPicker from "./ComposerModelPicker";
import ComposerEffortPicker from "./ComposerEffortPicker";
import ComposerModePicker from "./ComposerModePicker";
import ComposerAdvancedSettings from "../chat-input/ComposerAdvancedSettings";
import AcpComposerControls from "./AcpComposerControls";
import { Separator } from "#shadcn/components/ui/separator";
import { useSessionStore, getActiveSession, getHasActiveSession } from "#/stores/ui/session";
import { usePreSessionAgentType } from "#/composables/chat/usePreSessionAgentType";

interface ComposerFooterBarProps {
  /** Bound ACP draft session while composing a new thread (enables config chips pre-session). */
  acpDraftSessionId?: string | null;
}

const ComposerFooterBar = ({ acpDraftSessionId = null }: ComposerFooterBarProps) => {
  // Subscribe so the bar re-renders when the active session / agent changes.
  const sessionStoreState = useSessionStore();
  void sessionStoreState;
  const preSessionAgentType = usePreSessionAgentType();

  const hasActiveSession = getHasActiveSession();
  const activeSession = getActiveSession();
  const isAcp = hasActiveSession ? activeSession?.providerId === "acp" : preSessionAgentType === "acp";

  return (
    <div className="flex items-center gap-1" data-testid="composer-footer-bar">
      {isAcp ? (
        // ACP: the agent is picked in AgentSwitcher; the footer shows only the
        // agent's own config chips (model / mode / …). Effort and permission
        // pickers are argos-session concepts and stay hidden.
        <AcpComposerControls acpDraftSessionId={acpDraftSessionId} />
      ) : (
        <>
          <ComposerModelPicker />
          <Separator orientation="vertical" className="mx-1 h-4 bg-border/60" />
          <ComposerEffortPicker />
          <Separator orientation="vertical" className="mx-1 h-4 bg-border/60" />
          <ComposerModePicker />
          <Separator orientation="vertical" className="mx-1 h-4 bg-border/60" />
          {/* Advanced settings (tools / sub-agents / MCP) — renders nothing
              for ACP contexts. */}
          <ComposerAdvancedSettings />
        </>
      )}
    </div>
  );
};

export default ComposerFooterBar;
