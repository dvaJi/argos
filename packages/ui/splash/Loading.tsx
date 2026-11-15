import { useEffect, useState } from "react";
import logoSrc from "../src/assets/logo.png";
import logoDarkSrc from "../src/assets/logo-dark.png";
import { onIpcChannel } from "#api/runtime";
import "./loading.css";

type SplashActivityStatus = "running" | "completed" | "failed";
type SplashStage = "starting" | "opening" | "failed";

interface SplashActivityItem {
  key: string;
  name: string;
  status: SplashActivityStatus;
}

interface SplashUpdatePayload {
  activities?: SplashActivityItem[];
  progress?: number;
  stage?: SplashStage;
}

interface SplashState {
  activities: SplashActivityItem[];
  progress: number;
  stage: SplashStage;
}

const ACTIVITY_LABELS: Record<string, string> = {
  "config-initialization": "Loading configuration",
  "daemon-sidecar": "Starting background service",
  "electron-adapter-init": "Preparing desktop integration",
  "protocol-registration": "Registering app protocol",
  "presenter-initialization": "Loading services",
  "event-listener-setup": "Connecting events",
  "window-creation": "Preparing window",
  "tray-setup": "Starting tray",
  "scheduled-tasks-start": "Resuming scheduled tasks",
};

const getActivityLabel = (name: string) =>
  ACTIVITY_LABELS[name] ??
  name
    .split("-")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");

/** One honest line describing what startup is doing right now. */
function getStatusLabel({ activities, stage }: SplashState): string {
  if (stage === "failed") {
    return "Something went wrong while starting";
  }
  if (stage === "opening") {
    return "Opening workspace";
  }
  const running = activities.find((activity) => activity.status === "running");
  return running ? getActivityLabel(running.name) : "Starting Argos";
}

const INITIAL_STATE: SplashState = { activities: [], progress: 0, stage: "starting" };

export default function Loading() {
  const [state, setState] = useState<SplashState>(INITIAL_STATE);

  useEffect(() => {
    return onIpcChannel("splash-update", (_event: unknown, payload: SplashUpdatePayload) => {
      setState((previous) => ({
        activities: payload.activities ?? [],
        // Never move backwards: a late, lower value would make the bar jump.
        progress: Math.max(previous.progress, Math.min(100, Math.max(0, payload.progress ?? 0))),
        stage: payload.stage ?? previous.stage,
      }));
    });
  }, []);

  const label = getStatusLabel(state);
  const failed = state.stage === "failed";
  // Keep a sliver visible so the track never reads as empty/broken.
  const fill = Math.max(state.progress, 4);

  return (
    <main className="splash" data-stage={state.stage} data-testid="splash-stage">
      <div className="splash__brand" data-testid="splash-brand-mark">
        <span className="splash__halo" aria-hidden="true" />
        <img className="splash__logo splash__logo--dark" src={logoDarkSrc} alt="" draggable={false} />
        <img className="splash__logo splash__logo--light" src={logoSrc} alt="" draggable={false} />
      </div>

      <h1 className="splash__wordmark">Argos</h1>

      <div className="splash__progress-block">
        <div
          className="splash__progress"
          role="progressbar"
          aria-label="Startup progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.progress)}
          data-testid="splash-progress"
        >
          <span className="splash__progress-fill" style={{ transform: `scaleX(${fill / 100})` }} />
          {!failed && <span className="splash__progress-sheen" aria-hidden="true" />}
        </div>

        <p className="splash__status" role="status" aria-live="polite" data-testid="splash-status">
          <span key={label} className="splash__status-text">
            {label}
          </span>
        </p>
      </div>
    </main>
  );
}
