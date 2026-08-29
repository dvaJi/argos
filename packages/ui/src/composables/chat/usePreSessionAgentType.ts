import { useStore } from "@tanstack/react-store";
import { agentStore } from "#/stores/ui/agent";
import { sessionStore } from "#/stores/ui/session";
import { resolveEffectiveAgent } from "#/lib/effectiveAgent";

/**
 * Type of the agent a new thread would target while composing (no active
 * session): the explicit selection, else the active session's agent, else the
 * first enabled Argos agent — the same priority as `AgentSwitcher` and the
 * new-thread page. `null` when nothing is enabled.
 *
 * Callers that can also be mounted inside an active session must branch on the
 * session first; this hook only answers the pre-session question.
 */
export function usePreSessionAgentType(): "argos" | "acp" | null {
  const agentState = useStore(agentStore);
  const sessionState = useStore(sessionStore);
  return (() => {
    const activeSession = sessionState.sessions.find((s) => s.id === sessionState.activeSessionId) ?? null;
    return (
      resolveEffectiveAgent({
        agents: agentState.agents,
        selectedAgentId: agentState.selectedAgentId,
        activeSessionAgentId: activeSession?.agentId ?? null,
      })?.type ?? null
    );
  })();
}
