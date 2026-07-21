import { useCallback, useEffect, useState } from "react";
import logoSrc from "../src/assets/logo.png";
import logoDarkSrc from "../src/assets/logo-dark.png";
import { TextShimmer } from "../components/agent-elements/text-shimmer";
import "./loading.css";

type SplashActivityStatus = "running" | "completed" | "failed";

interface SplashActivityItem {
  key: string;
  name: string;
  status: SplashActivityStatus;
}

interface SplashUpdatePayload {
  activities?: SplashActivityItem[];
}

const ACTIVITY_LABELS: Record<string, string> = {
  "config-initialization": "Loading configuration",
  "database-initialization": "Opening local database",
  "protocol-registration": "Registering app protocol",
  "presenter-initialization": "Initializing presenters",
  "event-listener-setup": "Attaching event listeners",
  "acp-registry-migration": "Migrating registry data",
  "window-creation": "Creating main window",
  "tray-setup": "Starting tray integration",
  "legacy-import": "Queueing legacy import",
  "usage-stats-backfill": "Queueing usage stats backfill",
  "startup-error": "Startup error",
};

const getActivityLabel = (name: string) => {
  if (ACTIVITY_LABELS[name]) {
    return ACTIVITY_LABELS[name];
  }
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

/**
 * Emblem — the calm, logo-led centerpiece.
 * The real Argos logo (logo.png / logo-dark.png) materializes with a soft
 * blur-in. A single cyan "memory pulse" arc travels once around the mark
 * (like context being loaded) and a center glow breathes gently behind it.
 * No particles, sparkles, spinners or fake progress.
 */
function Emblem() {
  return (
    <div className="splash-emblem" data-testid="splash-brand-mark">
      <span className="splash-glow" aria-hidden="true" />
      <svg className="splash-pulse-ring" viewBox="0 0 160 160" fill="none" aria-hidden="true">
        <circle className="splash-pulse-ring__track" cx="80" cy="80" r="54" />
        <circle className="splash-pulse-ring__arc" cx="80" cy="80" r="54" pathLength={100} />
      </svg>
      <div className="splash-logo" aria-hidden="true">
        <img className="splash-logo__img splash-logo__img--dark" src={logoDarkSrc} alt="" draggable={false} />
        <img className="splash-logo__img splash-logo__img--light" src={logoSrc} alt="" draggable={false} />
      </div>
    </div>
  );
}

function StatusList({ activities }: { activities: SplashActivityItem[] }) {
  return (
    <div className="splash-status" data-testid="splash-status">
      {activities.length === 0 ? (
        <div className="splash-status__row splash-status__row--pending">
          <span className="splash-status__glyph" aria-hidden="true" />
          <span className="splash-status__label">
            <TextShimmer as="span" duration={1.8}>
              Starting Argos…
            </TextShimmer>
          </span>
        </div>
      ) : (
        activities.map((activity, index) => {
          const rowClass = [
            "splash-status__row",
            activity.status === "running" ? "splash-status__row--active" : "",
            activity.status === "completed" ? "splash-status__row--done" : "",
            activity.status === "failed" ? "splash-status__row--failed" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const label = getActivityLabel(activity.name);
          return (
            <div key={activity.key} className={rowClass} style={{ "--splash-row-i": index } as React.CSSProperties}>
              <span className="splash-status__glyph" aria-hidden="true" />
              <span className="splash-status__label">
                {activity.status === "running" ? (
                  <TextShimmer as="span" duration={1.8}>
                    {label}
                  </TextShimmer>
                ) : (
                  label
                )}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function Loading() {
  const [activities, setActivities] = useState<SplashActivityItem[]>([]);

  const handleSplashUpdate = useCallback((_event: unknown, payload: SplashUpdatePayload) => {
    setActivities(payload.activities?.slice(0, 3) ?? []);
  }, []);

  useEffect(() => {
    window.electron?.ipcRenderer?.on?.("splash-update", handleSplashUpdate);
    return () => {
      window.electron?.ipcRenderer?.removeListener?.("splash-update", handleSplashUpdate);
    };
  }, [handleSplashUpdate]);

  return (
    <div className="splash-shell">
      <div className="splash-stage" data-testid="splash-stage">
        <Emblem />
        <h1 className="splash-wordmark">Argos</h1>
        <StatusList activities={activities} />
      </div>
    </div>
  );
}
