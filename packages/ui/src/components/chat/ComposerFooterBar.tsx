import ComposerModelPicker from "./ComposerModelPicker";
import ComposerEffortPicker from "./ComposerEffortPicker";
import ComposerModePicker from "./ComposerModePicker";
import ComposerAdvancedSettings from "../chat-input/ComposerAdvancedSettings";
import AcpComposerControls from "./AcpComposerControls";
import { Separator } from "#shadcn/components/ui/separator";
import { useSessionStore, getActiveSession, getHasActiveSession } from "#/stores/ui/session";
import { usePreSessionAgentType } from "#/composables/chat/usePreSessionAgentType";

const ComposerFooterBar = () => {
  // Subscribe so the bar re-renders when the active session / agent changes.
  const sessionStoreState = useSessionStore();
  void sessionStoreState;
  const preSessionAgentType = usePreSessionAgentType();

  const hasActiveSession = getHasActiveSession();
  const activeSession = getActiveSession();
  const isAcp = hasActiveSession ? activeSession?.providerId === "acp" : preSessionAgentType === "acp";

  return (
    <div className="flex items-center gap-1" data-testid="composer-footer-bar">
      <ComposerModelPicker />
      {isAcp ? (
        // ACP sessions own their agent/model/mode chips here; effort and
        // permission pickers are argos-session concepts and stay hidden.
        <AcpComposerControls />
      ) : (
        <>
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
