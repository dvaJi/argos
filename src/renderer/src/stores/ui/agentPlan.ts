import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import type { DeepchatEventPayload } from "@shared/contracts/events";

export type AgentPlanViewSnapshot = DeepchatEventPayload<"chat.plan.updated">;

function loadCollapsedFromStorage(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem("agent-plan-collapsed");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistCollapsed(value: Record<string, boolean>): void {
  try {
    localStorage.setItem("agent-plan-collapsed", JSON.stringify(value));
  } catch {}
}

export const agentPlanStore = new Store({
  snapshots: {} as Record<string, AgentPlanViewSnapshot>,
  collapsedBySession: loadCollapsedFromStorage(),
});

export const applySnapshot = (snapshot: AgentPlanViewSnapshot): void => {
  const current = agentPlanStore.state.snapshots[snapshot.sessionId];
  if (current && current.revision >= snapshot.revision) return;

  agentPlanStore.setState((prev) => ({
    ...prev,
    snapshots: { ...prev.snapshots, [snapshot.sessionId]: snapshot },
  }));
};

export const clear = (sessionId: string): void => {
  if (!agentPlanStore.state.snapshots[sessionId]) return;
  const next = { ...agentPlanStore.state.snapshots };
  delete next[sessionId];
  agentPlanStore.setState((prev) => ({ ...prev, snapshots: next }));
};

export const isCollapsed = (sessionId: string): boolean => agentPlanStore.state.collapsedBySession[sessionId] !== false;

export const setCollapsed = (sessionId: string, collapsed: boolean): void => {
  const next = { ...agentPlanStore.state.collapsedBySession, [sessionId]: collapsed };
  persistCollapsed(next);
  agentPlanStore.setState((prev) => ({ ...prev, collapsedBySession: next }));
};

export const toggleCollapsed = (sessionId: string): void => {
  setCollapsed(sessionId, !isCollapsed(sessionId));
};

export function useAgentPlanStore() {
  return useStore(agentPlanStore);
}
