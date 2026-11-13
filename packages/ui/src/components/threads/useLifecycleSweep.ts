import { useEffect } from "react";
import { useSelector } from "@tanstack/react-store";
import { createSessionClient } from "#api/SessionClient";
import { archiveSession, mapToUISession, sessionStore } from "#/stores/ui/session";
import { lifecycleContext, notifySessionDeleted, threadSidebarStore } from "#/stores/ui/threadSidebar";
import { planLifecycleSweep, type LifecycleSettings } from "./threadSidebarLogic";

const SWEEP_INTERVAL_MS = 30 * 60_000;
const sessionClient = createSessionClient();
let sweepInFlight = false;

/**
 * One settle → archive → delete pass (docs/features/thread-archive). Reads the
 * complete session list (archived included) so threads on unloaded sidebar
 * pages are covered; statuses go through the UI mapping so running threads
 * are never mistaken for idle ones.
 */
export async function runLifecycleSweep(settings: LifecycleSettings): Promise<void> {
  if (sweepInFlight) return;
  sweepInFlight = true;
  try {
    const { sessions } = await sessionClient.list({});
    const state = threadSidebarStore.state;
    const plan = planLifecycleSweep(
      sessions.map(mapToUISession),
      lifecycleContext({ ...state, lifecycleSettings: settings }, Date.now()),
      settings,
      sessionStore.state.activeSessionId,
    );
    for (const id of plan.archive) {
      try {
        await archiveSession(id);
      } catch (archiveError) {
        console.warn(`[threadSidebar] Auto-archive failed for ${id}:`, archiveError);
      }
    }
    for (const id of plan.delete) {
      try {
        await sessionClient.deleteSession(id);
        notifySessionDeleted(id);
      } catch (deleteError) {
        console.warn(`[threadSidebar] Auto-delete failed for ${id}:`, deleteError);
      }
    }
  } catch (sweepError) {
    console.warn("[threadSidebar] Lifecycle sweep failed:", sweepError);
  } finally {
    sweepInFlight = false;
  }
}

/** Runs the sweep on mount, whenever the timers change, and every 30 minutes. */
export function useLifecycleSweep(enabled: boolean): void {
  const settings = useSelector(threadSidebarStore, (state) => state.lifecycleSettings);
  const settingsLoaded = useSelector(threadSidebarStore, (state) => state.lifecycleLoaded);
  const initialPageLoaded = useSelector(sessionStore, (state) => state.hasLoadedInitialPage);
  useEffect(() => {
    if (!enabled || !settingsLoaded || !initialPageLoaded) return;
    void runLifecycleSweep(settings);
    const interval = window.setInterval(() => void runLifecycleSweep(settings), SWEEP_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, settingsLoaded, initialPageLoaded, settings]);
}
