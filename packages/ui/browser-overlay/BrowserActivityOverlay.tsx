import { useEffect, useRef, useState } from "react";
import type { YoBrowserActivityPayload } from "@argos/shared/types/browser";
import "./BrowserActivityOverlay.css";

const HALO_SETTLE_MS = 900;
const ACTIVITY_SAFETY_TTL_MS = 2500;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function BrowserActivityOverlay() {
  const [haloVisible, setHaloVisible] = useState(false);
  const pendingActivitiesRef = useRef(new Map<string, number>());
  const activityCleanupTimersRef = useRef(new Map<string, number>());
  const haloFadeTimerRef = useRef<number | null>(null);

  const setHaloActive = () => {
    if (haloFadeTimerRef.current !== null) {
      window.clearTimeout(haloFadeTimerRef.current);
      haloFadeTimerRef.current = null;
    }
    setHaloVisible(true);
  };

  const scheduleHaloFade = () => {
    if (pendingActivitiesRef.current.size > 0) return;

    if (haloFadeTimerRef.current !== null) {
      window.clearTimeout(haloFadeTimerRef.current);
    }

    haloFadeTimerRef.current = window.setTimeout(() => {
      setHaloVisible(false);
      haloFadeTimerRef.current = null;
    }, HALO_SETTLE_MS);
  };

  const completeActivity = (id: string) => {
    pendingActivitiesRef.current.delete(id);
    const cleanupTimer = activityCleanupTimersRef.current.get(id);
    if (cleanupTimer !== undefined) {
      window.clearTimeout(cleanupTimer);
      activityCleanupTimersRef.current.delete(id);
    }
    scheduleHaloFade();
  };

  const startActivity = (payload: YoBrowserActivityPayload) => {
    const existingCleanupTimer = activityCleanupTimersRef.current.get(payload.id);
    if (existingCleanupTimer !== undefined) {
      window.clearTimeout(existingCleanupTimer);
      activityCleanupTimersRef.current.delete(payload.id);
    }

    pendingActivitiesRef.current.set(payload.id, Date.now());
    setHaloActive();

    const cleanupTimer = window.setTimeout(() => {
      activityCleanupTimersRef.current.delete(payload.id);
      completeActivity(payload.id);
    }, ACTIVITY_SAFETY_TTL_MS);
    activityCleanupTimersRef.current.set(payload.id, cleanupTimer);
  };

  const handleActivity = (payload: YoBrowserActivityPayload) => {
    if (payload.phase === "started") {
      startActivity(payload);
      return;
    }
    completeActivity(payload.id);
  };

  const handleActivityRef = useRef(handleActivity);
  useEffect(() => {
    handleActivityRef.current = handleActivity;
  }, [handleActivity]);

  useEffect(() => {
    const stopActivityListener = window.yoBrowserOverlay.onActivityChanged((payload) =>
      handleActivityRef.current(payload),
    );

    return () => {
      stopActivityListener();

      if (haloFadeTimerRef.current !== null) {
        window.clearTimeout(haloFadeTimerRef.current);
      }

      activityCleanupTimersRef.current.forEach(window.clearTimeout);
      activityCleanupTimersRef.current.clear();
    };
  }, []);

  return (
    <div className={`activity-overlay ${reducedMotion ? "reduced" : ""}`} aria-hidden="true">
      <div className={`halo ${haloVisible ? "active" : ""}`} />
    </div>
  );
}
